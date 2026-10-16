// 乐理基础：音高、音程、和弦、调式、唱名。所有音高均用 MIDI 编号（C4 = 60）。
// 显示用的名称（音程、和弦、调式、功能名）是按当前界面语言取值的 getter，id 与语言无关。

import { getLocale, t, type Locale } from '../i18n';

export type Midi = number;

export const PITCH_CLASS_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const PITCH_CLASS_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// 优先用降号书写的调（F、B♭、E♭、A♭、D♭）
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]);

export function noteName(midi: Midi, preferFlat = false): string {
  const pc = mod(midi, 12);
  const name = preferFlat ? PITCH_CLASS_FLAT[pc] : PITCH_CLASS_SHARP[pc];
  return `${name}${Math.floor(midi / 12) - 1}`;
}

export function pitchClassName(pc: number, preferFlat = false): string {
  return (preferFlat ? PITCH_CLASS_FLAT : PITCH_CLASS_SHARP)[mod(pc, 12)];
}

/** 该调是否用降号书写：按关系大调判断（如 D 小调 → F 大调 → 降号）。 */
export function prefersFlat(tonicPc: number, mode: ModeDef = MAJOR): boolean {
  return FLAT_KEYS.has(mod(tonicPc + mode.relMajor, 12));
}

export function keyName(tonicPc: number, mode: ModeDef = MAJOR): string {
  return pitchClassName(tonicPc, prefersFlat(tonicPc, mode));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

// ───────────── 音程 ─────────────

export interface IntervalDef {
  id: string;
  semitones: number;
  /** 当前界面语言的名称 */
  readonly name: string;
  short: string; // 简写
}

const INTERVAL_IDS = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'] as const;

export const INTERVALS: IntervalDef[] = INTERVAL_IDS.map((id, semitones) => ({
  id,
  semitones,
  short: id,
  get name() {
    return t(`interval.${id}`);
  },
}));

// 经典参考歌曲，帮助记忆音程（上行）。中文与英文各用本地熟悉的歌，没有把握的音程不列。
export const INTERVAL_SONGS: Record<Locale, Record<string, string>> = {
  zh: {
    m2: '《大白鲨》主题',
    M2: '《生日快乐》前两音',
    m3: '《绿袖子》开头',
    M3: '《When the Saints Go Marching In》开头',
    P4: '《婚礼进行曲》开头',
    TT: '《辛普森一家》开头',
    P5: '《小星星》do-sol',
    m6: '《The Entertainer》 mi-do',
    M6: '《My Bonnie》开头',
    m7: '《Somewhere》（西区故事）',
    M7: '《Take On Me》副歌',
    P8: '《Somewhere Over the Rainbow》开头',
  },
  en: {
    m2: '“Jaws” theme',
    M2: '“Happy Birthday” (“Hap-py Birth-”)',
    m3: '“Greensleeves” (opening)',
    M3: '“When the Saints Go Marching In” (opening)',
    P4: '“Here Comes the Bride” (opening)',
    TT: '“The Simpsons” theme / “Maria” (West Side Story)',
    P5: '“Twinkle Twinkle Little Star” (do–sol)',
    m6: '“The Entertainer” (mi–do, 3rd–4th notes)',
    M6: '“My Bonnie Lies over the Ocean” (opening)',
    m7: '“Somewhere” (West Side Story) / “Star Trek” original theme',
    M7: '“Take On Me” (chorus)',
    P8: '“Somewhere Over the Rainbow” (opening)',
  },
};

/** 当前语言的音程记忆歌曲 */
export function intervalSong(id: string): string | undefined {
  return INTERVAL_SONGS[getLocale()][id];
}

// ───────────── 和弦 ─────────────

export interface ChordDef {
  id: string;
  /** 当前界面语言的名称 */
  readonly name: string;
  symbol: string;
  intervals: number[]; // 相对根音的半音数
}

type ChordId = 'maj' | 'min' | 'dim' | 'aug' | 'sus2' | 'sus4' | 'maj7' | 'dom7' | 'min7' | 'm7b5' | 'dim7' | 'minMaj7';

const chord = (id: ChordId, symbol: string, intervals: number[]): ChordDef => ({
  id,
  symbol,
  intervals,
  get name() {
    return t(`chord.${id}`);
  },
});

export const CHORDS: ChordDef[] = [
  chord('maj', '', [0, 4, 7]),
  chord('min', 'm', [0, 3, 7]),
  chord('dim', 'dim', [0, 3, 6]),
  chord('aug', 'aug', [0, 4, 8]),
  chord('sus2', 'sus2', [0, 2, 7]),
  chord('sus4', 'sus4', [0, 5, 7]),
  chord('maj7', 'maj7', [0, 4, 7, 11]),
  chord('dom7', '7', [0, 4, 7, 10]),
  chord('min7', 'm7', [0, 3, 7, 10]),
  chord('m7b5', 'm7♭5', [0, 3, 6, 10]),
  chord('dim7', 'dim7', [0, 3, 6, 9]),
  chord('minMaj7', 'm(maj7)', [0, 3, 7, 11]),
];

export function chordNotes(root: Midi, chord: ChordDef, inversion = 0): Midi[] {
  const notes = chord.intervals.map((i) => root + i);
  for (let k = 0; k < inversion; k++) {
    const n = notes.shift()!;
    notes.push(n + 12);
  }
  return notes;
}

// ───────────── 调式与级数 ─────────────

export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
export const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
export const HARMONIC_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 11];
export const DORIAN_SCALE = [0, 2, 3, 5, 7, 9, 10];
export const MIXOLYDIAN_SCALE = [0, 2, 4, 5, 7, 9, 10];

export type ModeId = 'major' | 'minor' | 'harmonic' | 'dorian' | 'mixolydian';

export interface ModeDef {
  id: ModeId;
  readonly name: string; // 选项中的名称（当前语言）
  readonly label: string; // 题目中的称呼，如「A 小调」里的「小调」（当前语言）
  scale: number[]; // 自然音级（相对主音的半音数，7 个）
  relMajor: number; // 主音到关系大调主音的半音数，决定升降号写法
  cadence: number[][]; // 建立调性的终止式，相对主音的半音数（第一个音为低音）
}

// 唱名一律以 do 为主音（do-based minor：do re me fa sol le te）
export const MODES: ModeDef[] = [
  {
    id: 'major',
    get name() {
      return t('mode.major.name');
    },
    get label() {
      return t('mode.major.label');
    },
    scale: MAJOR_SCALE,
    relMajor: 0,
    // Ⅰ–Ⅳ–Ⅴ–Ⅰ
    cadence: [
      [-12, 4, 7],
      [-7, 5, 9],
      [-5, 2, 7, 11],
      [-12, 4, 7, 12],
    ],
  },
  {
    id: 'minor',
    get name() {
      return t('mode.minor.name');
    },
    get label() {
      return t('mode.minor.label');
    },
    scale: NATURAL_MINOR_SCALE,
    relMajor: 3,
    // ⅰ–ⅳ–Ⅴ–ⅰ，Ⅴ 用和声小调的导音 ti
    cadence: minorCadence(),
  },
  {
    id: 'harmonic',
    get name() {
      return t('mode.harmonic.name');
    },
    get label() {
      return t('mode.harmonic.label');
    },
    scale: HARMONIC_MINOR_SCALE,
    relMajor: 3,
    cadence: minorCadence(),
  },
  {
    id: 'dorian',
    get name() {
      return t('mode.dorian.name');
    },
    get label() {
      return t('mode.dorian.label');
    },
    scale: DORIAN_SCALE,
    relMajor: 10,
    // ⅰ–Ⅳ–ⅰ：Ⅳ 里的 la 是多利亚的特征音
    cadence: [
      [-12, 3, 7],
      [-7, 5, 9],
      [-12, 3, 7, 12],
    ],
  },
  {
    id: 'mixolydian',
    get name() {
      return t('mode.mixolydian.name');
    },
    get label() {
      return t('mode.mixolydian.label');
    },
    scale: MIXOLYDIAN_SCALE,
    relMajor: 5,
    // Ⅰ–♭Ⅶ–Ⅰ：♭Ⅶ 里的 te 是混合利底亚的特征音
    cadence: [
      [-12, 4, 7],
      [-14, 2, 5, 10],
      [-12, 4, 7, 12],
    ],
  },
];

function minorCadence(): number[][] {
  return [
    [-12, 3, 7], // ⅰ
    [-7, 5, 8], // ⅳ
    [-5, 2, 7, 11], // Ⅴ
    [-12, 3, 7, 12], // ⅰ
  ];
}

export const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<ModeId, ModeDef>;
export const MAJOR = MODE_BY_ID.major;

/** 由选项值取调式，未知值按大调处理（兼容旧数据）。 */
export function modeById(id: string | undefined): ModeDef {
  return MODE_BY_ID[id as ModeId] ?? MAJOR;
}

export interface Triad {
  id: string; // ASCII 级数，如 'bVII'、'ii'
  roman: string; // 显示用，如 '♭Ⅶ'、'ⅱ°'
  readonly name: string; // 功能名（当前语言）
  root: number; // 相对主音
  third: number; // 相对根音
  fifth: number;
}

const ROMAN_UP = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ'];
const ROMAN_LOW = ['ⅰ', 'ⅱ', 'ⅲ', 'ⅳ', 'ⅴ', 'ⅵ', 'ⅶ'];
const ASCII_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** 给定级数（0 起）与三和弦结构，生成罗马数字：大小写表示大小三和弦，° 减、+ 增，升降号相对大调音阶。 */
export function makeTriad(degree: number, root: number, third: number, fifth: number): Triad {
  const minor = third === 3;
  const acc = ['♭', '', '♯'][root - MAJOR_SCALE[degree] + 1] ?? '';
  const quality = fifth === 6 ? '°' : fifth === 8 ? '+' : '';
  const ascii = ASCII_ROMAN[degree];
  return {
    id: `${acc === '♭' ? 'b' : acc === '♯' ? '#' : ''}${minor ? ascii.toLowerCase() : ascii}`,
    roman: `${acc}${(minor ? ROMAN_LOW : ROMAN_UP)[degree]}${quality}`,
    // 第七级：导音（ti）上的叫导和弦，下主音（te）上的叫下主和弦
    get name() {
      return degree === 6 && root === 10 ? t('func.subtonic') : t(`func.${degree as 0 | 1 | 2 | 3 | 4 | 5 | 6}`);
    },
    root,
    third,
    fifth,
  };
}

/** 调式的七个自然三和弦（按三度叠置）。 */
export function diatonicTriads(mode: ModeDef): Triad[] {
  const s = mode.scale;
  return s.map((root, k) => {
    const at = (i: number) => s[(k + i) % 7] + (k + i >= 7 ? 12 : 0) - root;
    return makeTriad(k, root, at(2), at(4));
  });
}

// 半音相对主音 → 级数标签（首调体系，含变化音）
export interface DegreeDef {
  semitone: number;
  movableDo: string; // 首调唱名
  jianpu: string; // 简谱
  roman: string; // 级数
}

export const DEGREES: DegreeDef[] = [
  { semitone: 0, movableDo: 'do', jianpu: '1', roman: 'Ⅰ' },
  { semitone: 1, movableDo: 'ra', jianpu: '♭2', roman: '♭Ⅱ' },
  { semitone: 2, movableDo: 're', jianpu: '2', roman: 'Ⅱ' },
  { semitone: 3, movableDo: 'me', jianpu: '♭3', roman: '♭Ⅲ' },
  { semitone: 4, movableDo: 'mi', jianpu: '3', roman: 'Ⅲ' },
  { semitone: 5, movableDo: 'fa', jianpu: '4', roman: 'Ⅳ' },
  { semitone: 6, movableDo: 'fi', jianpu: '♯4', roman: '♯Ⅳ' },
  { semitone: 7, movableDo: 'sol', jianpu: '5', roman: 'Ⅴ' },
  { semitone: 8, movableDo: 'le', jianpu: '♭6', roman: '♭Ⅵ' },
  { semitone: 9, movableDo: 'la', jianpu: '6', roman: 'Ⅵ' },
  { semitone: 10, movableDo: 'te', jianpu: '♭7', roman: '♭Ⅶ' },
  { semitone: 11, movableDo: 'ti', jianpu: '7', roman: 'Ⅶ' },
];

// 固定调唱名（C = do）
const FIXED_DO = ['do', 'di', 're', 'ri', 'mi', 'fa', 'fi', 'sol', 'si', 'la', 'li', 'ti'];

export type NamingSystem = 'movable' | 'jianpu' | 'fixed' | 'letter';

export const NAMING_SYSTEMS: NamingSystem[] = ['movable', 'jianpu', 'fixed', 'letter'];

/** 命名体系的显示名称（当前语言） */
export function namingLabel(system: NamingSystem): string {
  return t(`naming.${system}`);
}

/** 调名，如「E♭ 大调」/「E♭ major」 */
export function keyLabel(tonicPc: number, mode: ModeDef = MAJOR): string {
  return t('key.name', { tonic: keyName(tonicPc, mode), mode: mode.label });
}

/** 把某个音按指定体系命名。tonicPc 为当前调主音的音级，mode 决定音名的升降号写法。 */
export function nameInSystem(midi: Midi, tonicPc: number, system: NamingSystem, mode: ModeDef = MAJOR): string {
  const rel = mod(midi - tonicPc, 12);
  switch (system) {
    case 'movable':
      return DEGREES[rel].movableDo;
    case 'jianpu':
      return DEGREES[rel].jianpu;
    case 'fixed':
      return FIXED_DO[mod(midi, 12)];
    case 'letter':
      return pitchClassName(midi, prefersFlat(tonicPc, mode));
  }
}

/** 建立调性感的终止式（大调为 Ⅰ–Ⅳ–Ⅴ–Ⅰ），见 MODES。 */
export function cadence(tonic: Midi, mode: ModeDef = MAJOR): Midi[][] {
  return mode.cadence.map((chord) => chord.map((d) => tonic + d));
}

// ───────────── 工具 ─────────────

export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
