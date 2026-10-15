// 采样钢琴：Salamander Grand Piano（Alexander Holm，CC BY 3.0），使用 Tone.js 托管的压缩版。
// 只取 C2–C7、每小三度一个采样，其余音高用 playbackRate 移调（不超过 ±1.5 个半音）。

export const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';
/** 21 个 mp3 合计约 1.36 MB */
export const SAMPLE_SIZE_MB = 1.4;

export const SAMPLE_LOW = 36; // C2
export const SAMPLE_HIGH = 96; // C7
const STEP = 3; // 小三度
/** 最大移调幅度（半音）：相邻采样相距 3 个半音，最近采样至多偏 1.5 */
export const MAX_SHIFT = 1.5;

/** 采样所在的 MIDI 音高：36, 39, …, 96 */
export const SAMPLE_NOTES: number[] = Array.from(
  { length: (SAMPLE_HIGH - SAMPLE_LOW) / STEP + 1 },
  (_, i) => SAMPLE_LOW + i * STEP,
);

// 文件名只用 C、D#、F#、A 四种，升号写作 s（Ds4、Fs4）
const NAMES: Record<number, string> = { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' };

/** MIDI 音高对应的文件名（C4 = 60 → 'C4.mp3'）；不是小三度采样点时返回 null */
export function sampleFile(midi: number): string | null {
  if (!Number.isInteger(midi)) return null;
  const pc = ((midi % 12) + 12) % 12;
  const name = NAMES[pc];
  if (!name) return null;
  return `${name}${Math.floor(midi / 12) - 1}.mp3`;
}

/** 给定音高，返回最近的采样与播放速率；超出覆盖范围（移调将超过 ±1.5 半音）时返回 null */
export function pickSample(midi: number): { sample: number; file: string; rate: number } | null {
  if (!Number.isFinite(midi)) return null;
  if (midi < SAMPLE_LOW - MAX_SHIFT || midi > SAMPLE_HIGH + MAX_SHIFT) return null;
  const i = Math.min(SAMPLE_NOTES.length - 1, Math.max(0, Math.round((midi - SAMPLE_LOW) / STEP)));
  const sample = SAMPLE_NOTES[i];
  return { sample, file: sampleFile(sample)!, rate: 2 ** ((midi - sample) / 12) };
}

/** 并行下载并解码全部采样；每完成一个回调一次进度（0..1）。任一失败则整体失败。 */
export async function loadSamples(
  ctx: BaseAudioContext,
  onProgress?: (p: number) => void,
  base = SAMPLE_BASE,
): Promise<Map<number, AudioBuffer>> {
  let done = 0;
  const entries = await Promise.all(
    SAMPLE_NOTES.map(async (n) => {
      const res = await fetch(base + sampleFile(n));
      if (!res.ok) throw new Error(`采样下载失败：${res.status} ${res.url}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      onProgress?.(++done / SAMPLE_NOTES.length);
      return [n, buf] as const;
    }),
  );
  return new Map(entries);
}
