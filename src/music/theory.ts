// 乐理基础：音高、音程、和弦、调式、唱名。所有音高均用 MIDI 编号（C4 = 60）。

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
  name: string; // 中文名
  short: string; // 简写
}

export const INTERVALS: IntervalDef[] = [
  { id: 'P1', semitones: 0, name: '纯一度', short: 'P1' },
  { id: 'm2', semitones: 1, name: '小二度', short: 'm2' },
  { id: 'M2', semitones: 2, name: '大二度', short: 'M2' },
  { id: 'm3', semitones: 3, name: '小三度', short: 'm3' },
  { id: 'M3', semitones: 4, name: '大三度', short: 'M3' },
  { id: 'P4', semitones: 5, name: '纯四度', short: 'P4' },
  { id: 'TT', semitones: 6, name: '三全音', short: 'TT' },
  { id: 'P5', semitones: 7, name: '纯五度', short: 'P5' },
  { id: 'm6', semitones: 8, name: '小六度', short: 'm6' },
  { id: 'M6', semitones: 9, name: '大六度', short: 'M6' },
  { id: 'm7', semitones: 10, name: '小七度', short: 'm7' },
  { id: 'M7', semitones: 11, name: '大七度', short: 'M7' },
  { id: 'P8', semitones: 12, name: '纯八度', short: 'P8' },
];

// 经典参考歌曲，帮助记忆音程（上行）
export const INTERVAL_SONGS: Record<string, string> = {
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
};

// ───────────── 和弦 ─────────────

export interface ChordDef {
  id: string;
  name: string;
  symbol: string;
  intervals: number[]; // 相对根音的半音数
}

export const CHORDS: ChordDef[] = [
  { id: 'maj', name: '大三和弦', symbol: '', intervals: [0, 4, 7] },
  { id: 'min', name: '小三和弦', symbol: 'm', intervals: [0, 3, 7] },
  { id: 'dim', name: '减三和弦', symbol: 'dim', intervals: [0, 3, 6] },
  { id: 'aug', name: '增三和弦', symbol: 'aug', intervals: [0, 4, 8] },
  { id: 'sus2', name: '挂二和弦', symbol: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', name: '挂四和弦', symbol: 'sus4', intervals: [0, 5, 7] },
  { id: 'maj7', name: '大七和弦', symbol: 'maj7', intervals: [0, 4, 7, 11] },
  { id: 'dom7', name: '属七和弦', symbol: '7', intervals: [0, 4, 7, 10] },
  { id: 'min7', name: '小七和弦', symbol: 'm7', intervals: [0, 3, 7, 10] },
  { id: 'm7b5', name: '半减七和弦', symbol: 'm7♭5', intervals: [0, 3, 6, 10] },
  { id: 'dim7', name: '减七和弦', symbol: 'dim7', intervals: [0, 3, 6, 9] },
  { id: 'minMaj7', name: '小大七和弦', symbol: 'm(maj7)', intervals: [0, 3, 7, 11] },
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
  name: string; // 选项中的名称
  label: string; // 题目中的称呼，如「A 小调」
  scale: number[]; // 自然音级（相对主音的半音数，7 个）
  relMajor: number; // 主音到关系大调主音的半音数，决定升降号写法
  cadence: number[][]; // 建立调性的终止式，相对主音的半音数（第一个音为低音）
}

// 唱名一律以 do 为主音（do-based minor：do re me fa sol le te）
export const MODES: ModeDef[] = [
  {
    id: 'major',
    name: '大调',
    label: '大调',
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
    name: '自然小调',
    label: '小调',
    scale: NATURAL_MINOR_SCALE,
    relMajor: 3,
    // ⅰ–ⅳ–Ⅴ–ⅰ，Ⅴ 用和声小调的导音 ti
    cadence: minorCadence(),
  },
  {
    id: 'harmonic',
    name: '和声小调',
    label: '和声小调',
    scale: HARMONIC_MINOR_SCALE,
    relMajor: 3,
    cadence: minorCadence(),
  },
  {
    id: 'dorian',
    name: '多利亚',
    label: '多利亚',
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
    name: '混合利底亚',
    label: '混合利底亚',
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
  name: string; // 中文功能名
  root: number; // 相对主音
  third: number; // 相对根音
  fifth: number;
}

const ROMAN_UP = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ'];
const ROMAN_LOW = ['ⅰ', 'ⅱ', 'ⅲ', 'ⅳ', 'ⅴ', 'ⅵ', 'ⅶ'];
const ASCII_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const FUNC_NAMES = ['主和弦', '上主和弦', '中音和弦', '下属和弦', '属和弦', '下中音和弦', '导和弦'];

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
    name: degree === 6 && root === 10 ? '下主和弦' : FUNC_NAMES[degree],
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

export const NAMING_LABELS: Record<NamingSystem, string> = {
  movable: '首调唱名 (do re mi)',
  jianpu: '简谱 (1 2 3)',
  fixed: '固定调唱名 (C=do)',
  letter: '音名 (C D E)',
};

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
