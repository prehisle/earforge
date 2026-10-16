// 跟唱评分：按节拍给每个音一个时间窗，统计窗内检测到的音高，不计八度，±50 音分算唱准。纯函数。

import { mod } from '../music/theory';

/** 一帧音高检测结果：t 为相对旋律开始的秒数；midi 为 null 表示没检测到（太轻或不清晰）。 */
export interface PitchFrame {
  t: number;
  midi: number | null;
}

export interface NoteTarget {
  start: number;
  end: number;
  /** 目标 MIDI；null 为休止（不评分） */
  midi: number | null;
}

export interface NoteResult {
  /** 是否唱准；休止为 null */
  ok: boolean | null;
  /** 窗内音高偏差的中位数（音分，不计八度）；没唱或休止为 null */
  cents: number | null;
  /** 窗内有音高的帧占比 0..1 */
  voiced: number;
}

export interface SingResult {
  notes: NoteResult[];
  /** 唱准的音数 / 需要唱的音数 */
  correct: number;
  total: number;
  /** 音准正确率 0..100（整数） */
  accuracy: number;
}

export const TOLERANCE = 50; // 音分
const MIN_VOICED = 0.3; // 窗内至少这么多帧有音高
const MIN_IN_TUNE = 0.5; // 有音高的帧中至少这么多在容差内

/** 不计八度的音分差（-600..600）。 */
export function centsOff(sung: number, target: number): number {
  return (mod(sung - target + 6, 12) - 6) * 100;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/**
 * 评分：每个音的时间窗去掉开头（起音、换音允许稍晚，最多 120ms 或时值的 25%）和结尾一点，
 * 窗内有音高的帧够多、且多数在 ±50 音分内才算唱准。
 */
export function scoreSinging(targets: NoteTarget[], frames: PitchFrame[]): SingResult {
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const notes = targets.map((n): NoteResult => {
    if (n.midi === null) return { ok: null, cents: null, voiced: 0 };
    const len = n.end - n.start;
    const from = n.start + Math.min(0.12, len * 0.25);
    const to = n.end - Math.min(0.05, len * 0.1);
    const inWin = sorted.filter((f) => f.t >= from && f.t < to);
    const devs = inWin.flatMap((f) => (f.midi === null ? [] : [centsOff(f.midi, n.midi!)]));
    const voiced = inWin.length ? devs.length / inWin.length : 0;
    if (!devs.length) return { ok: false, cents: null, voiced };
    const inTune = devs.filter((d) => Math.abs(d) <= TOLERANCE).length / devs.length;
    return { ok: voiced >= MIN_VOICED && inTune >= MIN_IN_TUNE, cents: Math.round(median(devs)), voiced };
  });
  const scored = notes.filter((n) => n.ok !== null);
  const correct = scored.filter((n) => n.ok).length;
  return {
    notes,
    correct,
    total: scored.length,
    accuracy: scored.length ? Math.round((correct / scored.length) * 100) : 0,
  };
}
