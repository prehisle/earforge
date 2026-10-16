// 带时值的五线谱：拍号、小节线、符头种类、附点、符尾与符杠、休止符、连音线、三连音、歌词，并按容器宽度在小节线处换行。
// 切小节、符杠分组、间距与换行由 music/rhythmLayout 计算；这里只负责字形与坐标。Score 有 durs 时由 Staff 转到这里。

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { TOP_LINE, chooseClef, keySignatureSteps, pitchName, pitchStep, type Mark, type Pitch, type Score } from '../music/notation';
import {
  beamGroups,
  breakLines,
  measureAccidentals,
  meterInfo,
  spaceMeasure,
  splitMeasures,
  tupletGroups,
  type RItem,
} from '../music/rhythmLayout';
import { Accidental, BassClef, Notehead, TrebleClef } from './staffGlyphs';
import { HALF, HEAD_DX, SP, STEM, layoutPart, type Part, type StaffClef } from './staffLayout';

const BEAM = 4.6; // 符杠粗细
const BEAM_GAP = 7.5; // 两道符杠的间距
const BEAM_STEM = 30; // 有符杠时符干的最短长度（到最外的一道杠；每多一道杠再加 5）
const STEM_X = 5.6; // 符干相对符头中心的水平偏移
const LYRIC_SIZE = 12;
const SYS_GAP = 16; // 两行谱之间的最小留白

/** 歌词的估计宽度（中日韩字符按全角，其他按半角） */
const textWidth = (s: string) => [...s].reduce((w, c) => w + (c.codePointAt(0)! >= 0x2e80 ? LYRIC_SIZE : LYRIC_SIZE * 0.56), 0);

const onLine = (st: StaffClef, step: number) => (TOP_LINE[st] - step) % 2 === 0;

// ───── 休止符与符尾 ─────

function Rest({ x, top, base, whole }: { x: number; top: number; base: number; whole: boolean }) {
  const mid = top + 2 * SP;
  if (whole || base === 1) return <rect x={x - 6} y={top + SP} width={12} height={5} />;
  if (base === 2) return <rect x={x - 6} y={mid - 5} width={12} height={5} />;
  if (base === 4)
    return (
      <path
        d={`M${x - 2.5} ${mid - 13} L${x + 3} ${mid - 6} L${x - 2} ${mid} L${x + 3} ${mid + 6} C${x - 3} ${mid + 3} ${x - 4} ${mid + 8} ${x} ${mid + 12}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  // 八分休止一个钩，十六分休止两个钩
  const hooks = base >= 16 ? 2 : 1;
  const y0 = top + 1.5 * SP;
  return (
    <g>
      <line x1={x + 3} y1={y0 - 1} x2={x - 1.5} y2={y0 + 16 + (hooks - 1) * 6} stroke="currentColor" strokeWidth={1.6} />
      {Array.from({ length: hooks }, (_, i) => {
        const y = y0 + i * 6;
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

/** 符尾：(sx, y) 为符干末端；向上的符干符尾向下弯，向下的符干符尾向上弯。 */
function Flag({ sx, y, up }: { sx: number; y: number; up: boolean }) {
  const s = up ? 1 : -1;
  const p = (dx: number, dy: number) => `${sx + dx} ${y + s * dy}`;
  return <path d={`M${p(0, 0)} C${p(1, 7)} ${p(10, 9)} ${p(7, 19)} C${p(8, 11)} ${p(3, 9)} ${p(0, 7)}Z`} />;
}

/** 连音线：新月形，below 为向下弯。 */
function Tie({ x1, x2, y, below }: { x1: number; x2: number; y: number; below: boolean }) {
  const s = below ? 1 : -1;
  const h = Math.min(7, 3 + (x2 - x1) / 12);
  const mx = (x1 + x2) / 2;
  return <path d={`M${x1} ${y} Q${mx} ${y + s * (h + 1.6)} ${x2} ${y} Q${mx} ${y + s * h} ${x1} ${y}Z`} />;
}

// ───── 排版 ─────

interface Placed {
  it: RItem;
  measure: number;
  sys: number;
  x: number;
  parts: Part[];
  /** 休止符所在的谱表 */
  restStaff: StaffClef;
  /** 是否属于有符杠的组 */
  beamed: boolean;
}

interface Props {
  score: Score;
  marks?: Mark[];
  /** 显示倍数；缺省按宽度自动（窄屏 0.9，宽屏 1.15） */
  scale?: number;
  /** 可用宽度（CSS 像素）；缺省用 ResizeObserver 量容器宽度 */
  width?: number;
  /** 当前音组：所在小节加底色，并滚动到可见处 */
  current?: number;
  /** current（或 marks 中的 'cur'）变化时把所在的那一行谱滚动到可见处；缺省开启 */
  autoScroll?: boolean;
}

export function MeasuredStaff({ score, marks, scale, width, current, autoScroll = true }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (width !== undefined || !el) return;
    const update = () => setMeasured(Math.round(el.clientWidth));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const mk = marks ?? score.marks ?? [];
  const curIdx = current ?? mk.indexOf('cur');
  const lastCur = useRef(curIdx);
  useEffect(() => {
    if (lastCur.current === curIdx) return;
    lastCur.current = curIdx;
    if (!autoScroll || curIdx < 0) return;
    const sys = wrap.current?.querySelector('[data-cur-sys]');
    sys?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [curIdx, autoScroll]);

  const cssW = Math.max(200, width ?? measured ?? 640);
  const k = scale ?? (cssW < 480 ? 0.9 : 1.15);
  return (
    <div ref={wrap} className="staff-flow">
      {engrave(score, mk, cssW, k, current, curIdx)}
    </div>
  );
}

function engrave(score: Score, mk: Mark[], cssW: number, k: number, current: number | undefined, curIdx: number) {
  const { notes, fifths, meter = [4, 4], pickup = 0, lyrics = [] } = score;
  const durs = notes.map((_, i) => score.durs?.[i] ?? 1);
  const measures = splitMeasures(
    durs,
    notes.map((g) => !g.length),
    meter,
    pickup,
  );
  const accs = measureAccidentals(measures, notes, fifths);
  const clef = chooseClef(notes.flat().map(pitchStep));
  const staves: StaffClef[] = clef === 'grand' ? ['treble', 'bass'] : [clef];
  const partOf = (p: Pitch): StaffClef => (clef === 'grand' ? (pitchStep(p) >= 28 ? 'treble' : 'bass') : clef);
  const mid = (st: StaffClef) => TOP_LINE[st] - 4;
  const { bar } = meterInfo(meter);

  // 休止符放在前一个音（没有则后一个音）所在的谱表
  const restStaffOf = (src: number): StaffClef => {
    if (clef !== 'grand') return clef;
    for (let d = 1; d < notes.length; d++)
      for (const j of [src - d, src + d]) if (notes[j]?.length) return partOf(notes[j][0]);
    return 'treble';
  };

  // ── 每个音组的排版（符干方向由符杠组统一决定） ──
  const beams = measures.map((m) => beamGroups(m, meter));
  const tuplets = measures.map((m) => tupletGroups(m));
  const placed: Placed[][] = measures.map((m, mi) => {
    const upOf = new Map<string, boolean>(); // `${item}:${staff}` → 统一的符干方向
    for (const g of beams[mi])
      for (const st of staves) {
        const cs = g.flatMap((i) => {
          const ss = notes[m.items[i].src].filter((p) => partOf(p) === st).map(pitchStep);
          return ss.length ? [(Math.min(...ss) + Math.max(...ss)) / 2] : [];
        });
        if (!cs.length) continue;
        const up = cs.reduce((a, b) => a + b, 0) / cs.length < mid(st);
        for (const i of g) upOf.set(`${i}:${st}`, up);
      }
    const inBeam = new Set(beams[mi].flat());
    return m.items.map((it, i) => {
      const g = notes[it.src];
      const parts = it.rest
        ? []
        : staves
            .map((st) => {
              const idx = g.flatMap((p, j) => (partOf(p) === st ? [j] : []));
              return layoutPart(
                st,
                idx.map((j) => g[j]),
                idx.map((j) => accs[mi][i][j]),
                it.value.base > 1,
                upOf.get(`${i}:${st}`),
              );
            })
            .filter((p): p is Part => !!p);
      return { it, measure: mi, sys: 0, x: 0, parts, restStaff: restStaffOf(it.src), beamed: inBeam.has(i) };
    });
  });

  // ── 小节内间距 ──
  const lyricOf = (it: RItem) => (it.rest || it.cont ? '' : (lyrics[it.src] ?? ''));
  const spaced = placed.map((ps) => {
    const res = spaceMeasure(
      ps.map((p) => {
        const { it } = p;
        const dotW = it.value.dots ? 6 + it.value.dots * 5 : 0;
        if (it.rest) return { dur: it.dur, left: 7, right: 7 + dotW, text: 0 };
        const shiftR = p.parts.some((pt) => pt.heads.some((h) => h.side > 0)) ? HEAD_DX : 0;
        const flagW = !p.beamed && it.value.base >= 8 && p.parts.some((pt) => pt.up) ? 15 : 0;
        return {
          dur: it.dur,
          left: Math.max(...p.parts.map((pt) => pt.left)),
          right: Math.max(...p.parts.map((pt) => pt.right), 7 + shiftR + dotW, flagW),
          text: textWidth(lyricOf(it)),
        };
      }),
    );
    // 整小节休止的小节至少留出一个全音符的宽度
    if (ps.length === 1 && ps[0].it.fullBar) res.width = Math.max(res.width, 56);
    return res;
  });

  // ── 换行与两端对齐 ──
  const avail = cssW / k - 6; // 右侧留出终止线
  const sig = Math.abs(fifths);
  const clefX = 22;
  const keyX = 44;
  const header = keyX - 6 + sig * 9 + (sig ? 6 : 0);
  const tsX = header + 8;
  const firstHeader = header + 22;
  const lines = breakLines(
    spaced.map((s) => s.width),
    avail,
    header,
    firstHeader,
  );
  const mStart: number[] = [];
  const mWidth: number[] = [];
  const sysEnd: number[] = [];
  let prevF = 1;
  lines.forEach((ms, si) => {
    const h = si === 0 ? firstHeader : header;
    const natural = ms.reduce((s, mi) => s + spaced[mi].width, 0);
    const last = si === lines.length - 1;
    // 两端对齐；最后一行不比上一行更稀疏（只有一行且很短时保持自然宽度）
    const fit = (avail - h) / natural;
    const f = last ? Math.min(fit, si ? prevF : h + natural < avail * 0.7 ? 1 : fit) : fit;
    prevF = Math.max(1, f);
    let x = h;
    for (const mi of ms) {
      mStart[mi] = x;
      mWidth[mi] = spaced[mi].width * f;
      placed[mi].forEach((p, j) => {
        p.sys = si;
        p.x = p.it.fullBar ? x + mWidth[mi] / 2 : x + spaced[mi].xs[j] * f;
      });
      x += mWidth[mi];
    }
    sysEnd[si] = x;
  });

  // ── 垂直：大谱表两行之间按加线留足空间 ──
  const all = placed.flat();
  const tops: Record<StaffClef, number> = { treble: 0, bass: 0 };
  if (clef === 'grand') {
    const heads = (st: StaffClef) => all.flatMap((p) => p.parts.filter((pt) => pt.clef === st).flatMap((pt) => pt.heads));
    const below = Math.max(0, ...heads('treble').map((h) => 30 - h.step));
    const above = Math.max(0, ...heads('bass').map((h) => h.step - 26));
    tops.bass = 4 * SP + Math.max(40, (below + above) * HALF + 24);
  }
  const yOf = (st: StaffClef, step: number) => tops[st] + (TOP_LINE[st] - step) * HALF;
  const bottom = tops[staves[staves.length - 1]] + 4 * SP;

  // 每行谱单独收集字形与上下范围
  const sysOut: ReactNode[][] = lines.map(() => []);
  const ext = lines.map(() => ({ min: -12, max: bottom + 10 }));
  const extend = (si: number, y: number) => {
    ext[si].min = Math.min(ext[si].min, y);
    ext[si].max = Math.max(ext[si].max, y);
  };
  // 每个音组画在自己的 <g> 里（带高亮类），以便 marks 着色
  const groupNodes = new Map<Placed, ReactNode[]>();
  const body = (p: Placed) => {
    let b = groupNodes.get(p);
    if (!b) groupNodes.set(p, (b = []));
    return b;
  };

  // 当前小节底色
  const curMeasure = current !== undefined ? measures.findIndex((m) => m.items.some((it) => it.src === current)) : -1;
  if (curMeasure >= 0) {
    const si = placed[curMeasure][0].sys;
    for (const st of staves)
      sysOut[si].push(
        <rect
          key={`cm${st}`}
          className="staff-cur-bar"
          x={mStart[curMeasure] + 1}
          y={tops[st] - 6}
          width={mWidth[curMeasure] - 2}
          height={4 * SP + 12}
          rx={4}
        />,
      );
  }

  // 符干末端（有符杠的音由符杠决定）
  const stemEnd = new Map<Part, number>();

  // ── 符杠 ──
  measures.forEach((_, mi) => {
    for (const [gi, g] of beams[mi].entries())
      for (const st of staves) {
        // 一组里在这个谱表上的连续音（大谱表上旋律跨谱表时分段）
        const runs: Placed[][] = [];
        let run: Placed[] = [];
        for (const i of g) {
          const p = placed[mi][i];
          if (p.parts.some((pt) => pt.clef === st)) run.push(p);
          else if (run.length) {
            runs.push(run);
            run = [];
          }
        }
        if (run.length) runs.push(run);
        for (const [ri, r] of runs.entries()) {
          const partsOf = r.map((p) => p.parts.find((pt) => pt.clef === st)!);
          if (r.length < 2) {
            // 落单的音改画符尾
            r[0].beamed = false;
            continue;
          }
          const si = r[0].sys;
          const up = partsOf[0].up;
          const s = up ? -1 : 1;
          const levels = r.map((p) => (p.it.value.base >= 16 ? 2 : 1));
          const minLen = BEAM_STEM + (Math.max(...levels) - 1) * 5;
          const sx = r.map((p) => (up ? p.x + STEM_X : p.x - STEM_X));
          // 每个音理想的符杠位置：离最远的符头 minLen，且至少到中线
          const midY = yOf(st, mid(st));
          const ideal = partsOf.map((pt) => {
            const ys = pt.heads.map((h) => yOf(st, h.step));
            const y = up ? Math.min(...ys) - minLen : Math.max(...ys) + minLen;
            return up ? Math.min(y, midY) : Math.max(y, midY);
          });
          const n = r.length;
          const dx = sx[n - 1] - sx[0];
          const rise = Math.max(-SP, Math.min(SP, (ideal[n - 1] - ideal[0]) / 2));
          const slope = dx > 0 ? rise / dx : 0;
          const line = (x: number) => ideal[0] + slope * (x - sx[0]);
          // 整条杠平移，使每个符干都不短于 minLen
          const shift = up ? Math.max(0, ...sx.map((x, j) => line(x) - ideal[j])) : Math.min(0, ...sx.map((x, j) => line(x) - ideal[j]));
          const by = (x: number) => line(x) - shift;
          partsOf.forEach((pt, j) => stemEnd.set(pt, by(sx[j])));
          const poly = (x1: number, x2: number, off: number, key: string) => {
            const y1 = by(x1) - s * off;
            const y2 = by(x2) - s * off;
            const t = up ? BEAM : -BEAM;
            extend(si, Math.min(y1, y2, y1 + t, y2 + t));
            extend(si, Math.max(y1, y2, y1 + t, y2 + t));
            return <path key={key} d={`M${x1} ${y1} L${x2} ${y2} L${x2} ${y2 + t} L${x1} ${y1 + t}Z`} />;
          };
          const key = `b${mi}-${gi}-${st}-${ri}`;
          const nodes: ReactNode[] = [poly(sx[0] - 0.65, sx[n - 1] + 0.65, 0, key)];
          // 第二道杠：相邻十六分之间相连，孤立的画短杠（最后一个朝左，其余朝右）
          for (let j = 0; j < n; j++) {
            if (levels[j] < 2) continue;
            if (levels[j + 1] === 2) nodes.push(poly(sx[j] - 0.65, sx[j + 1] + 0.65, BEAM_GAP, `${key}-${j}`));
            else if (levels[j - 1] !== 2) {
              const left = j === n - 1;
              nodes.push(poly(left ? sx[j] - 8 : sx[j] - 0.65, left ? sx[j] + 0.65 : sx[j] + 8, BEAM_GAP, `${key}-${j}`));
            }
          }
          // 三连音的「3」写在符杠外侧
          const tg = tuplets[mi].find((tg) => tg.length === g.length && tg.every((i, j) => i === g[j]));
          if (tg && r.length === g.length) {
            const cx = (sx[0] + sx[n - 1]) / 2;
            const ty = up ? by(cx) - 5 : by(cx) + 13;
            extend(si, ty - 10);
            extend(si, ty + 2);
            nodes.push(
              <text key={`${key}-3`} x={cx} y={ty} textAnchor="middle" fontSize={11} fontStyle="italic" fontWeight={700}>
                3
              </text>,
            );
          }
          // 符杠颜色：整组同一高亮时跟随，否则用默认色
          const m0 = mk[r[0].it.src];
          const same = r.every((p) => mk[p.it.src] === m0);
          sysOut[si].push(
            <g key={key} className={same && m0 ? `staff-${m0}` : undefined}>
              {nodes}
            </g>,
          );
        }
      }
    // 没有符杠的三连音：在上方画括号与「3」
    for (const [ti, tg] of tuplets[mi].entries()) {
      const ps = tg.map((i) => placed[mi][i]);
      if (ps.every((p) => p.beamed) && beams[mi].some((g) => g.length === tg.length && g[0] === tg[0])) continue;
      const si = ps[0].sys;
      const x1 = ps[0].x - 6;
      const x2 = ps[ps.length - 1].x + 6;
      const st = ps[0].parts[0]?.clef ?? ps[0].restStaff;
      const hi = Math.min(
        tops[st] - 8,
        ...ps.flatMap((p) => p.parts.flatMap((pt) => pt.heads.map((h) => yOf(pt.clef, h.step) - (pt.up ? STEM + 4 : 10)))),
      );
      const y = hi - 4;
      const cx = (x1 + x2) / 2;
      extend(si, y - 12);
      sysOut[si].push(
        <g key={`tp${mi}-${ti}`}>
          <path d={`M${x1} ${y + 4} L${x1} ${y} L${cx - 6} ${y} M${cx + 6} ${y} L${x2} ${y} L${x2} ${y + 4}`} fill="none" stroke="currentColor" strokeWidth={1} />
          <text x={cx} y={y + 4} textAnchor="middle" fontSize={11} fontStyle="italic" fontWeight={700}>
            3
          </text>
        </g>,
      );
    }
  });

  // ── 音符与休止符 ──
  for (const p of all) {
    const { it, x, sys: si } = p;
    const b = body(p);
    if (it.rest) {
      const top = tops[p.restStaff];
      b.push(<Rest key="r" x={x} top={top} base={it.value.base} whole={it.fullBar} />);
      if (!it.fullBar)
        for (let d = 0; d < it.value.dots; d++) b.push(<circle key={`rd${d}`} cx={x + 10 + d * 5} cy={top + 1.5 * SP} r={1.8} />);
      continue;
    }
    for (const part of p.parts) {
      const { clef: st, heads, up } = part;
      const top = TOP_LINE[st];
      const hx = (h: (typeof heads)[number]) => x + h.side * HEAD_DX;
      // 加线
      const ledgers = new Map<number, [number, number]>();
      for (const h of heads) {
        const need: number[] = [];
        for (let s = top + 2; s <= h.step; s += 2) need.push(s);
        for (let s = top - 10; s >= h.step; s -= 2) need.push(s);
        for (const s of need) {
          const [a, c] = ledgers.get(s) ?? [hx(h), hx(h)];
          ledgers.set(s, [Math.min(a, hx(h)), Math.max(c, hx(h))]);
        }
      }
      for (const [s, [a, c]] of ledgers)
        sysOut[si].push(
          <line key={`l${it.src}-${it.start}-${st}${s}`} className="staff-line" x1={a - 10} x2={c + 10} y1={yOf(st, s)} y2={yOf(st, s)} />,
        );
      const accLeft = x - 7 - (heads.some((h) => h.side < 0) ? HEAD_DX : 0) - 4;
      const shiftR = heads.some((h) => h.side > 0) ? HEAD_DX : 0;
      const dotYs = new Set<number>();
      for (const h of heads) {
        const y = yOf(st, h.step);
        extend(si, y - 8);
        extend(si, y + 8);
        b.push(<Notehead key={`h${st}${h.step}`} x={hx(h)} y={y} whole={it.value.base === 1} half={it.value.base === 2} />);
        if (h.acc !== null) {
          extend(si, y - 14);
          b.push(<Accidental key={`a${st}${h.step}`} alt={h.acc} x={accLeft - 5 - h.col * 10} y={y} />);
        }
        if (it.value.dots) dotYs.add(onLine(st, h.step) ? y - HALF : y);
      }
      for (const dy of dotYs)
        for (let d = 0; d < it.value.dots; d++) b.push(<circle key={`d${st}${dy}-${d}`} cx={x + 10 + shiftR + d * 5} cy={dy} r={1.8} />);
      if (it.value.base > 1) {
        const yLo = yOf(st, heads[0].step);
        const yHi = yOf(st, heads[heads.length - 1].step);
        const sx = up ? x + STEM_X : x - STEM_X;
        const flags = p.beamed ? 0 : it.value.base >= 16 ? 2 : it.value.base >= 8 ? 1 : 0;
        const len = STEM + (flags > 1 ? 5 : 0);
        const midY = yOf(st, top - 4);
        const y1 = up ? yLo : yHi;
        const y2 = stemEnd.get(part) ?? (up ? Math.min(yHi - len, midY) : Math.max(yLo + len, midY));
        extend(si, y2);
        b.push(<line key={`s${st}`} x1={sx} x2={sx} y1={y1} y2={y2} stroke="currentColor" strokeWidth={1.3} />);
        for (let f = 0; f < flags; f++) {
          const fy = up ? y2 + f * 7 : y2 - f * 7;
          extend(si, up ? fy + 19 : fy - 19);
          b.push(<Flag key={`f${st}${f}`} sx={sx} y={fy} up={up} />);
        }
      }
    }
  }

  // ── 连音线（跨行时拆成两半） ──
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    if (!a.it.tie) continue;
    const c = all[i + 1];
    if (!c) continue;
    for (const pa of a.parts) {
      const pc = c.parts.find((q) => q.clef === pa.clef);
      if (!pc) continue;
      pa.heads.forEach((h, hi) => {
        const st = pa.clef;
        // 单音：与符干相反的一侧；和弦：下半的音向下、上半的音向上
        const below = pa.heads.length === 1 ? (a.it.value.base > 1 ? pa.up : mid(st) > h.step) : hi < pa.heads.length / 2;
        const y = yOf(st, h.step) + (below ? 5 : -5);
        const extra = (pa.heads.some((q) => q.side > 0) ? HEAD_DX : 0) + (a.it.value.dots ? 6 + 5 * a.it.value.dots : 0);
        const x1 = a.x + 5 + extra;
        const x2 = c.x - 5;
        const key = `t${i}-${st}-${h.step}`;
        const b = body(a);
        extend(a.sys, y + (below ? 9 : -9));
        if (a.sys === c.sys) b.push(<Tie key={key} x1={x1} x2={x2} y={y} below={below} />);
        else {
          b.push(<Tie key={key} x1={x1} x2={sysEnd[a.sys] - 2} y={y} below={below} />);
          const bc = body(c);
          extend(c.sys, y + (below ? 9 : -9));
          bc.push(<Tie key={`${key}b`} x1={Math.max(mStart[c.measure] - 2, x2 - 22)} x2={x2} y={y} below={below} />);
        }
      });
    }
  }

  // ── 歌词：每行谱一条基线，放在本行最低的字形之下 ──
  const lyricY = ext.map((e) => Math.max(bottom + 20, e.max + 13));
  if (lyrics.length)
    for (const p of all) {
      const s = lyricOf(p.it);
      if (!s) continue;
      extend(p.sys, lyricY[p.sys] + 4);
      body(p).push(
        <text key="ly" className="staff-lyric" x={p.x} y={lyricY[p.sys]} textAnchor="middle" fontSize={LYRIC_SIZE}>
          {s}
        </text>,
      );
    }

  for (const p of all) {
    const m = mk[p.it.src];
    sysOut[p.sys].push(
      <g key={`g${p.it.src}-${p.it.start}-${p.measure}`} data-i={p.it.src} className={m ? `staff-${m}` : undefined}>
        {groupNodes.get(p)}
      </g>,
    );
  }

  // ── 谱表、谱号、调号、拍号、小节线 ──
  lines.forEach((ms, si) => {
    const out = sysOut[si];
    const end = sysEnd[si];
    const head: ReactNode[] = [];
    for (const st of staves) {
      const top = tops[st];
      for (let i = 0; i < 5; i++) head.push(<line key={`${st}${i}`} className="staff-line" x1={4} x2={end} y1={top + i * SP} y2={top + i * SP} />);
      head.push(
        st === 'treble' ? <TrebleClef key={`c${st}`} x={clefX} gy={top + 3 * SP} /> : <BassClef key={`c${st}`} x={clefX - 2} fy={top + SP} />,
      );
      keySignatureSteps(fifths, st).forEach((s, i) =>
        head.push(<Accidental key={`k${st}${i}`} alt={fifths > 0 ? 1 : -1} x={keyX + i * 9} y={yOf(st, s)} />),
      );
      if (si === 0)
        meter.forEach((v, i) =>
          head.push(
            <text
              key={`ts${st}${i}`}
              className="staff-time"
              x={tsX}
              y={top + (i ? 3 : 1) * SP}
              dominantBaseline="central"
              textAnchor="middle"
              fontSize={24}
              fontWeight={700}
            >
              {v}
            </text>,
          ),
        );
    }
    const y1 = tops[staves[0]];
    ms.forEach((mi) => {
      const bx = mStart[mi] + mWidth[mi];
      if (mi === measures.length - 1) {
        // 终止线
        head.push(<line key={`bar${mi}`} className="staff-bar" x1={bx - 6} x2={bx - 6} y1={y1} y2={bottom} />);
        head.push(<rect key={`fin${mi}`} x={bx - 3.5} y={y1} width={3.5} height={bottom - y1} />);
      } else head.push(<line key={`bar${mi}`} className="staff-bar" x1={bx} x2={bx} y1={y1} y2={bottom} />);
    });
    if (clef === 'grand') {
      const ym = (y1 + bottom) / 2;
      head.push(<line key="sys" className="staff-bar" x1={4} x2={4} y1={y1} y2={bottom} />);
      head.push(
        <path
          key="brace"
          d={`M2 ${y1} C-5 ${y1 + 16} 3 ${ym - 14} -4 ${ym} C3 ${ym + 14} -5 ${bottom - 16} 2 ${bottom}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
        />,
      );
    }
    // 行首小节号（弱起小节记为第 0 小节）
    if (si > 0) {
      const num = ms[0] + (pickup && Math.round(pickup * 12) % bar ? 0 : 1);
      extend(si, -20);
      head.push(
        <text key="num" className="staff-num" x={6} y={y1 - 9} fontSize={9}>
          {num}
        </text>,
      );
    }
    out.unshift(...head);
  });

  // ── 各行纵向堆叠 ──
  const offs: number[] = [];
  let y = 0;
  ext.forEach((e, si) => {
    const top = si === 0 ? -e.min + 4 : y + SYS_GAP - e.min;
    offs.push(top);
    y = top + e.max;
  });
  const vbW = cssW / k;
  const vbX = clef === 'grand' ? -8 : 0;
  const h = y + 6;
  const label = notes.map((g) => (g.length ? g.map((p) => pitchName(p)).join('+') : '-')).join(' ');
  const curSys = curIdx >= 0 ? all.find((p) => p.it.src === curIdx)?.sys : undefined;
  return (
    <svg
      className="staff staff-measured"
      viewBox={`${vbX} 0 ${vbW} ${h}`}
      width={cssW}
      height={h * k}
      fill="currentColor"
      role="img"
      aria-label={t('staff.aria', { notes: label })}
    >
      {sysOut.map((nodes, si) => (
        <g key={si} transform={`translate(0 ${offs[si]})`} data-cur-sys={si === curSys ? '' : undefined}>
          {nodes}
        </g>
      ))}
    </svg>
  );
}
