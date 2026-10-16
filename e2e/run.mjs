#!/usr/bin/env node
// e2e 运行器：构建 → 在空闲端口启动 vite preview → 跑场景（并行 + 对时间敏感的串行）→ 汇总 → 收尾。
//
//   npm run e2e                     全部场景
//   npm run e2e -- smoke exam       只跑指定场景（名字不完整时按前缀匹配，如 notate- 匹配 notate-advanced、notate-mix）
//   npm run e2e -- --list           列出场景
//
// 选项：
//   --no-build        不重新构建，直接用 e2e-output/dist（需先跑过一次）
//   --base /earforge/ 以子路径构建并预览（同 BASE_PATH 环境变量），检验部署到 GitHub Pages 项目页
//   --url <url>       不构建也不启动服务器，直接测已运行的站点（如 http://localhost:4173/）
//   --jobs N          并行数（默认 2；对时间敏感的场景总是单独跑）
//   --retries N       失败后重试次数（默认 0；重试后通过的会标为 flaky）
//   --out DIR         输出目录（默认 e2e-output）：每个场景的截图在 DIR/<场景>/，日志在 DIR/<场景>.log
// 环境变量：CHROME_PATH（Chrome 路径）、E2E_HEADFUL=1（显示浏览器）、E2E_TIMEOUT（单个场景超时毫秒，默认 900000）
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './lib/chrome.mjs';
import { makeC4Wav } from './fixtures/make-c4-wav.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const scenarioDir = join(here, 'scenarios');

/** 对时间敏感（节拍、音频时钟、麦克风）的场景：不与其他场景并行 */
const SERIAL = new Set(['rhythm-tap', 'song-pitch']);
/** 耗时长的先跑，缩短总时间 */
const SLOW_FIRST = ['exam', 'i18n-en', 'songs', 'notate', 'a11y-axe', 'listen-compare'];

function parseArgs(argv) {
  const o = { names: [], build: true, base: process.env.BASE_PATH || '/', url: null, jobs: 2, retries: 0, out: 'e2e-output', list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} 需要一个值`);
      return argv[++i];
    };
    if (a === '--no-build') o.build = false;
    else if (a === '--base') o.base = val();
    else if (a === '--url') o.url = val();
    else if (a === '--jobs' || a === '-j') o.jobs = Math.max(1, Number(val()) || 1);
    else if (a === '--retries') o.retries = Math.max(0, Number(val()) || 0);
    else if (a === '--out') o.out = val();
    else if (a === '--list') o.list = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('-')) throw new Error(`未知选项 ${a}`);
    else o.names.push(a.replace(/\.mjs$/, ''));
  }
  if (!o.base.startsWith('/')) o.base = `/${o.base}`;
  if (!o.base.endsWith('/')) o.base += '/';
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const all = readdirSync(scenarioDir)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => f.replace(/\.mjs$/, ''));
// 按 SLOW_FIRST 的顺序排在前面，其余按名字
all.sort((a, b) => {
  const ia = SLOW_FIRST.indexOf(a);
  const ib = SLOW_FIRST.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});

if (opts.help) {
  console.log('usage: npm run e2e -- [scenario ...] [--no-build] [--base /sub/] [--url URL] [--jobs N] [--retries N] [--out DIR] [--list]');
  process.exit(0);
}
if (opts.list) {
  for (const n of all) console.log(`${n}${SERIAL.has(n) ? '  (serial)' : ''}`);
  process.exit(0);
}

// 名字完全匹配时只跑那一个；否则按前缀匹配（如 notate- 匹配 notate-advanced 与 notate-mix）
const matches = (q) => (all.includes(q) ? [q] : all.filter((n) => n.startsWith(q)));
const selected = opts.names.length ? all.filter((n) => opts.names.some((q) => matches(q).includes(n))) : all;
const unknown = opts.names.filter((q) => !matches(q).length);
if (unknown.length || !selected.length) {
  console.error(`未知场景 / unknown scenario: ${unknown.join(', ') || opts.names.join(', ')}\n可用 / available: ${all.join(', ')}`);
  process.exit(2);
}

const outRoot = resolve(root, opts.out);
const distDir = join(outRoot, 'dist');
const children = new Set();
let server = null;

async function cleanup() {
  for (const c of children) c.kill('SIGTERM');
  if (server) await server.close().catch(() => {});
  server = null;
}
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, async () => {
    await cleanup();
    process.exit(130);
  });

function runCmd(cmd, args, env = {}) {
  return new Promise((res, rej) => {
    const c = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    children.add(c);
    c.on('exit', (code) => {
      children.delete(c);
      if (code === 0) res();
      else rej(new Error(`${cmd} ${args.join(' ')} 退出码 ${code}`));
    });
  });
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

const fmt = (ms) => (ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`);

/** 跑一个场景子进程；输出写日志，单任务时同时直接打印 */
function runScenario(name, baseURL, attempt, live) {
  return new Promise((res) => {
    const started = Date.now();
    const logPath = join(outRoot, attempt ? `${name}.retry${attempt}.log` : `${name}.log`);
    const log = createWriteStream(logPath);
    const env = { ...process.env, E2E_BASE_URL: baseURL, E2E_OUT: join(outRoot, name) };
    const c = spawn(process.execPath, [join(scenarioDir, `${name}.mjs`)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(c);
    let buf = '';
    const onData = (d) => {
      const s = d.toString();
      buf += s;
      log.write(s);
      if (live) process.stdout.write(s);
    };
    c.stdout.on('data', onData);
    c.stderr.on('data', onData);
    const timeoutMs = Number(process.env.E2E_TIMEOUT) || 15 * 60 * 1000;
    const timer = setTimeout(() => {
      buf += `\n[runner] 超时 ${fmt(timeoutMs)}，终止\n`;
      c.kill('SIGKILL');
    }, timeoutMs);
    c.on('exit', (code, signal) => {
      clearTimeout(timer);
      children.delete(c);
      log.end();
      const m = buf.match(/E2E_RESULT (\{.*\})/);
      const r = m ? JSON.parse(m[1]) : { passed: 0, failed: 1 };
      res({ name, ok: code === 0 && !!m && r.ok, code: code ?? signal, passed: r.passed, failed: r.failed, ms: Date.now() - started, output: buf, log: logPath });
    });
  });
}

async function main() {
  mkdirSync(outRoot, { recursive: true });
  const chrome = await findChrome();
  makeC4Wav();
  let baseURL = opts.url;
  if (!baseURL) {
    if (opts.build) {
      console.log(`\n▶ 构建（base=${opts.base}）→ ${relative(root, distDir)}`);
      rmSync(distDir, { recursive: true, force: true });
      await runCmd(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', distDir, '--emptyOutDir', '--logLevel', 'warn'], {
        BASE_PATH: opts.base,
      });
    }
    const { preview } = await import('vite');
    const port = await freePort();
    process.env.BASE_PATH = opts.base;
    server = await preview({
      root,
      base: opts.base,
      logLevel: 'warn',
      build: { outDir: distDir },
      preview: { port, strictPort: true, host: '127.0.0.1', open: false },
    });
    baseURL = `http://127.0.0.1:${port}${opts.base}`;
  }
  console.log(`▶ 被测站点 ${baseURL}\n▶ Chrome ${chrome}\n▶ 场景 ${selected.length} 个，并行 ${opts.jobs}：${selected.join(', ')}\n`);

  const results = new Map();
  const live = opts.jobs === 1 || selected.length === 1;
  const report = (r, attempt) => {
    if (!live) {
      console.log(`\n───── ${r.name}${attempt ? ` (重试 ${attempt})` : ''} ─────`);
      process.stdout.write(r.output.endsWith('\n') ? r.output : `${r.output}\n`);
    }
    console.log(`${r.ok ? '✔' : '✘'} ${r.name}  ${fmt(r.ms)}  ${r.passed} ok / ${r.failed} fail`);
  };
  const runWithRetry = async (name) => {
    let r;
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      r = await runScenario(name, baseURL, attempt, live);
      r.attempts = attempt + 1;
      report(r, attempt);
      if (r.ok) break;
    }
    results.set(name, r);
  };

  const t0 = Date.now();
  const parallel = selected.filter((n) => !SERIAL.has(n));
  const serial = selected.filter((n) => SERIAL.has(n));
  const queue = [...parallel];
  await Promise.all(
    Array.from({ length: Math.min(opts.jobs, queue.length) }, async () => {
      while (queue.length) await runWithRetry(queue.shift());
    }),
  );
  for (const n of serial) await runWithRetry(n);
  await cleanup();

  // 汇总
  const rows = selected.map((n) => results.get(n));
  const w = Math.max(...rows.map((r) => r.name.length), 8);
  console.log(`\n══════ e2e 汇总 / summary (${baseURL}) ══════`);
  for (const r of rows) {
    const status = r.ok ? (r.attempts > 1 ? 'FLAKY' : 'PASS ') : 'FAIL ';
    console.log(`${status} ${r.name.padEnd(w)}  ${fmt(r.ms).padStart(6)}  ${String(r.passed).padStart(3)} checks${r.failed ? `, ${r.failed} failed` : ''}${r.ok ? '' : `  → ${relative(root, r.log)}`}`);
  }
  const failed = rows.filter((r) => !r.ok);
  const checks = rows.reduce((s, r) => s + (r.passed ?? 0), 0);
  console.log(`\n${failed.length ? '✘' : '✔'} ${rows.length - failed.length}/${rows.length} 场景通过，${checks} 项检查，用时 ${fmt(Date.now() - t0)}；截图在 ${relative(root, outRoot)}/`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});
