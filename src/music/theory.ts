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

export function keyName(tonicPc: number): string {
  return pitchClassName(tonicPc, FLAT_KEYS.has(mod(tonicPc, 12)));
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

/** 把某个音按指定体系命名。tonicPc 为当前调主音的音级。 */
export function nameInSystem(midi: Midi, tonicPc: number, system: NamingSystem): string {
  const rel = mod(midi - tonicPc, 12);
  switch (system) {
    case 'movable':
      return DEGREES[rel].movableDo;
    case 'jianpu':
      return DEGREES[rel].jianpu;
    case 'fixed':
      return FIXED_DO[mod(midi, 12)];
    case 'letter':
      return pitchClassName(midi, FLAT_KEYS.has(mod(tonicPc, 12)));
  }
}

/** 主-下属-属-主 终止式，用于建立调性感。 */
export function cadence(tonic: Midi): Midi[][] {
  return [
    [tonic - 12, tonic + 4, tonic + 7], // I
    [tonic - 7, tonic + 5, tonic + 9], // IV
    [tonic - 5, tonic + 2, tonic + 7, tonic + 11], // V
    [tonic - 12, tonic + 4, tonic + 7, tonic + 12], // I
  ];
}

// ───────────── 工具 ─────────────

export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
