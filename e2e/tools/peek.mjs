// 截一屏（非整页、2 倍分辨率）便于看细节，不是测试。原 peek.mjs
//   node e2e/tools/peek.mjs <宽> <暗 0|1> <语言 zh-CN|en-US> <曲名|-> <输出.png> [滚动 y]
// 站点地址取 E2E_BASE_URL（默认 http://localhost:4173/）；打开视唱曲库；曲名不为 - 时再打开该曲目。
import puppeteer from 'puppeteer-core';
import { findChrome } from '../lib/chrome.mjs';

const [, , width = '390', dark = '0', lang = 'zh-CN', songText = '-', out = 'peek.png', scrollY = '0'] = process.argv;
const base = process.env.E2E_BASE_URL ?? 'http://localhost:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: await findChrome(), headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const p = await b.newPage();
  await p.evaluateOnNewDocument((l) => Object.defineProperty(navigator, 'language', { get: () => l }), lang);
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark === '1' ? 'dark' : 'light' }]);
  await p.setViewport({ width: +width, height: 800, deviceScaleFactor: 2 });
  await p.goto(base, { waitUntil: 'networkidle0' });
  await p.keyboard.press('Escape');
  await sleep(300);
  const click = async (text, sel = 'button') => {
    for (const el of await p.$$(sel)) if ((await el.evaluate((e) => e.textContent)).includes(text)) return el.click();
    throw new Error('no ' + text);
  };
  await click(lang.startsWith('zh') ? '视唱曲库' : 'Sight-Singing Library');
  await sleep(300);
  if (songText !== '-') {
    await click(songText, '.song-card');
    await sleep(600);
  }
  await p.evaluate((y) => window.scrollTo(0, y), +scrollY);
  await sleep(200);
  await p.screenshot({ path: out });
  console.log(out);
} finally {
  await b.close();
}
