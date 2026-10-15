// 简化节奏谱：单线谱上画符头、符干、符尾/符杠、附点、休止符与三连音记号，4/4 拍。
// 时值单位：1/12 个四分音符，负数为休止（见 Choice.rhythm）。颜色一律用 currentColor。

import type { ReactNode } from 'react';

const TPQ = 12;
const BEATS_PER_BAR = 4;
const LINE = 42; // 谱线 y
const STEM = 28; // 符干长度
const TOP = LINE - STEM;
const H = 62;
const MIN_GAP = 20; // 相邻音符的最小水平间距

interface Ev {
  start: number;
  dur: number;
  rest: boolean;
  x: number;
}

const stemX = (e: Ev) => e.x + 5.2;
const isTriplet = (d: number) => d === 4 || d === 8;
const flagCount = (d: number) => (d === 3 ? 2 : d === 4 || d === 6 || d === 9 ? 1 : 0);
const dotted = (d: number) => d === 9 || d === 18 || d === 36;

/** 水平排版：按拍分配宽度，拍内按时值比例放置，并保证最小间距。返回事件位置、小节线与总宽度。 */
function layout(rhythm: number[]) {
  const evs: Ev[] = [];
  let t = 0;
  for (const d of rhythm) {
    evs.push({ start: t, dur: Math.abs(d), rest: d < 0, x: 0 });
    t += Math.abs(d);
  }
  const nBeats = Math.ceil(t / TPQ);
  const bars: number[] = [];
  let x = 10;
  for (let b = 0; b < nBeats; b++) {
    if (b > 0 && b % BEATS_PER_BAR === 0) {
      bars.push(x);
      x += 12;
    }
    const inBeat = evs.filter((e) => e.start >= b * TPQ && e.start < (b + 1) * TPQ);
    if (!inBeat.length) {
      x += 24;
      continue;
    }
    const offs = inBeat.map((e) => e.start - b * TPQ);
    const gaps = [...offs.slice(1).map((o, i) => o - offs[i]), TPQ - offs[offs.length - 1]];
    if (offs[0] > 0) gaps.push(offs[0]);
    const width = Math.max(40, (MIN_GAP * TPQ) / Math.min(...gaps));
    inBeat.forEach((e, i) => (e.x = x + 6 + (offs[i] / TPQ) * width));
    x += width + 6; // 拍与拍之间留白，便于看清拍子
  }
  return { evs, bars, width: x + 14 };
}

/** 符杠分组：同一拍内连续的、短于四分音符的音符（三连音单独成组）。 */
function beamGroups(evs: Ev[]): Ev[][] {
  const groups: Ev[][] = [];
  let cur: Ev[] = [];
  const flush = () => {
    if (cur.length) groups.push(cur);
    cur = [];
  };
  for (const e of evs) {
    if (e.rest || e.dur >= TPQ) {
      flush();
      continue;
    }
    const prev = cur[cur.length - 1];
    if (prev && (Math.floor(prev.start / TPQ) !== Math.floor(e.start / TPQ) || isTriplet(prev.dur) !== isTriplet(e.dur)))
      flush();
    cur.push(e);
  }
  flush();
  return groups;
}

function Rest({ e }: { e: Ev }) {
  const { x, dur } = e;
  if (dur >= 48) return <rect x={x - 6} y={LINE} width={12} height={5} />;
  if (dur >= 24) return <rect x={x - 6} y={LINE - 5} width={12} height={5} />;
  if (dur >= 12)
    return (
      <path
        d={`M${x - 2.5} ${LINE - 13} L${x + 3} ${LINE - 6} L${x - 2} ${LINE} L${x + 3} ${LINE + 6} C${x - 3} ${LINE + 3} ${x - 4} ${LINE + 8} ${x} ${LINE + 12}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  // 八分休止一个钩，十六分休止两个钩
  const hooks = dur >= 6 ? 1 : 2;
  return (
    <g>
      <line x1={x + 3} y1={LINE - 9} x2={x - 1.5} y2={LINE + 8 + (hooks - 1) * 5} stroke="currentColor" strokeWidth={1.6} />
      {Array.from({ length: hooks }, (_, i) => {
        const y = LINE - 8 + i * 6;
        const hx = x + 3 - i * 1.6;
        return (
          <g key={i}>
            <circle cx={hx - 5} cy={y - 1} r={2.4} />
            <path d={`M${hx - 6} ${y + 1} Q${hx - 2} ${y + 2} ${hx} ${y - 1}`} fill="none" stroke="currentColor" strokeWidth={1.4} />
          </g>
        );
      })}
    </g>
  );
}

function Flag({ sx, i }: { sx: number; i: number }) {
  const y = TOP + i * 6;
  return <path d={`M${sx} ${y} C${sx + 1} ${y + 7} ${sx + 10} ${y + 9} ${sx + 7} ${y + 19} C${sx + 8} ${y + 11} ${sx + 3} ${y + 9} ${sx} ${y + 7}Z`} />;
}

export function RhythmNotation({ rhythm, label }: { rhythm: number[]; label?: string }) {
  const { evs, bars, width } = layout(rhythm);
  const groups = beamGroups(evs);
  const beamed = new Set(groups.filter((g) => g.length > 1).flat());
  const nBars = bars.length + 1;
  const out: ReactNode[] = [];

  for (const [i, e] of evs.entries()) {
    if (e.rest) {
      out.push(<Rest key={`r${i}`} e={e} />);
      if (dotted(e.dur)) out.push(<circle key={`rd${i}`} cx={e.x + 8} cy={LINE - 4} r={1.8} />);
      continue;
    }
    const hollow = e.dur >= 24;
    out.push(
      e.dur >= 48 ? (
        <ellipse key={`h${i}`} cx={e.x} cy={LINE} rx={6.4} ry={4.2} fill="none" stroke="currentColor" strokeWidth={2.4} />
      ) : (
        <ellipse
          key={`h${i}`}
          cx={e.x}
          cy={LINE}
          rx={5.6}
          ry={4}
          transform={`rotate(-20 ${e.x} ${LINE})`}
          fill={hollow ? 'none' : 'currentColor'}
          stroke="currentColor"
          strokeWidth={hollow ? 1.8 : 0}
        />
      ),
    );
    if (e.dur < 48) out.push(<line key={`s${i}`} x1={stemX(e)} y1={LINE - 1} x2={stemX(e)} y2={TOP} stroke="currentColor" strokeWidth={1.4} />);
    if (dotted(e.dur)) out.push(<circle key={`d${i}`} cx={e.x + 10} cy={LINE - 4} r={1.8} />);
    if (!beamed.has(e)) for (let f = 0; f < flagCount(e.dur); f++) out.push(<Flag key={`f${i}-${f}`} sx={stemX(e)} i={f} />);
  }

  // 符杠：第一道连通整组；十六分音符加第二道（相邻十六分之间相连，孤立的画短杠）
  for (const [gi, g] of groups.entries()) {
    if (g.length < 2) continue;
    const x1 = stemX(g[0]) - 0.7;
    const x2 = stemX(g[g.length - 1]) + 0.7;
    out.push(<rect key={`b${gi}`} x={x1} y={TOP} width={x2 - x1} height={4.5} />);
    g.forEach((e, j) => {
      if (e.dur !== 3) return;
      const next = g[j + 1];
      const prev = g[j - 1];
      if (next?.dur === 3) {
        out.push(<rect key={`b${gi}-${j}`} x={stemX(e) - 0.7} y={TOP + 7} width={stemX(next) - stemX(e) + 1.4} height={4.5} />);
      } else if (prev?.dur !== 3) {
        const toLeft = !next;
        const sx = stemX(e);
        out.push(<rect key={`b${gi}-${j}`} x={toLeft ? sx - 7 : sx - 0.7} y={TOP + 7} width={7.7} height={4.5} />);
      }
    });
    if (isTriplet(g[0].dur))
      out.push(
        <text key={`t${gi}`} x={(x1 + x2) / 2} y={TOP - 4} textAnchor="middle" fontSize={11} fontStyle="italic" fontWeight={700}>
          3
        </text>,
      );
  }

  return (
    <svg
      className="rhythm"
      data-bars={nBars}
      viewBox={`0 0 ${width} ${H}`}
      width={width}
      height={H}
      fill="currentColor"
      role="img"
      aria-label={label}
    >
      <line x1={2} y1={LINE} x2={width - 2} y2={LINE} stroke="currentColor" strokeWidth={1} opacity={0.55} />
      {bars.map((bx, i) => (
        <line key={i} x1={bx} y1={LINE - 12} x2={bx} y2={LINE + 12} stroke="currentColor" strokeWidth={1.2} />
      ))}
      <line x1={width - 7} y1={LINE - 12} x2={width - 7} y2={LINE + 12} stroke="currentColor" strokeWidth={1.2} />
      <rect x={width - 4.5} y={LINE - 12} width={3} height={24} />
      {out}
    </svg>
  );
}
