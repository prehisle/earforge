// 分享链接：把练习组合编码进网址的 hash（#s=<code>），纯前端解析，不经过服务器，离线可用。
//
// 编码（版本 1）：UTF-8 文本 → base64url（无填充）。文本按位置排列，字段之间用分隔符：
//   1|<校验>|<题数>|<seed，36 进制，可空>|<练习>;<练习>…|<名称>
//   校验 = 其后全部文本的 FNV-1a 哈希（36 进制 4 位）：链接被截断或改动时整体作废，而不是悄悄变成另一套题。
//   练习 = <练习代号>~<考点,考点…>~<选项=值,…>~<权重>（末尾的空字段省略）
// - 练习 id 用固定的短代号（见 CODES；不在表里的写完整 id），选项只写与默认值不同的。
// - 带作用域的考点（如 minor:d3）在其作用域就是该练习当前选项值时省略前缀，解码时补回。
// - 名称放在最后，内容里的「|」不需要转义。
// 解码对任意输入都不抛异常：长度上限、版本号、结构与取值逐项校验，未知的练习 / 考点 / 选项丢弃，无效时返回 null。
import { exerciseById } from '../exercises';
import { levelsOf } from './progress';
import type { PracticeSet, SetPart } from './practiceSet';
import type { ExerciseDef } from './types';

/** 分享时编码的内容（不含本地 id 与创建时间） */
export type SharedSet = Omit<PracticeSet, 'id' | 'created'>;

export const SHARE_VERSION = 1;
/** hash 参数名：#s=<code> */
const PARAM = 's';
/** 编码后长度上限（字符） */
export const MAX_CODE = 4096;
export const MAX_NAME = 40;
export const MAX_PARTS = 12;
export const MAX_ITEMS = 60;
export const MIN_COUNT = 1;
export const MAX_COUNT = 100;
const DEFAULT_COUNT = 20;
const MAX_WEIGHT = 100;

/** 练习 id 的短代号：只能追加，不能修改已有的（旧链接要能解析）。代号不得与任何练习 id 相同。 */
export const CODES: Record<string, string> = {
  degrees: 'dg',
  intervals: 'iv',
  chords: 'ch',
  inversions: 'in',
  scales: 'sc',
  progressions: 'pr',
  harmony: 'hm',
  dictation: 'dc',
  rhythmDictation: 'rd',
  rhythm: 'rh',
  rhythmTap: 'rt',
  singing: 'sg',
};
const BY_CODE: Record<string, string> = Object.fromEntries(Object.entries(CODES).map(([id, c]) => [c, id]));

// ───── base64url（UTF-8） ─────

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 非法输入（字符集、长度、UTF-8）返回 null */
function fromBase64Url(code: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(code) || code.length % 4 === 1) return null;
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

// ───── 校验与清理 ─────

/** 名称：去掉控制字符与分隔用的换行，压缩空白，最多 MAX_NAME 个字符（按码点） */
export function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const s = name.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, MAX_NAME).join('').trim();
}

export function clampCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(n)));
}

/** 选项：只保留练习定义里有的选项与取值；与默认值相同的省略（缺省即默认） */
function cleanOptions(ex: ExerciseDef, options: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of ex.options ?? []) {
    const v = Object.hasOwn(options, o.id) ? options[o.id] : undefined;
    if (typeof v === 'string' && v !== o.default && o.values.some((x) => x.id === v)) out[o.id] = v;
  }
  return out;
}

/** 该练习在这些选项下所有可选的考点 */
export function validItems(ex: ExerciseDef, options: Record<string, string>): Set<string> {
  const full: Record<string, string> = {};
  for (const o of ex.options ?? []) full[o.id] = options[o.id] ?? o.default;
  return new Set(levelsOf(ex, full).flatMap((l) => l.items));
}

/** 清理一个练习：未知练习、没有有效考点时返回 null */
export function cleanPart(part: { ex: unknown; items: unknown; options?: unknown; weight?: unknown }): SetPart | null {
  if (typeof part.ex !== 'string' || !Object.hasOwn(exerciseById, part.ex)) return null;
  const ex: ExerciseDef = exerciseById[part.ex];
  const rawOpts = part.options && typeof part.options === 'object' ? (part.options as Record<string, string>) : {};
  const options = cleanOptions(ex, rawOpts);
  const valid = validItems(ex, options);
  const items = [...new Set(Array.isArray(part.items) ? part.items : [])]
    .filter((i): i is string => typeof i === 'string' && valid.has(i))
    .slice(0, MAX_ITEMS);
  if (!items.length) return null;
  const out: SetPart = { ex: ex.id, items, options };
  const w = part.weight;
  if (typeof w === 'number' && Number.isFinite(w) && w > 0 && w !== 1) out.weight = Math.min(MAX_WEIGHT, w);
  return out;
}

/** 清理整个组合：没有有效练习时返回 null */
export function cleanSet(set: { name?: unknown; parts?: unknown; count?: unknown; seed?: unknown }): SharedSet | null {
  const parts = (Array.isArray(set.parts) ? set.parts : [])
    .slice(0, MAX_PARTS)
    .map((p: unknown) => (p && typeof p === 'object' ? cleanPart(p as SetPart) : null))
    .filter((p): p is SetPart => p !== null);
  if (!parts.length) return null;
  const out: SharedSet = {
    name: cleanName(typeof set.name === 'string' ? set.name : ''),
    parts,
    count: clampCount(typeof set.count === 'number' ? set.count : NaN),
  };
  const seed = set.seed;
  if (typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff) out.seed = seed;
  return out;
}

// ───── 编码 ─────

/** 作用域前缀：带作用域的选项（如调式）取值为 v 时，考点写作 v:xxx */
function scopes(ex: ExerciseDef, options: Record<string, string>): string[] {
  return (ex.options ?? []).filter((o) => o.scoped).map((o) => `${options[o.id] ?? o.default}:`);
}

function encodePart(p: SetPart): string {
  const ex = exerciseById[p.ex];
  const pre = scopes(ex, p.options);
  const items = p.items.map((i) => {
    const s = pre.find((x) => i.startsWith(x));
    return s ? i.slice(s.length) : i;
  });
  const opts = Object.entries(p.options).map(([k, v]) => `${k}=${v}`);
  const fields = [CODES[p.ex] ?? p.ex, items.join(','), opts.join(','), p.weight !== undefined && p.weight !== 1 ? String(p.weight) : ''];
  while (fields.length > 2 && fields[fields.length - 1] === '') fields.pop();
  return fields.join('~');
}

/** 组合 → 分享码（base64url）。会先按解码的规则清理；没有有效练习时抛错。 */
export function encodeSet(set: SharedSet): string {
  const clean = cleanSet(set);
  if (!clean) throw new Error('empty practice set');
  const body = [
    String(clean.count),
    clean.seed !== undefined ? clean.seed.toString(36) : '',
    clean.parts.map(encodePart).join(';'),
    clean.name,
  ].join('|');
  return sealText(body);
}

/** FNV-1a（UTF-16 码元），取 36 进制 4 位 */
function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return (h % 36 ** 4).toString(36).padStart(4, '0');
}

/** 正文（题数起）加上版本与校验，编码为分享码；测试也用它构造输入 */
export function sealText(body: string): string {
  return toBase64Url(`${SHARE_VERSION}|${checksum(body)}|${body}`);
}

// ───── 解码 ─────

function decodePart(s: string): SetPart | null {
  const [code = '', itemStr = '', optStr = '', weightStr = ''] = s.split('~');
  const id = Object.hasOwn(BY_CODE, code) ? BY_CODE[code] : code;
  if (!Object.hasOwn(exerciseById, id)) return null;
  const ex: ExerciseDef = exerciseById[id];
  const options: Record<string, string> = {};
  for (const kv of optStr ? optStr.split(',') : []) {
    const eq = kv.indexOf('=');
    if (eq > 0) options[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  const clean = cleanOptions(ex, options);
  const valid = validItems(ex, clean);
  const pre = scopes(ex, clean);
  const items = (itemStr ? itemStr.split(',') : []).slice(0, MAX_ITEMS * 2).map((i) => {
    if (valid.has(i)) return i;
    return pre.map((x) => x + i).find((x) => valid.has(x)) ?? i;
  });
  const weight = weightStr ? Number(weightStr) : undefined;
  return cleanPart({ ex: id, items, options: clean, weight });
}

/** 分享码 → 组合；无效时返回 null（从不抛异常） */
export function decodeSet(code: string): SharedSet | null {
  try {
    if (typeof code !== 'string' || !code || code.length > MAX_CODE) return null;
    const text = fromBase64Url(code);
    if (text === null) return null;
    const fields = text.split('|');
    if (fields.length < 6 || fields[0] !== String(SHARE_VERSION)) return null;
    if (fields[1] !== checksum(fields.slice(2).join('|'))) return null;
    const [, , countStr, seedStr, partsStr] = fields;
    const name = fields.slice(5).join('|');
    if (!/^\d{1,6}$/.test(countStr)) return null;
    let seed: number | undefined;
    if (seedStr) {
      if (!/^[0-9a-z]{1,7}$/.test(seedStr)) return null;
      seed = parseInt(seedStr, 36);
      if (seed > 0xffffffff) return null;
    }
    const parts = partsStr
      .split(';')
      .slice(0, MAX_PARTS * 2)
      .map(decodePart)
      .filter((p): p is SetPart => p !== null);
    return cleanSet({ name, parts, count: Number(countStr), seed });
  } catch {
    return null;
  }
}

// ───── 网址 ─────

/** 应用根地址（含部署子路径，如 https://x.github.io/earforge/） */
function appBase(): string {
  return location.origin + import.meta.env.BASE_URL;
}

/** 组合 → 完整分享网址（同步）；没有有效练习时抛错 */
export function shareUrl(set: SharedSet, base: string = appBase()): string {
  return `${base}#${PARAM}=${encodeSet(set)}`;
}

/** 网址的 hash 里是否带分享参数（无论是否有效） */
export function hasSharedSet(href: string): boolean {
  return /#(?:.*&)?s=/.test(href);
}

/** 从网址解析分享的组合；没有或无效时返回 null（从不抛异常） */
export function readSharedSet(href: string): SharedSet | null {
  try {
    const i = href.indexOf('#');
    if (i < 0) return null;
    const params = new URLSearchParams(href.slice(i + 1));
    const code = params.get(PARAM);
    return code ? decodeSet(code.trim()) : null;
  } catch {
    return null;
  }
}

/** 由分享的组合生成本地组合（新 id 与创建时间） */
export function toPracticeSet(shared: SharedSet, fallbackName = ''): PracticeSet {
  const set: PracticeSet = {
    id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(36)}`,
    name: shared.name || fallbackName,
    parts: shared.parts.map((p) => ({ ...p, items: [...p.items], options: { ...p.options } })),
    count: shared.count,
    created: Date.now(),
  };
  if (shared.seed !== undefined) set.seed = shared.seed;
  return set;
}
