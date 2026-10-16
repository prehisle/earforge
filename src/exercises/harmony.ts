// 和声听写：终止式之后听一段四部和声进行（低音 + 三个上方声部），逐个写出每个和弦的级数与转位。
// 进行由功能和声文法生成（T → PD → D → T，可阻碍终止），声部用动态规划选出：上方声部就近进行，
// 不出现平行（及反向）纯五度、纯八度，七音级进下行解决，外声部的导音上行解决。

import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef, Level } from '../engine/types';
import { t } from '../i18n';
import { keyFifths, pitchName, spellInKey, spellWithLetter, tonicLetter, type Score } from '../music/notation';
import { HARMONIC_MINOR_SCALE, MAJOR_SCALE, MODE_BY_ID, keyLabel, mod, type ModeDef } from '../music/theory';
import { cadenceEvents, chooseTonic, level, modeItem, option } from './common';

// ───────────── 和弦表 ─────────────

/** 文法用的内部键（大调写法）。小调里同一个键对应 ⅰ、ⅳ、Ⅵ、ⅱø⁷… */
const KEYS = [
  'I',
  'I6',
  'I64',
  'ii',
  'ii6',
  'ii7',
  'ii65',
  'IV',
  'IV6',
  'V',
  'V6',
  'V7',
  'V65',
  'V43',
  'V42',
  'vi',
  'viio6',
  'V/V',
  'V7/V',
] as const;
export type Key = (typeof KEYS)[number];

/** 内部键 → [根音级数（0 起）, 是否七和弦, 转位]；V/V 为副属和弦（根音 re） */
const SHAPE: Record<Key, [number, boolean, number]> = {
  I: [0, false, 0],
  I6: [0, false, 1],
  I64: [0, false, 2],
  ii: [1, false, 0],
  ii6: [1, false, 1],
  ii7: [1, true, 0],
  ii65: [1, true, 1],
  IV: [3, false, 0],
  IV6: [3, false, 1],
  V: [4, false, 0],
  V6: [4, false, 1],
  V7: [4, true, 0],
  V65: [4, true, 1],
  V43: [4, true, 2],
  V42: [4, true, 3],
  vi: [5, false, 0],
  viio6: [6, false, 1],
  'V/V': [1, false, 0],
  'V7/V': [1, true, 0],
};

/** 小调里的考点 id（未列出的与大调相同） */
const MINOR_ID: Partial<Record<Key, string>> = {
  I: 'i',
  I6: 'i6',
  I64: 'i64',
  ii6: 'iio6',
  ii7: 'iio7',
  ii65: 'iio65',
  IV: 'iv',
  IV6: 'iv6',
  vi: 'VI',
};

// 各级别新增的和弦。小调的 ⅱ° 原位不用，ⅱ°⁶ 提前到第 2 级
export const LEVEL_KEYS: Record<'major' | 'minor', Key[][]> = {
  major: [
    ['I', 'IV', 'V'],
    ['vi', 'ii'],
    ['I6', 'IV6', 'V6', 'ii6'],
    ['V7', 'V65', 'V43', 'V42'],
    ['I64', 'ii7', 'ii65', 'viio6'],
    ['V/V', 'V7/V'],
  ],
  minor: [
    ['I', 'IV', 'V'],
    ['vi', 'ii6'],
    ['I6', 'IV6', 'V6'],
    ['V7', 'V65', 'V43', 'V42'],
    ['I64', 'ii7', 'ii65', 'viio6'],
    ['V/V', 'V7/V'],
  ],
};

const ROMAN_UP = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ'];
const ROMAN_LOW = ['ⅰ', 'ⅱ', 'ⅲ', 'ⅳ', 'ⅴ', 'ⅵ', 'ⅶ'];
const FIG_TRIAD = ['', '⁶', '⁶₄'];
const FIG_SEVENTH = ['⁷', '⁶₅', '⁴₃', '⁴₂'];

export interface HarmonyChord {
  /** 考点 / 选项 id，如 'V65'、'minor:iio6' */
  id: string;
  key: Key;
  minor: boolean;
  /** 显示用：罗马数字 + 数字低音，如 'Ⅴ⁶₅' */
  label: string;
  /** 和弦音（相对主音的半音数）：根音、三音、五音（、七音） */
  tones: number[];
  seventh: boolean;
  inv: number;
}

function makeChord(key: Key, minor: boolean): HarmonyChord {
  const [deg, seventh, inv] = SHAPE[key];
  const scale = minor ? HARMONIC_MINOR_SCALE : MAJOR_SCALE;
  const secondary = key === 'V/V' || key === 'V7/V';
  const tones = secondary
    ? [2, 6, 9, 0].slice(0, seventh ? 4 : 3)
    : [0, 2, 4, 6].slice(0, seventh ? 4 : 3).map((k) => scale[(deg + k) % 7]);
  const third = mod(tones[1] - tones[0], 12);
  const fifth = mod(tones[2] - tones[0], 12);
  const dim = fifth === 6;
  const roman = secondary ? ROMAN_UP[4] : (third === 4 ? ROMAN_UP : ROMAN_LOW)[deg];
  // 减三和弦写 °；减三和弦加小七度（半减七）写 ø
  const quality = dim ? (seventh && mod(tones[3] - tones[0], 12) === 10 ? 'ø' : '°') : '';
  const fig = (seventh ? FIG_SEVENTH : FIG_TRIAD)[inv];
  const label = `${roman}${quality}${fig}${secondary ? `/${ROMAN_UP[4]}` : ''}`;
  const bare = (minor && MINOR_ID[key]) || key;
  return { id: minor ? modeItem(MODE_BY_ID.minor, bare) : bare, key, minor, label, tones, seventh, inv };
}

export const CHORDS: Record<'major' | 'minor', Record<Key, HarmonyChord>> = {
  major: Object.fromEntries(KEYS.map((k) => [k, makeChord(k, false)])) as Record<Key, HarmonyChord>,
  minor: Object.fromEntries(KEYS.map((k) => [k, makeChord(k, true)])) as Record<Key, HarmonyChord>,
};

/** 考点 id → 和弦（两种调式） */
const BY_ID: Record<string, HarmonyChord> = {};
for (const m of [CHORDS.major, CHORDS.minor]) for (const c of Object.values(m)) BY_ID[c.id] = c;

export const harmonyChord = (id: string): HarmonyChord | undefined => BY_ID[id];

// ───────────── 功能和声文法 ─────────────

/** 每个和弦之后可以接哪些和弦（不含自身重复）。Ⅰ⁶₄ 只进到属；属七及其转位按规范解决；Ⅴ/Ⅴ 只进到 Ⅴ 或 Ⅰ⁶₄。 */
export const NEXT: Record<Key, Key[]> = {
  I: ['I6', 'ii', 'ii6', 'ii7', 'ii65', 'IV', 'IV6', 'V', 'V6', 'V7', 'V65', 'V43', 'V42', 'vi', 'viio6', 'V/V', 'V7/V'],
  I6: ['I', 'ii', 'ii6', 'ii7', 'ii65', 'IV', 'V', 'V7', 'V43', 'viio6', 'V/V', 'V7/V'],
  I64: ['V', 'V7'],
  ii: ['ii6', 'ii7', 'V', 'V6', 'V7', 'V65', 'I64', 'viio6'],
  ii6: ['ii65', 'V', 'V7', 'V43', 'V42', 'I64', 'viio6'],
  ii7: ['V', 'V7', 'I64'],
  ii65: ['V', 'V7', 'V42', 'I64'],
  IV: ['I', 'I6', 'ii', 'ii6', 'ii7', 'ii65', 'V', 'V6', 'V7', 'V65', 'V43', 'V42', 'viio6', 'I64', 'V/V', 'V7/V'],
  IV6: ['IV', 'V', 'V7', 'V65', 'I64'],
  V: ['I', 'I6', 'vi', 'V7', 'V65', 'V42'],
  V6: ['I'],
  V7: ['I', 'vi'],
  V65: ['I'],
  V43: ['I', 'I6'],
  V42: ['I6'],
  vi: ['ii', 'ii6', 'ii7', 'ii65', 'IV', 'IV6', 'V', 'I64', 'V/V', 'V7/V'],
  viio6: ['I', 'I6'],
  'V/V': ['V', 'I64'],
  'V7/V': ['V', 'I64'],
};

/** 半终止前可以出现的和弦（下属功能、终止四六、副属） */
const BEFORE_HALF: Key[] = ['ii', 'ii6', 'ii7', 'ii65', 'IV', 'IV6', 'I64', 'V/V', 'V7/V'];

/** 结尾：正格 / 变格终止到 Ⅰ，阻碍终止 Ⅴ(⁷)–ⅵ，或半终止停在 Ⅴ。 */
export function canEnd(prev: Key, last: Key): boolean {
  if (last === 'I') return true;
  if (last === 'vi') return prev === 'V' || prev === 'V7';
  if (last === 'V') return BEFORE_HALF.includes(prev);
  return false;
}

/** 小调里不用的连接：ⅳ⁶（低音 le）→ Ⅴ⁶₅（低音 ti）的低音只能走增二度或减七度 */
const MINOR_SKIP = new Set(['IV6>V65']);
export const minorSkip = (a: Key, b: Key) => MINOR_SKIP.has(`${a}>${b}`);

/** 解决时需要的和弦（自选考点里没有也要放进词汇表） */
export const NEEDS: Partial<Record<Key, Key[]>> = { V42: ['I6'] };

/**
 * 以 Ⅰ 开头、长 len、在第 2 个及之后至少出现一次 item 的合法进行，在所有合法进行中均匀抽取。
 * 没有合法进行时返回 null。skip(a, b) 为真的连接不用（小调）。
 */
export function sequence(
  len: number,
  vocab: Key[],
  item: Key,
  rnd: () => number = Math.random,
  skip: (a: Key, b: Key) => boolean = () => false,
): Key[] | null {
  const ok = new Set(vocab);
  const memo = new Map<string, number>();
  // 从第 pos 个和弦 c 出发（之前是否已出现 item）有多少种合法的结尾
  const count = (pos: number, c: Key, seen: boolean): number => {
    if (pos === len - 1) return seen ? 1 : 0;
    const k = `${pos}|${c}|${seen}`;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let n = 0;
    for (const nx of nexts(pos, c)) n += count(pos + 1, nx, seen || nx === item);
    memo.set(k, n);
    return n;
  };
  const nexts = (pos: number, c: Key) => NEXT[c].filter((nx) => ok.has(nx) && !skip(c, nx) && (pos + 1 < len - 1 || canEnd(c, nx)));
  if (count(0, 'I', false) === 0) return null;
  const seq: Key[] = ['I'];
  let seen = false;
  for (let pos = 0; pos < len - 1; pos++) {
    const c = seq[pos];
    const opts = nexts(pos, c).map((nx) => [nx, count(pos + 1, nx, seen || nx === item)] as const);
    let r = rnd() * opts.reduce((s, [, w]) => s + w, 0);
    let pickK = opts.find(([, w]) => w > 0)![0];
    for (const [nx, w] of opts) {
      if (w <= 0) continue;
      pickK = nx;
      if ((r -= w) < 0) break;
    }
    seq.push(pickK);
    seen ||= pickK === item;
  }
  return seq;
}

// ───────────── 声部进行 ─────────────

/** 音域：低音 E2–C4，上方三个声部 G3–G5 */
export const BASS_RANGE = [40, 60] as const;
export const UPPER_RANGE = [55, 79] as const;
/** 上方声部相邻两个和弦间最多移动的半音数（纯五度） */
export const MAX_UPPER_MOVE = 7;

export const HARD = 1e6;

/** 一个和弦在某调中的全部候选排列：[低音, 次中, 中, 高]（升序），附带自身的代价。 */
function candidates(ch: HarmonyChord, tonicPc: number): { v: number[]; cost: number }[] {
  const pcs = ch.tones.map((x) => mod(tonicPc + x, 12));
  const bassPc = pcs[ch.inv];
  const rel = (m: number) => mod(m - tonicPc, 12);
  const out: { v: number[]; cost: number }[] = [];
  for (let b = BASS_RANGE[0]; b <= BASS_RANGE[1]; b++) {
    if (mod(b, 12) !== bassPc) continue;
    const pool: number[] = [];
    for (let m = Math.max(UPPER_RANGE[0], b + 3); m <= Math.min(UPPER_RANGE[1], b + 36); m++) if (pcs.includes(mod(m, 12))) pool.push(m);
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++)
        for (let k = j + 1; k < pool.length; k++) {
          const v = [b, pool[i], pool[j], pool[k]];
          // 上方三声部在一个八度内（密集 / 近于密集排列），与低音最多相隔两个八度
          if (v[3] - v[1] > 12 || v[1] - b > 24) continue;
          // 低音与次中声部相隔超过八度时略加代价，避免中间空出一大段
          const cost = voicingCost(ch, v, pcs, rel) + Math.max(0, v[1] - b - 12) * 0.25;
          if (cost < HARD) out.push({ v, cost });
        }
  }
  return out;
}

/** 单个排列的代价：缺音、重复音（倍音）是否合规。 */
function voicingCost(ch: HarmonyChord, v: number[], pcs: number[], rel: (m: number) => number): number {
  const count = pcs.map((pc) => v.filter((m) => mod(m, 12) === pc).length);
  const [root, third, fifth] = count;
  if (third === 0 || root === 0) return HARD;
  if (ch.seventh) {
    if (count[3] !== 1) return HARD; // 七音必须有且不重复
    if (fifth === 0) return ch.inv === 0 && root === 2 ? 2 : HARD; // 原位七和弦可省五音、重复根音
    return 0;
  }
  if (fifth === 0) return ch.key === 'I' && root === 3 ? 3 : HARD; // 主和弦可省五音（三个根音）
  const doubled = count.findIndex((n) => n === 2);
  const dpc = pcs[doubled];
  if (rel(dpc) === 11 || (ch.key.includes('/V') && rel(dpc) === 6)) return HARD; // 不重复导音
  if (ch.inv === 2) return doubled === 2 ? 0 : HARD; // 四六和弦重复低音
  if (ch.inv === 1) {
    // ⅱ⁶ 与 ⅶ°⁶ 习惯重复低音；大三和弦的六和弦尽量不重复低音（三音）
    if (ch.key === 'ii6' || ch.key === 'viio6') return doubled === 1 ? 0 : 1;
    return doubled === 1 ? 2 : 0.5;
  }
  return doubled === 0 ? 0 : doubled === 2 ? 1.5 : 3;
}

const isDominant = (k: Key) => (k.startsWith('V') && !k.includes('/')) || k === 'viio6';
const isTonic = (k: Key) => k === 'I' || k === 'I6' || k === 'vi';

/** 平行（或反向）纯五度、纯八度 / 同度：两个声部都动了，而音程的音级不变且为纯五度或纯八度。 */
export function hasParallel(a: number[], b: number[]): boolean {
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++) {
      const ia = mod(a[j] - a[i], 12);
      if ((ia === 0 || ia === 7) && ia === mod(b[j] - b[i], 12) && (a[i] !== b[i] || a[j] !== b[j])) return true;
    }
  return false;
}

/** 相邻两个排列的连接代价（HARD 为不允许）。 */
function moveCost(ca: HarmonyChord, a: number[], cb: HarmonyChord, b: number[], tonicPc: number): number {
  let cost = 0;
  if (hasParallel(a, b)) cost += HARD;
  if (Math.abs(b[0] - a[0]) > 12) cost += HARD;
  else if (Math.abs(b[0] - a[0]) > 7) cost += 2;
  else cost += Math.abs(b[0] - a[0]) * 0.2;
  const rel = (m: number) => mod(m - tonicPc, 12);
  for (let k = 0; k < 4; k++) {
    const d = b[k] - a[k];
    if (k > 0) {
      if (Math.abs(d) > MAX_UPPER_MOVE) cost += HARD;
      cost += Math.abs(d);
      if (k === 3 && Math.abs(d) > 4) cost += 2 * (Math.abs(d) - 4);
      // 声部超越：后一个和弦的音越过前一个和弦相邻声部的音
      if ((k < 3 && b[k] > a[k + 1]) || b[k] < a[k - 1]) cost += 6;
    }
    if (Math.abs(d) === 6) cost += 5; // 三全音跳进
    // 小调的增二度（le ↔ ti），及其转位减七度（低音可以跳这么远）
    if ((rel(a[k]) === 8 && rel(b[k]) === 11) || (rel(a[k]) === 11 && rel(b[k]) === 8)) cost += HARD;
    // 七音：级进下行解决，或作为共同音保持
    if (ca.seventh && mod(a[k] - tonicPc, 12) === mod(ca.tones[3], 12) && !(d === 0 || d === -1 || d === -2)) cost += HARD;
    // 导音 ti 进主和弦：外声部必须上行到 do，内声部可下行到 sol
    if (isDominant(ca.key) && isTonic(cb.key) && rel(a[k]) === 11 && d !== 1) {
      cost += k === 0 || k === 3 ? HARD : d === -4 || d === -3 ? 3 : HARD;
    }
    // 副属的 fi 上行到 sol
    if (ca.key.includes('/V') && rel(a[k]) === 6 && d !== 1) cost += HARD;
  }
  // 外声部同向进入纯五 / 纯八度且高音跳进（隐伏五八度）
  const dir = (x: number) => Math.sign(x);
  const outer = mod(b[3] - b[0], 12);
  if ((outer === 0 || outer === 7) && dir(b[3] - a[3]) === dir(b[0] - a[0]) && dir(b[0] - a[0]) !== 0 && Math.abs(b[3] - a[3]) > 2) cost += 3;
  return cost;
}

/**
 * 为整段进行选排列（维特比）：每个和弦带少量随机扰动，使同一进行的排列有变化。
 * cost ≥ HARD 表示找不到完全合规的排列（极少见，出题时换一个进行）。
 */
export function voiceProgression(
  chords: HarmonyChord[],
  tonicPc: number,
  rnd: () => number = Math.random,
): { voicings: number[][]; cost: number } {
  const cands = chords.map((c) => candidates(c, tonicPc).map((x) => ({ ...x, cost: x.cost + rnd() * 1.5 })));
  let best = cands[0].map((x) => ({ cost: x.cost, path: [x.v] }));
  for (let i = 1; i < chords.length; i++) {
    best = cands[i].map((x) => {
      let top = { cost: Infinity, path: [] as number[][] };
      for (const p of best) {
        const c = p.cost + x.cost + moveCost(chords[i - 1], p.path[p.path.length - 1], chords[i], x.v, tonicPc);
        if (c < top.cost) top = { cost: c, path: [...p.path, x.v] };
      }
      return top;
    });
  }
  const top = best.reduce((a, b) => (b.cost < a.cost ? b : a));
  return { voicings: top.path, cost: top.cost };
}

/** 把第 step 个和弦换成 ch：按前后两个和弦的排列选最顺的一个（对比试听用）。 */
function revoice(ch: HarmonyChord, chords: HarmonyChord[], voicings: number[][], step: number, tonicPc: number): number[] {
  let top = { cost: Infinity, v: [] as number[] };
  for (const x of candidates(ch, tonicPc)) {
    let c = x.cost;
    if (step > 0) c += moveCost(chords[step - 1], voicings[step - 1], ch, x.v, tonicPc);
    if (step < chords.length - 1) c += moveCost(ch, x.v, chords[step + 1], voicings[step + 1], tonicPc);
    if (c < top.cost) top = { cost: c, v: x.v };
  }
  return top.v;
}

// ───────────── 练习 ─────────────

const isMinor = (options: Record<string, string>) => options.mode === 'minor';
const tableOf = (minor: boolean) => (minor ? CHORDS.minor : CHORDS.major);

function harmonyLevels(minor: boolean): Level[] {
  const table = tableOf(minor);
  return LEVEL_KEYS[minor ? 'minor' : 'major'].map((keys, i) =>
    level(
      () => `${i ? '+ ' : ''}${keys.map((k) => table[k].label).join(' · ')}`,
      keys.map((k) => table[k].id),
    ),
  );
}

/** 和弦在调中的名称，如 C 大调的 Ⅴ⁶₅ → G7/B */
function chordSymbol(ch: HarmonyChord, tonicPc: number, mode: ModeDef): string {
  const name = (r: number) => pitchName(spellInKey(tonicPc + r, tonicPc, mode), false);
  const [, th, fi, se] = ch.tones.map((x) => mod(x - ch.tones[0], 12));
  let q = th === 3 ? (fi === 6 ? '°' : 'm') : '';
  if (ch.seventh) q = q === '°' ? (se === 10 ? 'ø7' : '°7') : `${q}7`;
  return `${name(ch.tones[0])}${q}${ch.inv ? `/${name(ch.tones[ch.inv])}` : ''}`;
}

/** 谱上按三度叠置拼写和弦音（Ⅴ/Ⅴ 的 fi 在 G♯ 小调写 C𝄪 而不是 D），调号随调 */
export function harmonyScore(chords: HarmonyChord[], voicings: number[][], tonicPc: number, mode: ModeDef): Score {
  const tl = tonicLetter(tonicPc, mode);
  const notes = voicings.map((v, i) => {
    const ch = chords[i];
    const root = tl + SHAPE[ch.key][0];
    return v.map((m) => spellWithLetter(m, (root + 2 * ch.tones.indexOf(mod(m - tonicPc, 12))) % 7));
  });
  return { notes, fifths: keyFifths(tonicPc, mode), stems: false };
}

const BEAT = 1.2;

/** 选项分组：和弦的和声功能。终止四六和弦按属功能（属的装饰）归组 */
const FUNCTION_OF: Record<Key, 'T' | 'PD' | 'D' | 'sec'> = {
  I: 'T',
  I6: 'T',
  vi: 'T',
  IV: 'PD',
  IV6: 'PD',
  ii: 'PD',
  ii6: 'PD',
  ii7: 'PD',
  ii65: 'PD',
  I64: 'D',
  V: 'D',
  V6: 'D',
  V7: 'D',
  V65: 'D',
  V43: 'D',
  V42: 'D',
  viio6: 'D',
  'V/V': 'sec',
  'V7/V': 'sec',
};

/** 选项的排列顺序：按功能分组，同组相邻（ChoiceGrid 按相邻的同名分组分段） */
const CHOICE_ORDER: Key[] = (['T', 'PD', 'D', 'sec'] as const).flatMap((f) => KEYS.filter((k) => FUNCTION_OF[k] === f));

export const harmony: ExerciseDef = {
  id: 'harmony',
  get title() {
    return t('ex.harmony.title');
  },
  get subtitle() {
    return t('ex.harmony.subtitle');
  },
  icon: 'Ⅴ⁷',
  group: 'tonal',
  heavy: true,
  levels: harmonyLevels(false),
  levelsFor: (options) => harmonyLevels(isMinor(options)),
  options: [
    option(
      'mode',
      'opt.mode',
      [
        ['major', 'mode.major.name'],
        ['minor', 'ex.harmony.minor'],
      ],
      'major',
      true,
    ),
    option(
      'len',
      'ex.harmony.len',
      [
        ['4', 'ex.harmony.len.4'],
        ['6', 'ex.harmony.len.6'],
      ],
      '4',
    ),
  ],
  itemLabel: (it) => BY_ID[it]?.label ?? it,
  generate(item, ctx) {
    const minor = isMinor(ctx.options);
    const mode = minor ? MODE_BY_ID.minor : MODE_BY_ID.major;
    const table = tableOf(minor);
    const tonic = chooseTonic(ctx.settings);
    const keyPc = mod(tonic, 12);
    const len = ctx.options.len === '6' ? 6 : 4;
    // 词汇表：本调式里启用的考点 + Ⅰ Ⅳ Ⅴ + 解决所需的和弦
    const mine = (id: string) => BY_ID[id] && BY_ID[id].minor === minor;
    const target: Key = mine(item) ? BY_ID[item].key : 'I';
    const vocab = new Set<Key>(['I', 'IV', 'V', target, ...ctx.items.filter(mine).map((id) => BY_ID[id].key)]);
    for (const k of [...vocab]) for (const n of NEEDS[k] ?? []) vocab.add(n);
    const all = LEVEL_KEYS[minor ? 'minor' : 'major'].flat();
    // 极少数进行在这个调的音域里排不出完全合规的声部，换一个进行
    let keys: Key[] = [];
    let voicings: number[][] = [];
    for (let tries = 0, cost = Infinity; tries < 20 && cost >= HARD; tries++) {
      const skip = minor ? minorSkip : undefined;
      keys = sequence(len, [...vocab], target, Math.random, skip) ?? sequence(len, all, target, Math.random, skip)!;
      ({ voicings, cost } = voiceProgression(
        keys.map((k) => table[k]),
        keyPc,
      ));
    }
    for (const k of keys) vocab.add(k);
    const chords = keys.map((k) => table[k]);
    // 选项按功能分组（主 / 下属 / 属 / 副属），组内按 CHOICE_ORDER 排列
    const choices = CHOICE_ORDER.filter((k) => vocab.has(k)).map((k) => ({
      id: table[k].id,
      label: table[k].label,
      sub: chordSymbol(table[k], keyPc, mode),
      group: t(`ex.harmony.group.${FUNCTION_OF[k]}`),
    }));
    const answer = chords.map((c) => c.id);
    const play = (vs: number[][]): NoteEvent[] => vs.map((notes, i) => ({ notes, time: i * BEAT, dur: BEAT * 0.95 }));
    return {
      item: table[target].id,
      prelude: cadenceEvents(tonic, mode),
      events: play(voicings),
      // 把第 step 个和弦换成所选和弦（按前后和弦重新排列这一个），其余不变
      choiceEvents: (id, step = 0) => {
        const ch = BY_ID[id];
        if (!ch || id === answer[step]) return play(voicings);
        return play(voicings.map((v, i) => (i === step ? revoice(ch, chords, voicings, step, keyPc) : v)));
      },
      choices,
      answer,
      stepItems: answer,
      score: harmonyScore(chords, voicings, keyPc, mode),
      prompt: t('ex.harmony.prompt', { key: keyLabel(keyPc, mode), n: len, first: table.I.label }),
      explain: chords.map((c) => c.label).join(' → '),
    };
  },
};
