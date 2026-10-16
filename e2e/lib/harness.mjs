// e2e 场景共用的工具：启动浏览器、打开页面（语言 / 视口 / 明暗 / 跳过新手引导）、按文字点击、截图、断言。
//
// 每个场景是一个独立的 node 脚本，形如：
//   import { run } from '../lib/harness.mjs';
//   await run(async (t) => { const page = await t.open(); ... t.check(cond, '说明'); });
// run() 负责收尾：关闭浏览器、汇总断言、检查页面错误，有失败就以非零码退出。
//
// 配置（环境变量，运行器 e2e/run.mjs 会自动设置）：
//   E2E_BASE_URL  被测站点，默认 http://localhost:${E2E_PORT ?? 4173}/（可带子路径，如 …/earforge/）
//   E2E_OUT       截图与日志输出目录，默认 e2e-output/<场景名>
//   E2E_WAV       假麦克风 WAV，默认 e2e/.cache/c4.wav（不存在时自动生成）
//   CHROME_PATH   Chrome 可执行文件（不设则自动查找，见 chrome.mjs）
//   E2E_HEADFUL=1 显示浏览器窗口，便于调试
import { mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';
import { DEFAULT_WAV, makeC4Wav } from '../fixtures/make-c4-wav.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 中日韩字符（含全角标点），用于检查英文界面里是否漏翻 */
export const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿＀-￯]/;

const scenarioName = basename(process.argv[1] ?? 'scenario').replace(/\.m?js$/, '');

export const config = {
  name: scenarioName,
  base: (() => {
    const u = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 4173}/`;
    return u.endsWith('/') ? u : `${u}/`;
  })(),
  out: resolve(process.env.E2E_OUT ?? join('e2e-output', scenarioName)),
  headful: process.env.E2E_HEADFUL === '1',
};

/** 按文字点击：在 sel 匹配的元素里找 textContent 包含（exact 时等于）text 的第一个，点击。 */
export async function clickText(page, text, sel = 'button', exact = false) {
  for (const el of await page.$$(sel)) {
    const s = (await el.evaluate((e) => e.textContent ?? '')).trim();
    if (exact ? s === text : s.includes(text)) return el.click();
  }
  throw new Error(`找不到 ${sel}「${text}」 / no ${sel} "${text}"`);
}

export const textOf = (page, sel) => page.$eval(sel, (e) => e.textContent ?? '');

/** 读取应用的本地存储 */
export const readStore = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('earforge:v1') ?? 'null'));

/** 页面横向溢出的像素数（> 0 表示出现了横向滚动条） */
export const overflowPx = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** 新用户首次打开会弹出新手引导，按 Esc 跳过 */
export async function skipOnboarding(page) {
  await page.keyboard.press('Escape');
  await sleep(300);
}

/** 清空本地存储并重新加载（全新用户），再跳过新手引导 */
export async function freshStart(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await skipOnboarding(page);
}

class Scenario {
  constructor() {
    this.base = config.base;
    this.out = config.out;
    this.passed = 0;
    this.failures = [];
    this.browsers = [];
    this.pages = [];
    mkdirSync(this.out, { recursive: true });
  }

  log(...a) {
    console.log(...a);
  }

  /** 断言：失败时记录但不中断，场景结束时统一报告 */
  check(cond, msg) {
    if (cond) this.passed++;
    else this.failures.push(msg);
    console.log(cond ? '  ok  ' : '  FAIL', msg);
    return !!cond;
  }

  fail(msg) {
    return this.check(false, msg);
  }

  /** 启动 Chrome。fakeMic: true 用 Chrome 的假设备（蜂鸣声），'wav' 用 C4 正弦波文件 */
  async launch({ fakeMic = false, args = [] } = {}) {
    const extra = [];
    if (fakeMic) extra.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream');
    if (fakeMic === 'wav') extra.push(`--use-file-for-fake-audio-capture=${makeC4Wav(process.env.E2E_WAV ?? DEFAULT_WAV)}`);
    const browser = await puppeteer.launch({
      executablePath: await findChrome(),
      headless: !config.headful,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', ...extra, ...args],
    });
    this.browsers.push(browser);
    return browser;
  }

  /**
   * 打开一个新页面并（默认）进入首页、跳过新手引导。
   * target: Browser 或 BrowserContext（不传则用第一个已启动的浏览器，没有就启动一个）。
   * 页面的 pageerror 与 console.error 收集在 page.errors，场景结束时断言为空（allowErrors 可放宽）。
   */
  async open({
    target,
    lang = 'zh-CN',
    width = 900,
    height = 900,
    dark = false,
    init,
    initArgs = [],
    goto = true,
    onboarding = 'skip',
    tag = '',
    allowErrors = false,
    path = '',
  } = {}) {
    const t = target ?? this.browsers[0] ?? (await this.launch());
    const page = await t.newPage();
    page.setDefaultTimeout(20000);
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
    this.pages.push({ page, tag: tag || `page${this.pages.length + 1}`, allowErrors });
    // headless 下 --lang 不生效，直接改 navigator.language 决定首次界面语言
    if (lang) await page.evaluateOnNewDocument((l) => Object.defineProperty(navigator, 'language', { get: () => l }), lang);
    if (init) await page.evaluateOnNewDocument(init, ...initArgs);
    await page.setViewport({ width, height });
    if (dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    if (goto) {
      await page.goto(this.base + path, { waitUntil: 'networkidle0' });
      if (onboarding === 'skip') await skipOnboarding(page);
    }
    return page;
  }

  /** 截图到输出目录 */
  async shot(page, name, { fullPage = true } = {}) {
    await page.screenshot({ path: join(this.out, `${name}.png`), fullPage });
  }

  async finish(error) {
    if (error) this.failures.push(`未捕获的异常 / uncaught: ${error.stack ?? error}`);
    for (const { page, tag, allowErrors } of this.pages) {
      const errs = allowErrors instanceof RegExp ? page.errors.filter((e) => !allowErrors.test(e)) : allowErrors ? [] : page.errors;
      if (errs.length) this.failures.push(`${tag}: 页面错误 / page errors: ${errs.join(' | ')}`);
    }
    await Promise.all(this.browsers.map((b) => b.close().catch(() => {})));
    const ok = this.failures.length === 0;
    console.log(`\n${ok ? 'PASS' : 'FAIL'} ${config.name}: ${this.passed} checks passed, ${this.failures.length} failed`);
    for (const f of this.failures) console.log(`  ✗ ${f}`);
    console.log(`E2E_RESULT ${JSON.stringify({ name: config.name, ok, passed: this.passed, failed: this.failures.length })}`);
    process.exitCode = ok ? 0 : 1;
  }
}

/** 运行一个场景：fn 收到 Scenario 实例 t（t.open / t.check / t.shot / t.launch …） */
export async function run(fn) {
  const t = new Scenario();
  console.log(`▶ ${config.name}  base=${config.base}  out=${config.out}`);
  let error;
  try {
    await fn(t);
  } catch (e) {
    error = e;
  }
  await t.finish(error);
}
