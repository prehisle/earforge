// 试听与对比 + MIDI：设置页开启（模拟的）MIDI 键盘 → 答错自动试听 → 「你的答案 / 正确答案」→ 答后试听不计分 →
// 答对后试听取消自动跳题 → MIDI 弹琴键作答 → 旋律听写多步对比 → 今日训练 → 深色手机和弦性质
// 原 x.mjs
import { clickText, run, sleep, textOf } from '../lib/harness.mjs';

/** 模拟 Web MIDI 设备 + 统计合成的振荡器数量（判断是否真的发声） */
function fakeMidi() {
  window.__osc = 0;
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    window.__osc++;
    return orig.call(this);
  };
  const input = { name: '模拟键盘 KX-49', state: 'connected', onmidimessage: null };
  const access = { inputs: new Map([['sim', input]]), outputs: new Map(), onstatechange: null };
  navigator.requestMIDIAccess = () => Promise.resolve(access);
  window.__midiSend = (bytes) => input.onmidimessage?.({ data: new Uint8Array(bytes) });
}

await run(async (t) => {
  const page = await t.open({ init: fakeMidi, tag: 'listen' });
  const check = (c, m) => t.check(c, m);
  const text = (sel) => textOf(page, sel);
  const osc = () => page.evaluate(() => window.__osc);

  // ── 1. 设置页：开启 MIDI ──
  await clickText(page, '设置');
  await sleep(100);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // MIDI 面板按内容定位（设置页末尾后来又加了「关于与帮助」面板）
  const midiPanel = () => page.evaluate(() => [...document.querySelectorAll('.panel')].find((p) => p.textContent.includes('MIDI')).textContent);
  const panels = await page.$$('.panel');
  let midiEl = null;
  for (const p of panels) if ((await p.evaluate((e) => e.textContent)).includes('MIDI')) midiEl = p;
  for (const b of await midiEl.$$('button')) if ((await b.evaluate((e) => e.textContent)) === '开') await b.click();
  await sleep(200);
  const mp = await midiPanel();
  check(mp.includes('模拟键盘 KX-49') && mp.includes('已连接'), '设置页显示设备名');
  // 固定 C 调，便于用 MIDI 作答
  await clickText(page, '固定 C 调');
  await t.shot(page, 'x1-settings-midi');
  await clickText(page, '返回');

  // ── 2. 调内音级：故意答错 → 自动试听；答完后点选项试听；回车下一题 ──
  await clickText(page, '调内音级', '.card');
  await clickText(page, '开始练习');
  await page.waitForSelector('.choice');
  await sleep(300);
  check(!!(await page.$('.midi-badge')), 'Quiz 显示 🎹 已连接');
  let wrongDone = false;
  for (let k = 0; k < 20 && !wrongDone; k++) {
    const o0 = await osc();
    await (await page.$$('.choice'))[0].click();
    await sleep(150);
    if (await page.$('.choice.bad')) {
      wrongDone = true;
      check((await osc()) > o0, '答错后自动播放所选答案（新建了振荡器）');
      await t.shot(page, 'x2-degrees-wrong', { fullPage: false });
      const o1 = await osc();
      await page.click('.choice.bad');
      await sleep(100);
      check((await osc()) > o1, '作答中点已错选项可重听');
      for (let g = 0; g < 20 && !(await page.$('.feedback')); g++) {
        await (await page.$('.choice:not(.bad)')).click();
        await sleep(80);
      }
    } else {
      await page.keyboard.press('Enter');
      await sleep(150);
    }
  }
  check(wrongDone, '制造了一次答错');
  check(!!(await page.$('.compare-row')), '答错后出现「你的答案 / 正确答案」');
  check((await page.$$('.choice:disabled')).length === 0, '答完后选项不再 disabled');
  check((await page.$$('.choice-listen')).length === (await page.$$('.choice')).length, '答完后每个选项都有「试听」提示');
  const sess1 = await text('.session');
  let o2 = await osc();
  await page.click('.compare-row button:nth-of-type(1)');
  await sleep(100);
  check((await osc()) > o2, '▶ 你的答案 可以播放');
  o2 = await osc();
  await page.click('.compare-row button:nth-of-type(2)');
  await sleep(100);
  check((await osc()) > o2, '▶ 正确答案 可以播放');
  o2 = await osc();
  await (await page.$$('.choice'))[1].click();
  await sleep(100);
  check((await osc()) > o2, '答完后点选项可试听');
  o2 = await osc();
  await page.keyboard.down('Shift');
  await page.keyboard.press('Digit1');
  await page.keyboard.up('Shift');
  await sleep(100);
  check((await osc()) > o2, 'Shift+1 试听');
  check((await text('.session')) === sess1 && !!(await page.$('.feedback')), '试听不计分');
  await t.shot(page, 'x3-degrees-done-compare', { fullPage: false });
  await page.keyboard.press('Enter');
  await sleep(200);
  check(!(await page.$('.feedback')), '回车进入下一题');

  // ── 3. 答对后试听取消自动跳题 ──
  let held = false;
  let tried = false;
  for (let k = 0; k < 30 && !tried; k++) {
    const n = (await page.$$('.choice')).length;
    await (await page.$$('.choice'))[k % n].click();
    await sleep(100);
    if (await page.$('.feedback.good')) {
      tried = true;
      await (await page.$$('.choice'))[0].click(); // 等待期间试听
      const s = await text('.session');
      await sleep(3500);
      held = !!(await page.$('.feedback.good')) && (await text('.session')) === s;
      await page.keyboard.press('Enter');
      await sleep(200);
    } else {
      for (let g = 0; g < 20 && !(await page.$('.feedback')); g++) {
        await (await page.$('.choice:not(.bad)')).click();
        await sleep(60);
      }
      await page.keyboard.press('Enter');
      await sleep(200);
    }
  }
  check(tried && held, '答对后点试听：取消自动跳题');
  // 对照：答对后不点试听，会自动跳题
  let autoChecked = false;
  for (let k = 0; k < 30 && !autoChecked; k++) {
    const n = (await page.$$('.choice')).length;
    await (await page.$$('.choice'))[k % n].click();
    await sleep(100);
    if (await page.$('.feedback.good')) {
      await sleep(4500);
      check(!(await page.$('.feedback')), '答对后不试听：仍会自动跳题');
      autoChecked = true;
    }
    for (let g = 0; g < 20 && !(await page.$('.feedback')); g++) {
      await (await page.$('.choice:not(.bad)')).click();
      await sleep(60);
    }
    await page.keyboard.press('Enter');
    await sleep(200);
  }
  check(autoChecked, '找到一道首次即答对的题（自动跳题对照）');

  // ── 4. MIDI 作答（C 调，movable do） ──
  const SEMI = { do: 0, ra: 1, re: 2, me: 3, mi: 4, fa: 5, fi: 6, sol: 7, le: 8, la: 9, te: 10, ti: 11 };
  await sleep(300);
  if (await page.$('.feedback')) await page.keyboard.press('Enter');
  await sleep(200);
  const labels = await page.$$eval('.choice-label', (x) => x.map((e) => e.textContent));
  const s0 = await text('.session');
  const o3 = await osc();
  // 依次弹高八度的各个选项，直到答对
  for (const l of labels) {
    if (await page.$('.feedback')) break;
    await page.evaluate((n) => window.__midiSend([0x90, n, 100]), 72 + SEMI[l]);
    await sleep(150);
  }
  check((await osc()) > o3, 'MIDI 琴键即时发声');
  check(!!(await page.$('.feedback')) && (await text('.session')) !== s0, 'MIDI 弹琴键作答（跨八度）');
  await t.shot(page, 'x4-degrees-midi', { fullPage: false });
  await clickText(page, '返回');

  // ── 5. 旋律听写（多步）：答完 → 切换步骤对比 ──
  await clickText(page, '旋律听写', '.card');
  await clickText(page, '开始练习');
  await page.waitForSelector('.choice');
  await sleep(200);
  for (let g = 0; g < 60 && !(await page.$('.feedback')); g++) {
    await (await page.$('.choice:not(.bad)')).click();
    await sleep(60);
  }
  check((await page.$$('.slot.pick')).length > 0, '多步题答完后可选择步骤');
  await (await page.$$('.slot')).at(-1).click();
  await sleep(100);
  check((await page.$$('.slot.sel')).length === 1, '选中步骤高亮');
  o2 = await osc();
  await (await page.$$('.choice'))[0].click();
  await sleep(100);
  check((await osc()) > o2, '多步题试听');
  await t.shot(page, 'x5-dictation-done', { fullPage: false });
  await clickText(page, '返回');

  // ── 6. 今日训练（混合练习） ──
  await clickText(page, '开始今日训练');
  await page.waitForSelector('.q-module');
  const seen = new Set();
  let n = 0;
  let shot = false;
  for (let g = 0; g < 3000 && !(await page.$('.summary')); g++) {
    const m = await page.$('.q-module');
    if (m) seen.add(await m.evaluate((e) => e.textContent));
    if (await page.$('.feedback')) {
      n++;
      if (!shot && (await page.$('.compare-row'))) {
        await page.click('.compare-row button'); // 混合练习里点一下试听
        await t.shot(page, 'x6-mix-compare', { fullPage: false });
        shot = true;
      }
      await page.keyboard.press('Enter');
      await sleep(60);
      continue;
    }
    const c = await page.$('.choice:not(.bad)');
    if (c) await c.click();
    await sleep(30);
  }
  t.log('mix', { n, seen: [...seen] });
  check(!!(await page.$('.summary')), '混合练习完成并显示小结');
  await t.shot(page, 'x7-mix-summary');

  // 深色 + 手机宽度下的答完界面
  await clickText(page, '返回首页');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 390, height: 844 });
  await clickText(page, '和弦性质', '.card');
  await clickText(page, '开始练习');
  await page.waitForSelector('.choice');
  await sleep(100);
  await (await page.$$('.choice'))[0].click();
  await sleep(100);
  for (let g = 0; g < 20 && !(await page.$('.feedback')); g++) {
    await (await page.$('.choice:not(.bad)')).click();
    await sleep(60);
  }
  check(!!(await page.$('.feedback')), '深色手机：和弦性质可作答');
  await t.shot(page, 'x8-chords-dark-mobile');
});
