// 采样乐器（按需下载，下载后由 service worker 缓存，离线可用）：
// - 采样钢琴：Salamander Grand Piano（Alexander Holm，CC BY 3.0），使用 Tone.js 托管的压缩版。
//   只取 C2–C7、每小三度一个采样，其余音高用 playbackRate 移调（不超过 ±1.5 个半音）。
// - 木吉他、小提琴、长笛：tonejs-instruments（Nicholaus P. Brosowsky 整理，采样 CC BY 3.0），GitHub Pages 托管。
// 覆盖范围以外的音高回退到同类的合成音色。

import type { SampledTimbre, SynthTimbre } from './timbres';

export interface SampledInstrument {
  /** 下载地址前缀（文件名为 C4.mp3、Ds4.mp3 这样的音名，升号写作 s） */
  base: string;
  /** 采样所在的 MIDI 音高（升序） */
  notes: readonly number[];
  /** 最大移调幅度（半音）：超出时回退到合成音色 */
  maxShift: number;
  /** 合计下载量（MB，设置页显示） */
  sizeMb: number;
  /** 力度为 1 时的增益：与合成钢琴响度相当 */
  gain: number;
  /** 松开后的淡出时间（秒） */
  release: number;
  /** 未就绪、下载失败或超出音域时用的合成音色 */
  fallback: SynthTimbre;
}

export const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';
/** tonejs-instruments 的采样目录 */
export const INSTRUMENTS_BASE = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';
/** 21 个 mp3 合计约 1.36 MB */
export const SAMPLE_SIZE_MB = 1.4;

export const SAMPLE_LOW = 36; // C2
export const SAMPLE_HIGH = 96; // C7
const STEP = 3; // 小三度
/** 最大移调幅度（半音）：相邻采样相距 3 个半音，最近采样至多偏 1.5 */
export const MAX_SHIFT = 1.5;

/** 从 low 起每 step 个半音一个采样，直到 high */
const every = (low: number, high: number, step: number) =>
  Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, i) => low + i * step);

/** 采样钢琴所在的 MIDI 音高：36, 39, …, 96 */
export const SAMPLE_NOTES: number[] = every(SAMPLE_LOW, SAMPLE_HIGH, STEP);

const NOTE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];

/** MIDI 音高对应的音名文件名（60 → 'C4.mp3'，63 → 'Ds4.mp3'）；非整数返回 null */
export function noteFile(midi: number): string | null {
  if (!Number.isInteger(midi)) return null;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}.mp3`;
}

/** 采样钢琴的文件名（C4 = 60 → 'C4.mp3'）；不是小三度采样点（C、D#、F#、A）时返回 null */
export function sampleFile(midi: number): string | null {
  if (!Number.isInteger(midi) || ![0, 3, 6, 9].includes(((midi % 12) + 12) % 12)) return null;
  return noteFile(midi);
}

/**
 * 各采样乐器。tonejs-instruments 的文件逐个核对过存在（个别列出的文件实际 404，如 cello/Fs2）。
 * 小提琴、长笛只有每三四度一个采样，最大移调 2–2.5 个半音；吉他取每小三度一个。
 */
export const INSTRUMENTS: Record<SampledTimbre, SampledInstrument> = {
  sampled: { base: SAMPLE_BASE, notes: SAMPLE_NOTES, maxShift: MAX_SHIFT, sizeMb: SAMPLE_SIZE_MB, gain: 3.5, release: 0.15, fallback: 'piano' },
  // E2 G2 A#2 C#3 … C#5（12 个，约 2.2 MB）；最高可移到 E5
  'sampled-guitar': {
    base: `${INSTRUMENTS_BASE}guitar-acoustic/`,
    notes: every(40, 73, 3),
    maxShift: 3,
    sizeMb: 2.2,
    gain: 2,
    release: 0.2,
    fallback: 'guitar',
  },
  // A3 C4 E4 G4 A4 … C7（14 个，约 4.4 MB）
  'sampled-violin': {
    base: `${INSTRUMENTS_BASE}violin/`,
    notes: [57, 60, 64, 67, 69, 72, 76, 79, 81, 84, 88, 91, 93, 96],
    maxShift: 2,
    sizeMb: 4.4,
    gain: 1,
    release: 0.25,
    fallback: 'strings',
  },
  // C4 E4 A4 C5 … C7（10 个，约 1.8 MB）
  'sampled-flute': {
    base: `${INSTRUMENTS_BASE}flute/`,
    notes: [60, 64, 69, 72, 76, 81, 84, 88, 93, 96],
    maxShift: 2.5,
    sizeMb: 1.8,
    gain: 1.05,
    release: 0.15,
    fallback: 'flute',
  },
};

/** 给定音高，返回最近的采样与播放速率；超出覆盖范围（移调超过 maxShift）时返回 null */
export function pickSample(
  midi: number,
  inst: SampledInstrument = INSTRUMENTS.sampled,
): { sample: number; file: string; rate: number } | null {
  if (!Number.isFinite(midi)) return null;
  let sample = inst.notes[0];
  for (const n of inst.notes) if (Math.abs(n - midi) <= Math.abs(sample - midi)) sample = n;
  if (Math.abs(midi - sample) > inst.maxShift) return null;
  return { sample, file: noteFile(sample)!, rate: 2 ** ((midi - sample) / 12) };
}

/** 并行下载并解码某个乐器的全部采样；每完成一个回调一次进度（0..1）。任一失败则整体失败。 */
export async function loadSamples(
  ctx: BaseAudioContext,
  onProgress?: (p: number) => void,
  inst: SampledInstrument = INSTRUMENTS.sampled,
): Promise<Map<number, AudioBuffer>> {
  let done = 0;
  const entries = await Promise.all(
    inst.notes.map(async (n) => {
      const res = await fetch(inst.base + noteFile(n));
      if (!res.ok) throw new Error(`采样下载失败：${res.status} ${res.url}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      onProgress?.(++done / inst.notes.length);
      return [n, buf] as const;
    }),
  );
  return new Map(entries);
}
