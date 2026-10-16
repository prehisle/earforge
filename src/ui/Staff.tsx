// 五线谱：手绘 SVG，画谱号、调号、符头、临时记号、加线与符干（四分音符或全音符）；有时值（score.durs）时交给 MeasuredStaff。
// 拼写与谱位由 music/notation 计算；颜色一律用 currentColor，高亮用 CSS 类（见 index.css「五线谱」）。

import { t } from '../i18n';
import { MeasuredStaff } from './MeasuredStaff';
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
import { Accidental, BassClef, Notehead, TrebleClef } from './staffGlyphs';
import { ACC_COL, GROUP_GAP, HALF, HEAD_DX, MIN_ADVANCE, SP, STEM, layoutPart, type Head, type Part, type StaffClef } from './staffLayout';

// ───── 组件 ─────

interface Props {
  score: Score;
  /** 各音组的高亮（覆盖 score.marks） */
  marks?: Mark[];
  /** 显示倍数（谱面按 viewBox 缩放，且不超过容器宽度）；带时值的谱缺省按宽度自动选择 */
  scale?: number;
  // 以下仅对带时值的谱（score.durs）生效，见 MeasuredStaff
  /** 可用宽度（CSS 像素）；缺省量容器宽度并随之换行 */
  width?: number;
  /** 当前音组的下标：所在小节加底色，并滚动到可见处 */
  current?: number;
  /** current（或 marks 里的 'cur'）变化时自动滚动到所在的那一行；缺省开启 */
  autoScroll?: boolean;
}

export function Staff(props: Props) {
  // 带时值：按小节记谱并换行
  if (props.score.durs?.length) return <MeasuredStaff {...props} />;
  return <PlainStaff {...props} />;
}

function PlainStaff({ score, marks, scale = 1.3 }: Props) {
  const { notes, fifths, stems = false } = score;
  const mk = marks ?? score.marks ?? [];
  const accs = displayAccidentals(notes, fifths);
  const clef = score.clef === 'grand' ? 'grand' : chooseClef(notes.flat().map(pitchStep));
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
