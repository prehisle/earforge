#!/usr/bin/env node
// 首屏体积预算：读取构建产物（默认 dist/）的 index.html，统计入口脚本与 modulepreload 的分块（即首屏必须下载的 JS）
// 以及样式表的 gzip / brotli 大小，超出预算时以非零码退出。npm run check 在构建之后运行。
//
//   node scripts/size-budget.mjs [dist目录]
//
// 预算按 gzip 计（静态托管普遍支持）。体积确有必要增长时，调高下面的数字并在提交说明里写明原因；
// 优先考虑把非首屏代码放进按需加载的分块（见 src/ui/lazyPages.tsx）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/** 预算（KB，gzip） */
const BUDGET = {
  /** 入口分块 */
  entry: 82,
  /** 首屏 JS 合计：入口 + modulepreload 的分块 */
  initial: 127,
  /** 样式表 */
  css: 11,
};

const dist = process.argv[2] ?? 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
/** index.html 里的资源路径（去掉部署子路径前缀）→ dist 下的文件 */
const file = (href) => join(dist, 'assets', href.slice(href.lastIndexOf('/assets/') + '/assets/'.length));
const attr = (re) => [...html.matchAll(re)].map((m) => file(m[1]));

const entry = attr(/<script type="module"[^>]*src="([^"]+)"/g);
const preload = attr(/<link rel="modulepreload"[^>]*href="([^"]+)"/g);
const css = attr(/<link rel="stylesheet"[^>]*href="([^"]+)"/g);
if (entry.length !== 1) throw new Error(`index.html 应有一个入口脚本，找到 ${entry.length} 个`);

const kb = (n) => n / 1024;
function sizes(files) {
  let raw = 0;
  let gz = 0;
  let br = 0;
  for (const f of files) {
    const b = readFileSync(f);
    raw += b.length;
    gz += gzipSync(b, { level: 9 }).length;
    br += brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  }
  return { raw: kb(raw), gz: kb(gz), br: kb(br) };
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
}
// 预缓存总量：同 vite.config.ts 的 swPrecache（除 sw.js 与 .map 外的全部文件）
const precache = listFiles(dist).filter((f) => {
  const r = relative(dist, f);
  return r !== 'sw.js' && !r.startsWith('.') && !r.endsWith('.map');
});
const precacheRaw = kb(precache.reduce((a, f) => a + statSync(f).size, 0));

const rows = [
  ['entry', 'entry (入口)', sizes(entry)],
  ['initial', `initial JS (入口 + ${preload.length} 个 modulepreload)`, sizes([...entry, ...preload])],
  ['css', 'CSS', sizes(css)],
];
const fmt = (n) => n.toFixed(1).padStart(7);
console.log(`${'chunk'.padEnd(36)}    raw KB   gzip KB  brotli KB  budget(gzip)`);
let failed = false;
for (const [key, label, s] of rows) {
  const over = s.gz > BUDGET[key];
  failed ||= over;
  console.log(`${label.padEnd(36)} ${fmt(s.raw)}   ${fmt(s.gz)}   ${fmt(s.br)}    ${fmt(BUDGET[key])}${over ? '  ✗ 超出预算' : ''}`);
}
console.log(`precache: ${precache.length} 个文件，共 ${precacheRaw.toFixed(1)} KB（未压缩）`);
if (failed) {
  console.error('\n首屏体积超出预算（scripts/size-budget.mjs）。请把非首屏代码改为按需加载，或确有必要时调高预算并说明原因。');
  process.exit(1);
}
