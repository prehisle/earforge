// 记谱：把 MIDI 音高拼写成「字母 + 升降号」，并算出调号、谱位、临时记号与谱号。纯函数，供五线谱组件与练习使用。

import { MAJOR, mod, prefersFlat, type ModeDef } from './theory';

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC_TEXT: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/** 拼写后的音：字母（0 = C … 6 = B）与变音（-2..2，负为降）。 */
export interface Pitch {
  midi: number;
  letter: number;
  alt: number;
}

/** 一段谱：按先后排列的音组（单音或和弦）、调号（正数为升号个数，负数为降号个数）。 */
export interface Score {
  notes: Pitch[][];
  fifths: number;
  /** 画成带符干的四分音符（旋律）；否则为全音符（音程、和弦） */
  stems?: boolean;
  /** 各音组的默认高亮（如「这是题目里的那个音」） */
  marks?: Mark[];
}

export type Mark = 'ok' | 'bad' | 'cur' | null | undefined;

/** 用指定字母拼写某个音（变音取最近的，-6..5）。 */
export function spellWithLetter(midi: number, letter: number): Pitch {
  return { midi, letter, alt: mod(midi - NATURAL_PC[letter] + 6, 12) - 6 };
}

/** 按升号或降号的习惯拼写（白键用本字母）。 */
export function spellSimple(midi: number, flat = false): Pitch {
  const pc = mod(midi, 12);
  const nat = NATURAL_PC.indexOf(pc);
  if (nat >= 0) return { midi, letter: nat, alt: 0 };
  return spellWithLetter(midi, NATURAL_PC.indexOf(flat ? pc + 1 : pc - 1));
}

/** 记谱上的八度（B♯3 = C4 的 MIDI 但属于第 3 组）。 */
export function pitchOctave(p: Pitch): number {
  return Math.floor((p.midi - p.alt) / 12) - 1;
}

/** 谱位：每个字母一级，C4 = 28（高音谱表下加一线）。 */
export function pitchStep(p: Pitch): number {
  return pitchOctave(p) * 7 + p.letter;
}

/** 显示用音名，如「E♭4」；withOctave 为 false 时只写「E♭」。 */
export function pitchName(p: Pitch, withOctave = true): string {
  return `${LETTERS[p.letter]}${ACC_TEXT[p.alt] ?? ''}${withOctave ? pitchOctave(p) : ''}`;
}

// ───────────── 调号 ─────────────

/** 调的主音拼写字母：与 keyName 一致（按关系大调决定用升号还是降号）。 */
export function tonicLetter(tonicPc: number, mode: ModeDef = MAJOR): number {
  return spellSimple(tonicPc, prefersFlat(tonicPc, mode)).letter;
}

/** 调号：正数为升号个数，负数为降号个数（如 D 小调 → -1，E 大调 → 4）。 */
export function keyFifths(tonicPc: number, mode: ModeDef = MAJOR): number {
  const major = mod(tonicPc + mode.relMajor, 12);
  // 升号调每多一个升号主音上行纯五度（7 个半音），降号调每多一个降号主音上行纯四度
  return prefersFlat(tonicPc, mode)
    ? -[0, 1, 2, 3, 4, 5].findIndex((k) => mod(5 * k, 12) === major)
    : [0, 1, 2, 3, 4, 5, 6].findIndex((k) => mod(7 * k, 12) === major);
}

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

/** 调号的升降号依次落在哪些字母上。 */
export function keySignatureLetters(fifths: number): number[] {
  return fifths >= 0 ? SHARP_ORDER.slice(0, fifths) : FLAT_ORDER.slice(0, -fifths);
}

/** 调号下每个字母的默认变音（下标为字母）。 */
export function keyAlterations(fifths: number): number[] {
  const alts = [0, 0, 0, 0, 0, 0, 0];
  for (const l of keySignatureLetters(fifths)) alts[l] = fifths > 0 ? 1 : -1;
  return alts;
}

// 相对主音的半音 → 相对主音的字母级数，与简谱写法一致（♭2 ♭3 ♯4 ♭6 ♭7）
const DEGREE_LETTER = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

/**
 * 在某调中拼写：按相对主音的级数取字母（与简谱一致，如 C 小调的 me 写 E♭、D 小调的 ti 写 C♯）。
 * 调式音与导音 ti 照写重升（如 G♯ 和声小调的 F𝄪）；其他变化音出现重升重降时
 * （如 C♯ 混合利底亚的 ♯4）改用该调的升降习惯拼写。
 */
export function spellInKey(midi: number, tonicPc: number, mode: ModeDef = MAJOR): Pitch {
  const rel = mod(midi - tonicPc, 12);
  const p = spellWithLetter(midi, (tonicLetter(tonicPc, mode) + DEGREE_LETTER[rel]) % 7);
  if (Math.abs(p.alt) <= 1 || mode.scale.includes(rel) || rel === 11) return p;
  return spellSimple(midi, keyFifths(tonicPc, mode) < 0);
}

/** 由一调中的音组生成谱（调号随调）。 */
export function keyScore(groups: number[][], tonicPc: number, mode: ModeDef = MAJOR, stems = false): Score {
  return { notes: groups.map((g) => g.map((m) => spellInKey(m, tonicPc, mode))), fifths: keyFifths(tonicPc, mode), stems };
}

// ───────────── 无调号的结构拼写（音程、和弦） ─────────────

/**
 * 按结构拼写一组音：第 i 个音的字母比第一个音高 steps[i] 级（如三和弦 [0, 2, 4]）。
 * 第一个音是黑键时在升号、降号两种写法中取变音总数较少的（重升重降额外计罚），平手按 prefersFlat。
 */
export function spellStack(notes: number[], steps: number[]): Pitch[] {
  const build = (first: Pitch) => notes.map((m, i) => spellWithLetter(m, (first.letter + steps[i]) % 7));
  const cost = (ps: Pitch[]) => ps.reduce((s, p) => s + (Math.abs(p.alt) > 1 ? 4 : Math.abs(p.alt)), 0);
  const sharp = build(spellSimple(notes[0], false));
  const flat = build(spellSimple(notes[0], true));
  const d = cost(sharp) - cost(flat);
  return d < 0 ? sharp : d > 0 ? flat : prefersFlat(notes[0]) ? flat : sharp;
}

/** 和弦音相对根音的字母级数：三度叠置，挂二和弦的二度为 1、挂四和弦的四度为 3。 */
export function chordLetterSteps(intervals: number[]): number[] {
  return intervals.map((iv, k) => (k === 0 ? 0 : iv === 2 ? 1 : iv === 5 ? 3 : 2 * k));
}

/** 音程的度数（1 = 一度 … 8 = 八度）；三全音记作增四度。 */
export function intervalNumber(id: string): number {
  return id === 'TT' ? 4 : Number(id.slice(1));
}

// ───────────── 临时记号与谱号 ─────────────

/**
 * 每个音要显示的临时记号（null 为不显示；0 为还原号）：与调号或本小节前面同位置的音不同才写。
 * 整段谱视为一个小节，临时记号对之后同一谱位的音持续有效。
 */
export function displayAccidentals(groups: Pitch[][], fifths: number): (number | null)[][] {
  const keyAlts = keyAlterations(fifths);
  const cur = new Map<number, number>(); // 谱位 → 当前生效的变音
  return groups.map((g) => {
    const out = g.map((p) => {
      const step = pitchStep(p);
      const now = cur.get(step) ?? keyAlts[p.letter];
      return p.alt === now ? null : p.alt;
    });
    g.forEach((p) => cur.set(pitchStep(p), p.alt));
    return out;
  });
}

export type Clef = 'treble' | 'bass' | 'grand';

/** 按音域选谱号：G3 以上用高音谱表，F4 以下用低音谱表，否则用大谱表。 */
export function chooseClef(steps: number[]): Clef {
  if (!steps.length) return 'treble';
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  if (lo >= 25) return 'treble';
  if (hi <= 31) return 'bass';
  return 'grand';
}

/** 各谱号第五线（最上一线）的谱位：高音谱表 F5、低音谱表 A3。 */
export const TOP_LINE = { treble: 38, bass: 26 } as const;

/** 调号各升降号在谱表上的谱位（低音谱表比高音谱表低两个八度）。 */
export function keySignatureSteps(fifths: number, clef: 'treble' | 'bass'): number[] {
  // 高音谱表的标准位置：升号 F5 C5 G5 D5 A4 E5 B4，降号 B4 E5 A4 D5 G4 C5 F4
  const treble = fifths >= 0 ? [38, 35, 39, 36, 33, 37, 34] : [34, 37, 33, 36, 32, 35, 31];
  return treble.slice(0, Math.abs(fifths)).map((s) => (clef === 'bass' ? s - 14 : s));
}
