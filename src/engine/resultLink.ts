// 成绩链接：学生练完固定题目的组合后，把成绩编码进网址的 hash（#r=<code>）发给老师。纯前端，不经过服务器。
//
// 链接自带组合（自包含）：code = <成绩段>.<组合的分享码>
//   - 组合段就是 shareLink 的分享码（base64url，原样拼接，不再套一层 base64，省 1/3 长度）。
//     老师不需要先打开过组合链接；每题的练习与考点由组合的 seed 重新推出（与学生练的完全相同，见 resultDraws）。
//   - 成绩段 = base64url(UTF-8 文本)：
//       1|<校验>|<题数>|<对错位图>|<多步题>|<得分>|<完成时间>|<用时>|<版本>|<姓名>
//     校验 = FNV-1a（同 shareLink）覆盖「题数起的全部文本 + '.' + 组合段」：改动任一段（含换组合）整体作废。
//     对错位图：第 k 题整题答对时置第 k 位；每个十六进制数字依次表示 4 题（低位在前），长度 ⌈题数/4⌉。
//     多步题：只列步骤数 ≥ 2 的题，`题号:答对步数/总步数`，逗号分隔（题号从 0 起，十进制，升序）。
//     得分 = 整题答对的题数（与位图冗余，用于校验）；完成时间 = 分钟时间戳（36 进制）；用时 = 分钟。
//     姓名放最后，内容里的「|」不需要转义。
// 作业指纹（fingerprint）不放进链接，由组合段推出：去掉名称后的组合内容 + seed 的哈希。同一份作业的成绩可归到一起。
// 隐私：链接里只有学生自己填的姓名（可留空）、成绩与时间，没有设备或账号信息。
// 解码对任意输入都不抛异常：长度、版本、结构与取值逐项校验，各字段之间互相核对，无效时返回 null。
import { mulberry32, seededSource } from './seeded';
import { setSource } from './setRunner';
import {
  checksum,
  cleanName,
  decodeSet,
  encodeSet,
  fromBase64Url,
  MAX_CODE,
  toBase64Url,
  toPracticeSet,
  type SharedSet,
} from './shareLink';

export const RESULT_VERSION = 1;
/** hash 参数名：#r=<code> */
const PARAM = 'r';
/** 成绩段长度上限（字符；组合段另按 shareLink 的上限） */
const MAX_PART = 1024;
/** 学生姓名最长字数（按码点） */
export const MAX_STUDENT = 20;
/** 一题最多记录的步骤数 */
const MAX_STEPS = 99;

/** 一题的作答结果：c / n 步首次答对（单步题 n = 1） */
export interface ResultMark {
  ok: boolean;
  c: number;
  n: number;
}

/** 成绩链接的内容 */
export interface ResultData {
  /** 组合（固定题目，必有 seed） */
  set: SharedSet;
  /** 组合的分享码（可直接拼成 #s= 链接） */
  setCode: string;
  /** 作业指纹：同一份作业（内容 + seed 相同，名称可不同）相同 */
  fingerprint: string;
  marks: ResultMark[];
  /** 整题答对的题数 */
  score: number;
  /** 完成时间（毫秒时间戳，精确到分钟） */
  at: number;
  /** 用时（分钟） */
  minutes: number;
  /** 学生使用的应用版本 */
  version: string;
  /** 学生姓名（可为空） */
  name: string;
}

/** 编码的输入：结果与 Quiz 的 QuizResult 结构兼容 */
export interface ResultInput {
  set: SharedSet;
  results: { steps: { ok: boolean }[] }[];
  at: number;
  minutes: number;
  version: string;
  name: string;
}

/** 学生姓名：同组合名称的清理规则，最多 MAX_STUDENT 个字符 */
export function cleanStudent(name: string): string {
  return [...cleanName(name)].slice(0, MAX_STUDENT).join('').trim();
}

/** FNV-1a 32 位，36 进制 7 位（作业指纹用，比校验的 4 位长，不同作业几乎不会撞） */
function fnv32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36).padStart(7, '0');
}

/** 作业指纹：去掉名称后组合的分享码（规范化编码）的哈希 */
export function setFingerprint(set: SharedSet): string {
  return fnv32(encodeSet({ ...set, name: '' }));
}

const markOf = (steps: { ok: boolean }[]): ResultMark => {
  const n = Math.max(1, Math.min(MAX_STEPS, steps.length));
  const c = Math.min(n, steps.filter((s) => s.ok).length);
  return { ok: steps.length > 0 && steps.every((s) => s.ok), c, n };
};

/** 成绩 → 链接参数；不是固定题目、题数与组合不符或组合无效时抛错 */
export function encodeResult(input: ResultInput): string {
  const set = input.set;
  if (set.seed === undefined) throw new Error('result links need a fixed (seeded) set');
  const setCode = encodeSet(set);
  const marks = input.results.map((r) => markOf(r.steps));
  const n = marks.length;
  if (n !== set.count) throw new Error('result count does not match the set');
  const digits: number[] = Array.from({ length: Math.ceil(n / 4) }, () => 0);
  marks.forEach((m, i) => {
    if (m.ok) digits[i >> 2] |= 1 << (i & 3);
  });
  const multi = marks.flatMap((m, i) => (m.n > 1 ? [`${i}:${m.c}/${m.n}`] : [])).join(',');
  const body = [
    String(n),
    digits.map((d) => d.toString(16)).join(''),
    multi,
    String(marks.filter((m) => m.ok).length),
    Math.max(1, Math.floor(input.at / 60000)).toString(36),
    String(Math.max(0, Math.min(9999, Math.round(input.minutes)))),
    /^[0-9A-Za-z.+-]{1,20}$/.test(input.version) ? input.version : '',
    cleanStudent(input.name),
  ].join('|');
  return `${toBase64Url(`${RESULT_VERSION}|${checksum(`${body}.${setCode}`)}|${body}`)}.${setCode}`;
}

/** 链接参数 → 成绩；无效时返回 null（从不抛异常） */
export function decodeResult(code: string): ResultData | null {
  try {
    if (typeof code !== 'string' || code.length > MAX_PART + 1 + MAX_CODE) return null;
    const dot = code.indexOf('.');
    if (dot <= 0 || dot > MAX_PART) return null;
    const head = code.slice(0, dot);
    const setCode = code.slice(dot + 1);
    const text = fromBase64Url(head);
    if (text === null) return null;
    const fields = text.split('|');
    if (fields.length < 10 || fields[0] !== String(RESULT_VERSION)) return null;
    if (fields[1] !== checksum(`${fields.slice(2).join('|')}.${setCode}`)) return null;
    const set = decodeSet(setCode);
    if (!set || set.seed === undefined) return null;
    // 组合段必须是规范编码（避免同一份作业有多种写法）
    if (encodeSet(set) !== setCode) return null;
    const [, , nStr, bits, multi, scoreStr, atStr, minStr, version] = fields;
    const name = fields.slice(9).join('|');

    if (!/^\d{1,3}$/.test(nStr)) return null;
    const n = Number(nStr);
    if (n < 1 || n !== set.count) return null;
    if (!/^[0-9a-f]*$/.test(bits) || bits.length !== Math.ceil(n / 4)) return null;
    const marks: ResultMark[] = [];
    for (let i = 0; i < n; i++) {
      const ok = ((parseInt(bits[i >> 2], 16) >> (i & 3)) & 1) === 1;
      marks.push({ ok, c: ok ? 1 : 0, n: 1 });
    }
    // 位图末尾多余的位必须为 0
    if (n % 4 && parseInt(bits[bits.length - 1], 16) >> (n % 4)) return null;
    let prev = -1;
    for (const e of multi ? multi.split(',') : []) {
      const m = /^(\d{1,3}):(\d{1,2})\/(\d{1,2})$/.exec(e);
      if (!m) return null;
      const [i, c, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (i <= prev || i >= n || k < 2 || c > k || marks[i].ok !== (c === k)) return null;
      marks[i] = { ok: c === k, c, n: k };
      prev = i;
    }
    const score = marks.filter((m) => m.ok).length;
    if (scoreStr !== String(score)) return null;
    if (!/^[0-9a-z]{1,8}$/.test(atStr) || !/^\d{1,4}$/.test(minStr)) return null;
    const at = parseInt(atStr, 36) * 60000;
    if (!(at > 0) || at > 8.64e15) return null;
    if (!/^[0-9A-Za-z.+-]{0,20}$/.test(version)) return null;
    const student = cleanStudent(name);
    if (student !== name) return null;
    return { set, setCode, fingerprint: setFingerprint(set), marks, score, at, minutes: Number(minStr), version, name: student };
  } catch {
    return null;
  }
}

// ───── 每题的练习与考点 ─────

/** 固定题目组合的每一题（练习 id、考点、出题 seed），与学生练习时 SetRun 的题源完全相同 */
export function resultDraws(set: SharedSet): { ex: string; item: string; seed: number }[] {
  if (set.seed === undefined) return [];
  const local = toPracticeSet(set);
  const source = seededSource(setSource(local, mulberry32(set.seed)), set.seed);
  const out: { ex: string; item: string; seed: number }[] = [];
  for (let d = source.next(); d; d = source.next()) out.push({ ex: d.ex.id, item: d.item, seed: d.seed });
  return out;
}

// ───── 网址 ─────

/** 成绩 → 完整网址；参数同 encodeResult */
export function resultUrl(input: ResultInput, base: string = location.origin + import.meta.env.BASE_URL): string {
  return `${base}#${PARAM}=${encodeResult(input)}`;
}

/** 网址的 hash 里是否带成绩参数（无论是否有效） */
export function hasResult(href: string): boolean {
  return /#(?:.*&)?r=/.test(href);
}

/** 网址里成绩参数的原文（未校验）；没有时返回 null */
export function resultCode(href: string): string | null {
  try {
    const i = href.indexOf('#');
    if (i < 0) return null;
    return new URLSearchParams(href.slice(i + 1)).get(PARAM)?.trim() || null;
  } catch {
    return null;
  }
}

/** 从网址解析成绩；没有或无效时返回 null（从不抛异常） */
export function readResult(href: string): ResultData | null {
  const code = resultCode(href);
  return code ? decodeResult(code) : null;
}
