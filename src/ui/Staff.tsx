// 五线谱：手绘 SVG，画谱号、调号、符头、临时记号、加线与符干（四分音符或全音符）。
// 拼写与谱位由 music/notation 计算；颜色一律用 currentColor，高亮用 CSS 类（见 index.css「五线谱」）。

import { t } from '../i18n';
import type { ReactNode } from 'react';
import {
  TOP_LINE,
  chooseClef,
  displayAccidentals,
  keySignatureSteps,
  pitchName,
  pitchStep,
  type Mark,
  type Pitch,
  type Score,
} from '../music/notation';

const SP = 10; // 线间距
const HALF = SP / 2; // 相邻谱位的高度
const STEM = 35;
const HEAD_DX = 11.5; // 二度音并排时符头的水平错开
const ACC_COL = 10; // 和弦里临时记号每列的宽度
const GROUP_GAP = 24; // 相邻音组之间的留白
const MIN_ADVANCE = 40; // 相邻音组中心的最小间距

type StaffClef = 'treble' | 'bass';

interface Head {
  p: Pitch;
  step: number;
  acc: number | null;
  /** 0 正常；1 右移；-1 左移（二度音） */
  side: number;
  col: number; // 临时记号所在列
}

interface Part {
  clef: StaffClef;
  heads: Head[];
  up: boolean;
  left: number; // 相对音组中心向左占用的宽度
  right: number;
}

/** 一个谱表上一个音组的排版：符干方向、二度错位、临时记号分列。 */
function layoutPart(clef: StaffClef, pitches: Pitch[], accs: (number | null)[], stems: boolean): Part | null {
  if (!pitches.length) return null;
  const heads: Head[] = pitches
    .map((p, i) => ({ p, step: pitchStep(p), acc: accs[i], side: 0, col: 0 }))
    .sort((a, b) => a.step - b.step);
  const mid = TOP_LINE[clef] - 4;
  const lo = heads[0].step;
  const hi = heads[heads.length - 1].step;
  const up = !stems || mid - lo > hi - mid; // 全音符按符干向上的规则错位
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

// ───── 字形 ─────

function TrebleClef({ x, gy }: { x: number; gy: number }) {
  // gy 为第二线（G 线）的 y
  const p = (dx: number, dy: number) => `${x + dx} ${gy + dy}`;
  const d = [
    `M${p(2, 4)}`,
    `C${p(-2, 6)} ${p(-5, 3)} ${p(-4, 0)}`,
    `C${p(-4, -5)} ${p(-1, -7)} ${p(2, -7)}`,
    `C${p(6, -7)} ${p(9, -2)} ${p(8, 2)}`,
    `C${p(8, 7)} ${p(4, 10)} ${p(0, 10)}`,
    `C${p(-5, 10)} ${p(-9, 6)} ${p(-9, 1)}`,
    `C${p(-9, -6)} ${p(1, -11)} ${p(3, -16)}`,
    `C${p(6, -21)} ${p(8, -27)} ${p(5, -30)}`,
    `C${p(3, -33)} ${p(-1, -30)} ${p(-1, -24)}`,
    `C${p(-1, -10)} ${p(3, 10)} ${p(3, 22)}`,
    `C${p(3, 27)} ${p(-3, 27)} ${p(-4, 23)}`,
  ].join(' ');
  return (
    <g>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x - 2.4} cy={gy + 22.5} r={2.6} />
    </g>
  );
}

function BassClef({ x, fy }: { x: number; fy: number }) {
  // fy 为第四线（F 线）的 y
  const p = (dx: number, dy: number) => `${x + dx} ${fy + dy}`;
  return (
    <g>
      <circle cx={x - 4} cy={fy + 0.5} r={3.4} />
      <path
        d={`M${p(-7, -0.5)} C${p(-6, -9)} ${p(7, -10)} ${p(8, -1)} C${p(9, 7)} ${p(2, 15)} ${p(-8, 21)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx={x + 13} cy={fy - 4.5} r={1.7} />
      <circle cx={x + 13} cy={fy + 4.5} r={1.7} />
    </g>
  );
}

/** 临时记号字形，(x, y) 为中心。 */
function Accidental({ alt, x, y }: { alt: number; x: number; y: number }) {
  const line = (x1: number, y1: number, x2: number, y2: number, w = 1.3) => (
    <line x1={x + x1} y1={y + y1} x2={x + x2} y2={y + y2} stroke="currentColor" strokeWidth={w} />
  );
  const flat = (dx: number) => (
    <g key={dx}>
      {line(dx - 2.5, -13, dx - 2.5, 4.5)}
      <path
        d={`M${x + dx - 2.5} ${y + 4.5} C${x + dx + 6} ${y - 1} ${x + dx + 3.5} ${y - 6.5} ${x + dx - 2.5} ${y - 1.5}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      />
    </g>
  );
  if (alt === 1)
    return (
      <g>
        {line(-1.8, -8, -1.8, 10)}
        {line(1.8, -10, 1.8, 8)}
        {line(-4.2, -1.6, 4.2, -4.4, 2.6)}
        {line(-4.2, 4.4, 4.2, 1.6, 2.6)}
      </g>
    );
  if (alt === -1) return flat(0);
  if (alt === -2) return <g>{[flat(-3), flat(3)]}</g>;
  if (alt === 2)
    return (
      <g>
        {line(-3.2, -3.2, 3.2, 3.2, 1.8)}
        {line(-3.2, 3.2, 3.2, -3.2, 1.8)}
      </g>
    );
  // 还原号
  return (
    <g>
      {line(-2.2, -10, -2.2, 3.5)}
      {line(2.2, -3.5, 2.2, 10)}
      {line(-2.2, -1.2, 2.2, -3, 2.6)}
      {line(-2.2, 4.4, 2.2, 2.6, 2.6)}
    </g>
  );
}

function Notehead({ x, y, whole }: { x: number; y: number; whole: boolean }) {
  if (!whole) return <ellipse cx={x} cy={y} rx={6} ry={4.3} transform={`rotate(-20 ${x} ${y})`} />;
  // 全音符：外椭圆减去倾斜的内椭圆（evenodd 镂空）
  const t = (55 * Math.PI) / 180;
  const [rx, ry] = [3.6, 2.3];
  const [cx, cy] = [rx * Math.cos(t), rx * Math.sin(t)];
  const d =
    `M${x - 7.2} ${y} a7.2 4.8 0 1 0 14.4 0 a7.2 4.8 0 1 0 -14.4 0Z ` +
    `M${x - cx} ${y - cy} a${rx} ${ry} 55 1 0 ${2 * cx} ${2 * cy} a${rx} ${ry} 55 1 0 ${-2 * cx} ${-2 * cy}Z`;
  return <path d={d} fillRule="evenodd" />;
}

// ───── 组件 ─────

interface Props {
  score: Score;
  /** 各音组的高亮（覆盖 score.marks） */
  marks?: Mark[];
  /** 显示倍数（谱面按 viewBox 缩放，且不超过容器宽度） */
  scale?: number;
}

export function Staff({ score, marks, scale = 1.3 }: Props) {
  const { notes, fifths, stems = false } = score;
  const mk = marks ?? score.marks ?? [];
  const accs = displayAccidentals(notes, fifths);
  const clef = chooseClef(notes.flat().map(pitchStep));
  const staves: StaffClef[] = clef === 'grand' ? ['treble', 'bass'] : [clef];
  // 大谱表：C4 及以上写在高音谱表
  const partOf = (p: Pitch): StaffClef => (clef === 'grand' ? (pitchStep(p) >= 28 ? 'treble' : 'bass') : clef);

  // 水平排版
  const clefX = 22;
  const keyX = 44;
  const sig = Math.abs(fifths);
  let cursor = keyX + sig * 9 + (sig ? 10 : 0);
  let prevX = -Infinity;
  const groups = notes.map((g, gi) => {
    const parts = staves
      .map((st) => {
        const idx = g.flatMap((p, i) => (partOf(p) === st ? [i] : []));
        return layoutPart(
          st,
          idx.map((i) => g[i]),
          idx.map((i) => accs[gi][i]),
          stems,
        );
      })
      .filter((p): p is Part => !!p);
    const left = Math.max(...parts.map((p) => p.left));
    const right = Math.max(...parts.map((p) => p.right));
    const x = Math.max(cursor + left, prevX + MIN_ADVANCE);
    prevX = x;
    cursor = x + right + GROUP_GAP;
    return { x, parts };
  });
  const width = cursor - GROUP_GAP + 26;

  // 垂直排版：大谱表的两行之间按加线留足空间
  const tops: Record<StaffClef, number> = { treble: 0, bass: 0 };
  if (clef === 'grand') {
    const below = Math.max(0, ...groups.flatMap((g) => g.parts.filter((p) => p.clef === 'treble').flatMap((p) => p.heads.map((h) => 30 - h.step))));
    const above = Math.max(0, ...groups.flatMap((g) => g.parts.filter((p) => p.clef === 'bass').flatMap((p) => p.heads.map((h) => h.step - 26))));
    tops.bass = 4 * SP + Math.max(36, (below + above) * HALF + 20);
  }
  const yOf = (st: StaffClef, step: number) => tops[st] + (TOP_LINE[st] - step) * HALF;

  let minY = -14;
  let maxY = tops[staves[staves.length - 1]] + 4 * SP + 18;
  const extend = (y: number) => {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  const out: ReactNode[] = [];
  groups.forEach(({ x, parts }, gi) => {
    const body: ReactNode[] = [];
    for (const part of parts) {
      const { clef: st, heads, up } = part;
      const top = TOP_LINE[st];
      const hx = (h: Head) => x + h.side * HEAD_DX;
      // 加线：每条加线横跨用到它的所有符头
      const ledgers = new Map<number, [number, number]>();
      for (const h of heads) {
        const need: number[] = [];
        for (let s = top + 2; s <= h.step; s += 2) need.push(s);
        for (let s = top - 10; s >= h.step; s -= 2) need.push(s);
        for (const s of need) {
          const [a, b] = ledgers.get(s) ?? [hx(h), hx(h)];
          ledgers.set(s, [Math.min(a, hx(h)), Math.max(b, hx(h))]);
        }
      }
      for (const [s, [a, b]] of ledgers)
        out.push(
          <line key={`l${gi}${st}${s}`} className="staff-line" x1={a - 10} x2={b + 10} y1={yOf(st, s)} y2={yOf(st, s)} />,
        );
      const accLeft = x - 7 - (heads.some((h) => h.side < 0) ? HEAD_DX : 0) - 4;
      for (const h of heads) {
        const y = yOf(st, h.step);
        extend(y - 8);
        extend(y + 8);
        body.push(<Notehead key={`h${h.step}`} x={hx(h)} y={y} whole={!stems} />);
        if (h.acc !== null) {
          extend(y - 14);
          body.push(<Accidental key={`a${h.step}`} alt={h.acc} x={accLeft - ACC_COL / 2 - h.col * ACC_COL} y={y} />);
        }
      }
      if (stems) {
        // 符干至少伸到中线
        const mid = yOf(st, top - 4);
        const yLo = yOf(st, heads[0].step);
        const yHi = yOf(st, heads[heads.length - 1].step);
        const sx = up ? x + 5.6 : x - 5.6;
        const [y1, y2] = up ? [yLo, Math.min(yHi - STEM, mid)] : [yHi, Math.max(yLo + STEM, mid)];
        extend(y2);
        body.push(<line key="stem" x1={sx} x2={sx} y1={y1} y2={y2} stroke="currentColor" strokeWidth={1.3} />);
      }
    }
    const m = mk[gi];
    out.push(
      <g key={`g${gi}`} className={m ? `staff-${m}` : undefined}>
        {body}
      </g>,
    );
  });

  const lines: ReactNode[] = [];
  for (const st of staves) {
    const top = tops[st];
    for (let i = 0; i < 5; i++)
      lines.push(<line key={`${st}${i}`} className="staff-line" x1={4} x2={width - 4} y1={top + i * SP} y2={top + i * SP} />);
    lines.push(
      st === 'treble' ? <TrebleClef key={`c${st}`} x={clefX} gy={top + 3 * SP} /> : <BassClef key={`c${st}`} x={clefX - 2} fy={top + SP} />,
    );
    keySignatureSteps(fifths, st).forEach((s, i) =>
      lines.push(<Accidental key={`k${st}${i}`} alt={fifths > 0 ? 1 : -1} x={keyX + i * 9} y={yOf(st, s)} />),
    );
    // 首尾的竖线
    lines.push(<line key={`e${st}`} className="staff-bar" x1={width - 4} x2={width - 4} y1={top} y2={top + 4 * SP} />);
  }
  if (clef === 'grand') {
    const y1 = tops.treble;
    const y2 = tops.bass + 4 * SP;
    const ym = (y1 + y2) / 2;
    lines.push(<line key="sys" className="staff-bar" x1={4} x2={4} y1={y1} y2={y2} />);
    lines.push(<line key="sys-end" className="staff-bar" x1={width - 4} x2={width - 4} y1={y1} y2={y2} />);
    lines.push(
      <path
        key="brace"
        d={`M2 ${y1} C-5 ${y1 + 16} 3 ${ym - 14} -4 ${ym} C3 ${ym + 14} -5 ${y2 - 16} 2 ${y2}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
      />,
    );
  }
  extend(-14);

  const label = notes.map((g) => g.map((p) => pitchName(p)).join('+')).join(' ');
  const vbX = clef === 'grand' ? -8 : 0;
  const h = maxY - minY + 8;
  const w = width - vbX;
  return (
    <svg
      className="staff"
      viewBox={`${vbX} ${minY - 4} ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      fill="currentColor"
      role="img"
      aria-label={t('staff.aria', { notes: label })}
    >
      {lines}
      {out}
    </svg>
  );
}
