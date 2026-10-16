// 五线谱的尺寸常量与单个音组的排版（符干方向、二度错位、临时记号分列），供 Staff 与 MeasuredStaff 共用。

import { TOP_LINE, pitchStep, type Pitch } from '../music/notation';

export const SP = 10; // 线间距
export const HALF = SP / 2; // 相邻谱位的高度
export const STEM = 35;
export const HEAD_DX = 11.5; // 二度音并排时符头的水平错开
export const ACC_COL = 10; // 和弦里临时记号每列的宽度
export const GROUP_GAP = 24; // 相邻音组之间的留白
export const MIN_ADVANCE = 40; // 相邻音组中心的最小间距

export type StaffClef = 'treble' | 'bass';

export interface Head {
  p: Pitch;
  step: number;
  acc: number | null;
  /** 0 正常；1 右移；-1 左移（二度音） */
  side: number;
  col: number; // 临时记号所在列
}

export interface Part {
  clef: StaffClef;
  heads: Head[];
  up: boolean;
  left: number; // 相对音组中心向左占用的宽度
  right: number;
}

/** 一个谱表上一个音组的排版：符干方向、二度错位、临时记号分列。forceUp 指定符干方向（符杠组统一方向时用）。 */
export function layoutPart(
  clef: StaffClef,
  pitches: Pitch[],
  accs: (number | null)[],
  stems: boolean,
  forceUp?: boolean,
): Part | null {
  if (!pitches.length) return null;
  const heads: Head[] = pitches
    .map((p, i) => ({ p, step: pitchStep(p), acc: accs[i], side: 0, col: 0 }))
    .sort((a, b) => a.step - b.step);
  const mid = TOP_LINE[clef] - 4;
  const lo = heads[0].step;
  const hi = heads[heads.length - 1].step;
  const up = forceUp ?? (!stems || mid - lo > hi - mid); // 全音符按符干向上的规则错位
  // 二度：符干向上时较高的音移到右边，向下时较低的音移到左边
  if (up) {
    for (let i = 1; i < heads.length; i++)
      if (heads[i].step - heads[i - 1].step === 1 && heads[i - 1].side === 0) heads[i].side = 1;
  } else {
    for (let i = heads.length - 2; i >= 0; i--)
      if (heads[i + 1].step - heads[i].step === 1 && heads[i + 1].side === 0) heads[i].side = -1;
  }
  // 临时记号从上到下依次放进第一个不冲突的列（同列上下至少相隔 6 个谱位）
  const cols: number[][] = [];
  for (const h of [...heads].reverse()) {
    if (h.acc === null) continue;
    let c = cols.findIndex((col) => col.every((s) => Math.abs(s - h.step) >= 6));
    if (c < 0) c = cols.push([]) - 1;
    cols[c].push(h.step);
    h.col = c;
  }
  const shiftL = heads.some((h) => h.side < 0) ? HEAD_DX : 0;
  const shiftR = heads.some((h) => h.side > 0) ? HEAD_DX : 0;
  return { clef, heads, up, left: 7 + shiftL + (cols.length ? 4 + cols.length * ACC_COL : 0), right: 7 + shiftR };
}
