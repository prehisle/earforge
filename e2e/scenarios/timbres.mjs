// 音色：在页面里用 OfflineAudioContext 离线渲染每种合成音色（单音、四音和弦、短旋律），
// 检查不是静音、峰值 < 1、响度（RMS）与合成钢琴相差不超过 ±6 dB，并导出 WAV 供人试听
// （e2e-output/timbres/wav/<音色>-note.wav、-chord.wav、-phrase.wav）；
// 设置页逐个选择音色（含采样乐器：下载被拦截，检验回退）→ 刷新后仍保持；随机模式下连续几题换乐器（徽标）。
// 可选：E2E_SAMPLED=1 联网下载采样乐器并一起测量（校准采样增益用，默认不联网）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickText, readStore, run, sleep } from '../lib/harness.mjs';

const SYNTH = ['piano', 'epiano', 'sine', 'organ', 'guitar', 'strings', 'flute', 'marimba'];
const SAMPLED = ['sampled', 'sampled-guitar', 'sampled-violin', 'sampled-flute'];
const withSampled = process.env.E2E_SAMPLED === '1';

/** 单声道 16 位 WAV */
function wav(samples, sampleRate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return buf;
}

const db = (x) => 20 * Math.log10(x);

await run(async (t) => {
  await t.launch();
  const page = await t.open({
    tag: 'timbres',
    allowErrors: /Failed to load resource|ERR_FAILED|blocked by e2e/,
    init: () => {
      globalThis.__EARFORGE_TEST__ = true;
    },
  });

  // ───── 1. 离线渲染与测量 ─────
  if (withSampled) {
    const ok = await page.evaluate(
      (ids) => Promise.all(ids.map((id) => globalThis.__earforgeAudio.loadSampler(id))),
      SAMPLED,
    );
    t.log('采样下载', JSON.stringify(ok));
  }
  const timbres = withSampled ? [...SYNTH, ...SAMPLED] : SYNTH;
  const results = await page.evaluate(async (ids) => {
    const audio = globalThis.__earforgeAudio;
    const SR = 48000;
    const cases = {
      note: [{ notes: [60], time: 0, dur: 1, velocity: 0.7 }],
      chord: [{ notes: [48, 60, 64, 67], time: 0, dur: 1.5, velocity: 0.7 }],
      phrase: [
        ...[60, 62, 64, 65, 67, 69, 71, 72].map((n, i) => ({ notes: [n], time: i * 0.35, dur: 0.33, velocity: 0.7 })),
        { notes: [55, 60, 64, 67, 72], time: 2.9, dur: 1.6, velocity: 0.7 },
        { notes: [40], time: 4.7, dur: 1, velocity: 0.7 },
        { notes: [84], time: 5.8, dur: 1, velocity: 0.7 },
      ],
    };
    const out = {};
    for (const id of ids) {
      out[id] = {};
      for (const [name, events] of Object.entries(cases)) {
        const buf = await audio.renderOffline(events, id, SR);
        const d = buf.getChannelData(0);
        // 响度：按时值的范围（音响着的时候）算 RMS；峰值看全长
        const end = Math.min(d.length, Math.round(Math.max(...events.map((e) => e.time + e.dur)) * SR));
        let peak = 0;
        let sum = 0;
        let finite = true;
        for (let i = 0; i < d.length; i++) {
          if (!Number.isFinite(d[i])) finite = false;
          peak = Math.max(peak, Math.abs(d[i]));
          if (i < end) sum += d[i] * d[i];
        }
        // 前 0.5 秒的 RMS（音头的响度，持续音与衰减音都能比较）
        let head = 0;
        const hn = Math.min(end, SR / 2);
        for (let i = 0; i < hn; i++) head += d[i] * d[i];
        // 音高（只看单音 C4）：0.1–0.25 秒（槌击的高分音已衰减、颤音还很浅）的归一化自相关周期，抛物线插值
        let f0 = null;
        if (name === 'note') {
          const from = Math.round(SR * 0.1);
          const n = Math.round(SR * 0.15);
          const r = (lag) => {
            let s = 0;
            let e0 = 0;
            let e1 = 0;
            for (let i = from; i < from + n; i++) {
              s += d[i] * d[i + lag];
              e0 += d[i] * d[i];
              e1 += d[i + lag] * d[i + lag];
            }
            return s / Math.sqrt(e0 * e1 + 1e-20);
          };
          let best = Math.round(SR / 400);
          let bestR = -Infinity;
          for (let lag = best; lag < SR / 150; lag++) {
            const v = r(lag);
            if (v > bestR) [best, bestR] = [lag, v];
          }
          const [a, b, c] = [r(best - 1), bestR, r(best + 1)];
          f0 = SR / (best + (0.5 * (a - c)) / (a - 2 * b + c));
        }
        out[id][name] = {
          f0,
          peak,
          rms: Math.sqrt(sum / end),
          head: Math.sqrt(head / hn),
          finite,
          sr: SR,
          // 下采样到 24 kHz 传回 node 写 WAV（够人耳试听）
          pcm: Array.from(d.filter((_, i) => i % 2 === 0), (x) => Math.round(x * 10000) / 10000),
        };
      }
    }
    return out;
  }, timbres);

  const wavDir = join(t.out, 'wav');
  mkdirSync(wavDir, { recursive: true });
  const ref = results.piano;
  const table = [];
  for (const id of timbres) {
    for (const name of ['note', 'chord', 'phrase']) {
      const r = results[id][name];
      writeFileSync(join(wavDir, `${id}-${name}.wav`), wav(r.pcm, r.sr / 2));
      const rel = db(r.rms / ref[name].rms);
      table.push(`${id.padEnd(15)} ${name.padEnd(6)} peak ${r.peak.toFixed(3)}  rms ${r.rms.toFixed(4)} (${rel >= 0 ? '+' : ''}${rel.toFixed(1)} dB)  head ${r.head.toFixed(4)}`);
      t.check(r.finite, `${id} ${name}：没有 NaN / Infinity`);
      t.check(r.rms > 0.01, `${id} ${name}：有声音（RMS ${r.rms.toFixed(4)}）`);
      t.check(r.peak < 1, `${id} ${name}：不削波（峰值 ${r.peak.toFixed(3)}）`);
      // 单音与四音和弦应在软限幅的线性段附近（0.8 以上开始压，0.95 以上说明压得较重）
      if (name !== 'phrase') t.check(r.peak < 0.95, `${id} ${name}：峰值 ${r.peak.toFixed(3)} 没有被重度限幅`);
      if (r.f0 !== null) {
        const cents = 1200 * Math.log2(r.f0 / 261.6256);
        table.push(`${''.padEnd(15)} pitch  ${r.f0.toFixed(2)} Hz (${cents >= 0 ? '+' : ''}${cents.toFixed(1)} cents)`);
        if (!id.startsWith('sampled')) t.check(Math.abs(cents) < 5, `${id}：C4 音高准确（${cents.toFixed(1)} 音分）`);
      }
      if (name !== 'phrase') t.check(Math.abs(rel) <= 6, `${id} ${name}：响度与钢琴相差 ${rel.toFixed(1)} dB（±6 dB 内）`);
    }
  }
  t.log(`\n响度（时值内 RMS，相对合成钢琴）：\n${table.join('\n')}\nWAV: ${wavDir}\n`);
  writeFileSync(join(t.out, 'loudness.txt'), `${table.join('\n')}\n`);

  // ───── 2. 设置页逐个选择音色，刷新后保持 ─────
  // 采样乐器不联网：拦截下载，应回退到合成音色、显示下载失败（不影响保存的设置）
  // （采样经 service worker 下载，页面级的请求拦截管不到：直接让页面的 fetch 对采样地址失败）
  if (!withSampled)
    await page.evaluate(() => {
      const f = window.fetch;
      window.fetch = (u, o) => (/tonejs/.test(String(u)) ? Promise.reject(new TypeError('blocked by e2e')) : f(u, o));
    });
  await clickText(page, '设置');
  await sleep(200);
  t.check((await page.$$('.timbre-group')).length === 3, '设置页音色分三组（合成 / 采样 / 随机）');
  const labels = { piano: '钢琴', organ: '风琴', guitar: '吉他', strings: '弦乐', flute: '长笛', marimba: '马林巴', random: '每题随机换乐器' };
  for (const [id, label] of Object.entries({ ...labels, 'sampled-guitar': '采样木吉他' })) {
    await clickText(page, label, '.timbre-group button', id.startsWith('sampled') ? false : true);
    await sleep(150);
    const store = await readStore(page);
    t.check(store?.settings?.timbre === id, `选择「${label}」后保存为 ${id}（${store?.settings?.timbre}）`);
  }
  if (!withSampled) {
    await page.waitForSelector('.sampler-status .error-text', { timeout: 5000 }).catch(() => {});
    t.check(!!(await page.$('.sampler-status .error-text')), '采样下载失败：显示回退提示');
  }
  await clickText(page, '弦乐', '.timbre-group button', true);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  await clickText(page, '设置');
  await sleep(200);
  const pressed = await page.$$eval('.timbre-group button[aria-pressed="true"]', (b) => b.map((x) => x.textContent));
  t.check(pressed.length === 1 && pressed[0] === '弦乐', `刷新后仍选中「弦乐」（${pressed.join(',')}）`);
  t.check((await page.evaluate(() => globalThis.__earforgeAudio.current)) === 'strings', '刷新后引擎使用弦乐');
  await t.shot(page, 'settings-timbres');

  // ───── 3. 随机模式：每题换乐器 ─────
  await clickText(page, '每题随机换乐器', '.timbre-group button', true);
  await sleep(150);
  t.check(!!(await page.$('.onboard-note')), '随机模式显示说明');
  await clickText(page, '返回');
  await clickText(page, '音程识别');
  await clickText(page, '开始练习');
  await sleep(400);
  const seen = [];
  for (let k = 0; k < 6; k++) {
    const badge = await page.$eval('.timbre-badge', (e) => e.textContent).catch(() => null);
    seen.push(badge);
    for (const c of await page.$$('.choice')) {
      if (await page.$('.feedback')) break;
      await c.click();
      await sleep(30);
    }
    await page.waitForSelector('.feedback');
    if (k === 0) await t.shot(page, 'random-badge', { fullPage: false });
    await page.keyboard.press('Enter');
    await sleep(200);
  }
  t.log('随机音色徽标', seen.join(' | '));
  t.check(seen.every((s) => s && s.startsWith('本题音色：')), '随机模式每题显示音色徽标');
  t.check(seen.every((s, i) => i === 0 || s !== seen[i - 1]), '相邻两题的乐器不同');
  t.check(new Set(seen).size >= 3, `6 题里至少 3 种乐器（${new Set(seen).size}）`);
  t.check(!seen.some((s) => s?.includes('采样') || s?.includes('纯音')), '随机不选未下载的采样乐器与纯音');
});
