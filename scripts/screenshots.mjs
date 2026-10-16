#!/usr/bin/env node
// 生成 README 用的截图（docs/screenshots/*.webp）：用合成的练习记录填充本地存储，走一遍主要页面并截图。
//
//   npm run build && node scripts/screenshots.mjs              在 4186 端口启动 vite preview（dist/），截全部
//   node scripts/screenshots.mjs --url http://localhost:4186/   直接用已运行的站点
//   node scripts/screenshots.mjs --only home,stats              只截名字里包含这些词的截图
//   node scripts/screenshots.mjs --out /tmp/shots               输出目录（默认 docs/screenshots）
//
// 需要本机 Chrome（同 e2e：CHROME_PATH 或常见安装位置）。截图用 Chrome 直接输出 WebP（宽度 ≤ 1200px），不需要其他图像工具。
// 跟唱成绩：用合成的「麦克风」（振荡器按曲谱的音高与时值发声，个别音故意唱偏一点）代替真人演唱。
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from '../e2e/lib/chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = resolve(opt('--out', join(root, 'docs/screenshots')));
const ONLY = opt('--only', '')?.split(',').filter(Boolean) ?? [];
const PORT = 4186;
let url = opt('--url', null);
mkdirSync(OUT, { recursive: true });

// ───── 跟唱用的曲目数据：用 vite 的 SSR 加载源码里的曲库与落位函数 ─────
const SONG_ID = 'ode-to-joy';
const VOICE = 'low';
async function songTimeline() {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const lib = await vite.ssrLoadModule('/src/songs/library.ts');
    const rl = await vite.ssrLoadModule('/src/songs/realize.ts');
    const song = lib.SONGS.find((s) => s.id === SONG_ID);
    const r = rl.realize(song, 0, VOICE); // C 大调
    const times = rl.noteTimes(r, song.bpm);
    return r.midis.map((m, i) => ({ midi: m, ...times[i] }));
  } finally {
    await vite.close();
  }
}

// ───── 成绩链接与成绩单：用源码里的编码函数生成几个学生的成绩链接（固定题目组合，部分答错） ─────
const ASSIGN = {
  zh: { name: '第三周听力作业', students: ['李小雨', '王浩然', '陈思远', '张一诺', '刘子涵'] },
  en: { name: 'Week 3 listening', students: ['Emma', 'Liam', 'Sofia', 'Noah', 'Mia'] },
};
async function resultCodes() {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const rl = await vite.ssrLoadModule('/src/engine/resultLink.ts');
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    const out = {};
    for (const [lang, a] of Object.entries(ASSIGN)) {
      const set = {
        name: a.name,
        parts: [
          { ex: 'intervals', items: ['P5', 'P8', 'M3', 'P4', 'm3', 'M6'], options: { dir: 'mix' } },
          { ex: 'chords', items: ['maj', 'min', 'dim', 'aug'], options: {} },
          { ex: 'dictation', items: ['d0', 'd2', 'd4', 'd5', 'd7'], options: {} },
        ],
        count: 12,
        seed: 20261016,
      };
      const draws = rl.resultDraws(set);
      // 每个学生答错的题号（从 0 起）、用时（分钟）、完成时间（昨晚 21:40 之前几小时）
      const plans = [
        [[3, 5], 9, 0.5],
        [[1, 4, 6, 10], 12, 2],
        [[], 8, 3.2],
        [[2, 5, 7, 8, 9, 11], 15, 1.1],
        [[6], 10, 24],
      ];
      const base = new Date();
      base.setDate(base.getDate() - 1);
      base.setHours(21, 40, 0, 0);
      out[lang] = plans.map(([wrong, minutes, h], s) => {
        const results = draws.map((d, i) => {
          const n = d.ex === 'dictation' ? 4 : 1;
          const bad = wrong.includes(i);
          return { steps: Array.from({ length: n }, (_, k) => ({ ok: !bad || k < n - 1 - (s % 2) })) };
        });
        return rl.encodeResult({ set, results, at: base.getTime() - Math.round(h * 60) * 60e3, minutes, version, name: a.students[s] });
      });
    }
    return out;
  } finally {
    await vite.close();
  }
}

// ───── 合成的练习记录（在页面里运行，用浏览器的本地日期） ─────
function seed(lang, extra = {}) {
  let r = 20261015;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // 各练习的起始正确率与开始练习的时间（距今天数）
  const exs = {
    degrees: [0.5, 150],
    intervals: [0.55, 150],
    chords: [0.5, 130],
    progressions: [0.4, 110],
    dictation: [0.35, 90],
    rhythm: [0.65, 120],
    rhythmTap: [0.55, 70],
    inversions: [0.4, 40],
    scales: [0.45, 30],
    rhythmDictation: [0.3, 25],
    singing: [0.5, 60],
  };
  const daily = {};
  const now = new Date();
  for (let i = 150; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12);
    if (i > 64 && i < 72) continue; // 假期空档
    if (i > 0 && rnd() < 0.2) continue;
    const t = (150 - i) / 150;
    const day = { n: 0, c: 0, ex: {} };
    for (const [id, [base, since]] of Object.entries(exs)) {
      if (i > since || rnd() < 0.45) continue;
      const n = 4 + Math.floor(rnd() * (6 + 14 * t));
      const p = Math.min(0.97, base + (0.9 - base) * (1 - Math.exp(-((since - i) / since) * 2.5)) + (rnd() - 0.5) * 0.16);
      let c = 0;
      for (let k = 0; k < n; k++) if (rnd() < p) c++;
      day.ex[id] = [n, c];
      day.n += n;
      day.c += c;
    }
    if (day.n) daily[key(d)] = day;
  }
  const ago = (h) => Date.now() - h * 3600e3;
  const item = (n, acc, h = 20) => ({ n, c: Math.round(n * acc), acc, last: ago(h) });
  const prog = (level, items) => ({ level, custom: null, options: {}, items });
  const store = {
    version: 1,
    settings: { onboarded: true, dailyGoal: 30, lang, notation: 'both', voice: 'low', naming: 'movable', keyMode: 'random', ...extra.settings },
    exercises: {
      degrees: prog(2, { d0: item(90, 0.96), d4: item(85, 0.93), d7: item(80, 0.92), d2: item(60, 0.88), d5: item(55, 0.84), d9: item(30, 0.7), d11: item(26, 0.58) }),
      intervals: prog(3, { P5: item(90, 0.95), P8: item(80, 0.97), M3: item(70, 0.9), P4: item(66, 0.82), m3: item(50, 0.86), M6: item(44, 0.79), M2: item(20, 0.62), m2: item(18, 0.55) }),
      chords: prog(2, { maj: item(70, 0.95), min: item(68, 0.93), dim: item(40, 0.86), aug: item(38, 0.88), sus2: item(14, 0.6), sus4: item(12, 0.66) }),
      progressions: prog(2, { I: item(50, 0.94), IV: item(48, 0.86), V: item(48, 0.88), vi: item(30, 0.78), ii: item(10, 0.5) }),
      dictation: prog(1, { d0: item(40, 0.9), d2: item(40, 0.85), d4: item(40, 0.88), d5: item(18, 0.66), d7: item(18, 0.72) }),
      rhythm: prog(2, { q: item(40, 0.98), h: item(40, 0.97), w: item(30, 0.98), qr: item(30, 0.9), ee: item(40, 0.9), dqe: item(16, 0.7), ere: item(12, 0.6), eer: item(12, 0.66) }),
      rhythmTap: prog(1, { q: item(20, 0.92), h: item(20, 0.9), w: item(12, 0.95), qr: item(12, 0.85), ee: item(10, 0.7) }),
      inversions: prog(1, { t0: item(30, 0.85), t1: item(28, 0.75), t2: item(12, 0.55) }),
      scales: prog(1, { major: item(20, 0.95), minor: item(20, 0.9), harmonic: item(10, 0.6) }),
      rhythmDictation: prog(1, { 'qh.0': item(14, 0.85), 'qh.1': item(8, 0.6) }),
      // 和声听写在最高级（选项按功能分成四组）
      harmony: { ...prog(5, { V: item(20, 0.8), IV: item(18, 0.7), V65: item(8, 0.5), 'V/V': item(6, 0.4) }), options: { mode: 'major', len: '4' } },
      singing: prog(1, { d0: item(20, 0.95), d4: item(18, 0.85), d7: item(18, 0.83), d2: item(6, 0.66) }),
    },
    daily,
    songs: {
      'd1-1': { best: 96, attempts: 4, practiced: 2, last: ago(300), lastScore: 92 },
      'd1-2': { best: 91, attempts: 3, practiced: 1, last: ago(280), lastScore: 91 },
      'hot-cross-buns': { best: 94, attempts: 3, practiced: 1, last: ago(200), lastScore: 88 },
      twinkle: { best: 88, attempts: 5, practiced: 2, last: ago(150), lastScore: 85 },
      'mary-lamb': { best: 82, attempts: 2, practiced: 0, last: ago(100), lastScore: 82 },
      'd2-1': { best: 79, attempts: 2, practiced: 1, last: ago(50), lastScore: 70 },
      'frere-jacques': { best: 73, attempts: 2, practiced: 0, last: ago(30), lastScore: 73 },
    },
    exams: [
      { preset: 'beginner', at: ago(24 * 40), score: 62, sections: [70, 55, 60], timed: true, secs: 410 },
      { preset: 'beginner', at: ago(24 * 26), score: 74, sections: [80, 66, 75], timed: true, secs: 380 },
      { preset: 'grade', at: ago(24 * 12), score: 58, sections: [70, 60, 50, 55, 52], timed: true, secs: 1100 },
      { preset: 'beginner', at: ago(24 * 5), score: 86, sections: [90, 83, 85], timed: true, secs: 350 },
    ],
  };
  localStorage.setItem('earforge:v1', JSON.stringify(store));
}

/**
 * 合成「麦克风」：getUserMedia 返回一个空的音频流；应用用它建 MediaStreamSource 时，换成同一个音频上下文里的振荡器
 * （跨上下文转接音频流会有约 1 秒的缓冲延迟，评分就对不上了）。界面进入演唱阶段（出现调音表）时按曲谱发声。
 */
function fakeSinger(notes) {
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const fakes = new WeakSet();
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (!c?.audio) return real(c);
    const stream = new MediaStream();
    fakes.add(stream);
    return stream;
  };
  const create = AudioContext.prototype.createMediaStreamSource;
  AudioContext.prototype.createMediaStreamSource = function (stream) {
    if (!fakes.has(stream)) return create.call(this, stream);
    const ctx = this;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    // 接到一个静音的输出上，保证这条支路被音频图持续处理（只连分析器时 Chrome 可能不渲染）
    const mute = ctx.createGain();
    mute.gain.value = 0;
    gain.connect(mute).connect(ctx.destination);
    osc.start();
    // 按墙上时间（performance.now）切换音高：无声卡的无头环境里音频时钟可能跑在前面，不按 ctx.currentTime 排程
    const pitches = notes.map((n, i) => {
      if (n.midi === null) return null;
      // 大多数音唱准（±12 音分内），个别音偏 35–60 音分，像真人
      const off = i % 9 === 5 ? 58 : i % 7 === 3 ? -38 : ((i * 37) % 25) - 12;
      return 440 * 2 ** ((n.midi - 69 + off / 100) / 12);
    });
    let p0 = 0;
    const tick = () => {
      const el = (performance.now() - p0) / 1000;
      const i = notes.findIndex((n) => el >= n.start + 0.01 && el < n.end - 0.03);
      if (i >= 0 && pitches[i] !== null) {
        osc.frequency.value = pitches[i];
        gain.gain.value = 0.4;
      } else gain.gain.value = 0;
      if (el < (notes.at(-1)?.end ?? 0) + 1) setTimeout(tick, 5);
    };
    const watch = () => {
      if (document.querySelector('.tuner')) {
        p0 = performance.now();
        console.debug(`[singer] start ${ctx.state}`);
        tick();
      } else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    return gain;
  };
}

const want = (name) => !ONLY.length || ONLY.some((o) => name.includes(o));
const written = [];

async function main() {
  let server;
  if (!url) {
    const { preview } = await import('vite');
    server = await preview({ root, logLevel: 'warn', preview: { port: PORT, strictPort: true, host: '127.0.0.1', open: false } });
    url = `http://127.0.0.1:${PORT}/`;
  }
  const timeline = want('song-result') ? await songTimeline() : [];
  const codes = want('result-view') || want('gradebook') ? await resultCodes() : null;
  const browser = await puppeteer.launch({
    executablePath: await findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
  });
  const errors = [];
  try {
    for (const lang of ['zh', 'en']) await shootLang(browser, lang, timeline, errors, codes?.[lang]);
  } finally {
    await browser.close();
    await server?.close();
  }
  let total = 0;
  for (const f of written) {
    const kb = statSync(f).size / 1024;
    total += kb;
    console.log(`${f.replace(root + '/', '')}  ${kb.toFixed(0)} KB`);
  }
  console.log(`total ${(total / 1024).toFixed(2)} MB, ${written.length} files`);
  if (errors.length) {
    console.log(`page errors:\n  ${errors.join('\n  ')}`);
    process.exitCode = 1;
  }
}

async function shootLang(browser, lang, timeline, errors, codes) {
  const T =
    lang === 'zh'
      ? { start: '开始练习', back: '返回', stats: '统计', lib: '视唱曲库', exam: '模拟考试', rdict: '节奏旋律听写', degrees: '调内音级', harmony: '和声听写', settings: '设置' }
      : { start: 'Start', back: 'Back', stats: 'Stats', lib: 'Sight-Singing Library', exam: 'mock exams', rdict: 'Melody + Rhythm', degrees: 'Scale Degrees', harmony: 'Harmonic Dictation', settings: 'Settings' };

  async function open({ width = 1100, height = 760, scale = 1, dark = false, fresh = false, init = null, initArg, settings, hash = '' } = {}) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${lang}: ${e}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${lang}: ${m.text()}`);
      else if (process.env.DEBUG) console.log(`  [${lang}] ${m.text()}`);
    });
    await page.evaluateOnNewDocument((l) => Object.defineProperty(navigator, 'language', { get: () => l }), lang === 'zh' ? 'zh-CN' : 'en-US');
    // 考试页的测试钩子：公开本卷答案（只用来「答题」）；固定随机数种子，让出题可复现；
    // 可拨快的时钟（__shotClock 毫秒），让考试用时看起来像真人
    await page.evaluateOnNewDocument(() => {
      globalThis.__EARFORGE_TEST__ = true;
      let r = 4206;
      Math.random = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
      const now = Date.now;
      globalThis.__shotClock = 0;
      Date.now = () => now() + globalThis.__shotClock;
    });
    if (!fresh) await page.evaluateOnNewDocument(seed, lang, { settings });
    if (init) await page.evaluateOnNewDocument(init, initArg);
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
    await page.goto(url + hash, { waitUntil: 'networkidle0' });
    // seed 每次加载都会运行：之后的页面内跳转不刷新，不影响
    return { ctx, page };
  }
  const click = async (page, text, sel = 'button') => {
    for (const el of await page.$$(sel)) {
      const s = await el.evaluate((e) => `${e.textContent} ${e.getAttribute('aria-label') ?? ''}`);
      if (s.toLowerCase().includes(text.toLowerCase())) {
        await el.click();
        await sleep(250);
        return;
      }
    }
    throw new Error(`${lang}: no ${sel} "${text}"`);
  };
  const shot = async (page, name, { fullPage = false, keepScroll = false } = {}) => {
    const path = join(OUT, `${name}-${lang}.webp`);
    await page.mouse.move(0, 0);
    if (!keepScroll) await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(350);
    // 整页：把视口拉高到页面高度再截（captureBeyondViewport 会临时改变布局宽度，五线谱会按窄宽度重排）
    if (fullPage) {
      const vp = page.viewport();
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewport({ ...vp, height: Math.min(h, 2400) });
      await sleep(400);
    }
    await page.screenshot({ path, type: 'webp', quality: 80 });
    written.push(path);
  };
  // 首页
  if (want('home')) {
    const { ctx, page } = await open({ height: 900 });
    await shot(page, 'home');
    await ctx.close();
  }

  /** 从 React 状态读出当前题的答案（同 e2e/lib/harness.mjs 的 readQuestion），按答案逐步答对 */
  const answerRight = async (page) => {
    const q = await page.evaluate(() => {
      const el = document.querySelector('.choices');
      const k = el && Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
      for (let f = k ? el[k] : null; f; f = f.return)
        for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
          const v = h.memoizedState;
          if (v?.q && Array.isArray(v.q.answer)) return { answer: v.q.answer, choices: v.q.choices.map((c) => c.id) };
        }
      return null;
    });
    if (!q) throw new Error(`${lang}: cannot read the question`);
    for (const a of q.answer) {
      await (await page.$$('.choice'))[q.choices.indexOf(a)].click();
      await sleep(120);
    }
    await page.waitForSelector('.feedback', { timeout: 8000 });
  };

  // 练习：答对两题（第二题含五线谱与反馈）。关掉「答对后自动下一题」，停在反馈上
  for (const dark of lang === 'zh' ? [false, true] : [false]) {
    const name = dark ? 'practice-dark' : 'practice';
    if (!want(name)) continue;
    const { ctx, page } = await open({ dark, height: 900, settings: { autoNext: false } });
    await click(page, T.degrees, '.card');
    await click(page, T.start);
    await page.waitForSelector('.choice');
    await sleep(600);
    await answerRight(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.feedback'));
    await sleep(600);
    await answerRight(page);
    await sleep(500);
    await shot(page, name);
    await ctx.close();
  }

  // 记谱编辑器（节奏旋律听写）：写到一半
  if (want('notate')) {
    const { ctx, page } = await open({ height: 900 });
    await click(page, T.rdict, '.card');
    await click(page, T.start);
    await page.waitForSelector('.notate-btn');
    await sleep(800);
    for (const k of ['q', '1', '2', 'h', '3', 'q', '3', 'e', '2', '1']) {
      await page.keyboard.press(k);
      await sleep(60);
    }
    await shot(page, 'notate');
    await ctx.close();
  }

  // 视唱曲库与跟唱成绩
  if (want('songs')) {
    const { ctx, page } = await open({ height: 900 });
    await click(page, T.lib, '.card');
    await shot(page, 'songs');
    await ctx.close();
  }
  if (want('song-result')) {
    const { ctx, page } = await open({ height: 900, init: fakeSinger, initArg: timeline });
    await click(page, T.lib, '.card');
    await click(page, lang === 'zh' ? '欢乐颂' : 'Ode to Joy', '.song-card');
    await sleep(300);
    await page.select('#song-key', '0');
    await sleep(200);
    await click(page, lang === 'zh' ? '开始跟唱' : 'Start singing');
    await page.waitForSelector('.song-result', { timeout: 90000 });
    await shot(page, 'song-result', { fullPage: true });
    await ctx.close();
  }

  // 模拟考试：考完入门测验，大部分答对
  if (want('exam')) {
    const { ctx, page } = await open({ height: 900 });
    await click(page, T.exam, '.card');
    await (await page.$$('.exam-preset'))[0].click();
    await sleep(200);
    await page.click('.exam-start button');
    await sleep(500);
    const exam = await page.evaluate(() => globalThis.__earforgeExam);
    for (let qi = 0; qi < exam.length; qi++) {
      const { answer: ans, choices } = exam[qi];
      for (let s = 0; s < ans.length; s++) {
        let k = choices.indexOf(ans[s]);
        if ((qi === 3 || qi === 8) && s === 0) k = (k + 1) % choices.length;
        await (await page.$$('.exam-choices .choice'))[k].click();
      }
      if (qi === exam.length - 1) await page.evaluate(() => (globalThis.__shotClock = 6 * 60e3 + 23e3));
      await page.click('.exam-next button');
      await sleep(80);
    }
    await page.waitForSelector('.exam-total');
    await sleep(300);
    await shot(page, 'exam-result');
    await ctx.close();
  }

  // 和声听写：最高级（选项按功能分组），每题随机换乐器；按题目答案逐个和弦答对，答完显示大谱表
  if (want('harmony')) {
    const { ctx, page } = await open({ height: 900, settings: { timbre: 'random', autoNext: false } });
    await click(page, T.harmony, '.card');
    await click(page, T.start);
    await page.waitForSelector('.choice-groups .choice');
    await sleep(600);
    await answerRight(page);
    await page.waitForSelector('.feedback-staff svg');
    await sleep(500);
    await shot(page, 'harmony', { fullPage: true });
    await ctx.close();
  }

  // 设置页的音色：合成 / 采样 / 随机三组（选中「每题随机换乐器」）
  if (want('settings-timbre')) {
    const { ctx, page } = await open({ height: 900, settings: { timbre: 'random' } });
    await click(page, T.settings);
    await page.waitForSelector('.timbre-groups');
    await sleep(400);
    await page.mouse.move(0, 0);
    const panel = await page.evaluateHandle(() => document.querySelector('.timbre-groups').closest('.panel'));
    const path = join(OUT, `settings-timbre-${lang}.webp`);
    await panel.screenshot({ path, type: 'webp', quality: 80 });
    written.push(path);
    await ctx.close();
  }

  // 成绩页：老师打开学生发来的成绩链接（12 题，两题答错，其中一题是旋律听写的多步题）
  if (want('result-view')) {
    const { ctx, page } = await open({ height: 900, hash: `#r=${codes[0]}` });
    await page.waitForSelector('.result-grid');
    await shot(page, 'result-view', { fullPage: true });
    await ctx.close();
  }

  // 成绩单：本机已添加 5 个学生的成绩，打开这份作业的学生 × 得分表
  if (want('gradebook')) {
    const add = (list) => {
      const s = JSON.parse(localStorage.getItem('earforge:v1'));
      s.gradebook = list.map((code, i) => ({ code, added: Date.now() - (list.length - i) * 3600e3 }));
      localStorage.setItem('earforge:v1', JSON.stringify(s));
    };
    const { ctx, page } = await open({ height: 520, init: add, initArg: codes });
    await click(page, lang === 'zh' ? '成绩单' : 'Gradebook', '.card');
    await page.waitForSelector('.gradebook .set-item');
    await (await page.$('.gradebook .set-actions button.primary')).click();
    await page.waitForSelector('.grade-table');
    await shot(page, 'gradebook');
    await ctx.close();
  }

  // 统计与趋势
  if (want('stats')) {
    const { ctx, page } = await open({ height: 1000 });
    await click(page, T.stats);
    await sleep(500);
    await shot(page, 'stats');
    await ctx.close();
  }

  // 新手引导（全新用户）
  if (want('onboarding')) {
    const { ctx, page } = await open({ fresh: true, height: 760 });
    await shot(page, 'onboarding');
    await ctx.close();
  }

  // 手机：首页
  if (want('mobile')) {
    const { ctx, page } = await open({ width: 390, height: 844, scale: 2 });
    await shot(page, 'mobile');
    await ctx.close();
  }
}

await main();
