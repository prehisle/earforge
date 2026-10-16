// 统计页趋势图：手写 SVG（不依赖图表库）。按容器实际宽度用像素坐标绘制，文字不随缩放变形。
// 交互：鼠标/触摸滑动出十字线与提示框；获得焦点后用方向键逐个查看；数据表见 TrendTable。

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  MIN_DAY_N,
  ROLL_DAYS,
  addDays,
  niceMax,
  tickIndices,
  type Bucket,
  type HeatGrid,
  type TrendPoint,
} from '../engine/trends';
import { useT } from '../i18n/react';
import { pct, useFmt } from './trendFormat';

// ───── 通用 ─────

/** 容器宽度（随窗口变化） */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    // 隐藏或截屏改变视口时可能短暂报告 0，忽略以免图表卸载重建
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** 提示框：测量自身宽高后限制在容器内，默认放在锚点上方 */
function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setSize([el.offsetWidth, el.offsetHeight]);
  }, [x, y, width]);
  const left = Math.max(0, Math.min(width - size[0], x - size[0] / 2));
  const top = y - size[1] - 10 < 0 ? y + 14 : y - size[1] - 10;
  return (
    <div ref={ref} className="trend-tip" style={{ left, top, visibility: size[0] ? 'visible' : 'hidden' }} role="status">
      {children}
    </div>
  );
}

/** 横向逐点浏览：指针位置换算成下标，方向键移动 */
function useScrub(count: number, indexAt: (x: number) => number) {
  const [idx, setIdx] = useState<number | null>(null);
  const at = (e: PointerEvent<Element>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setIdx(Math.max(0, Math.min(count - 1, indexAt(e.clientX - r.left))));
  };
  return {
    idx: idx !== null && idx < count ? idx : null,
    set: setIdx,
    handlers: {
      onPointerMove: at,
      onPointerDown: at,
      // 触摸抬起后保留提示，方便阅读；鼠标移出才清除
      onPointerLeave: (e: PointerEvent<Element>) => e.pointerType === 'mouse' && setIdx(null),
      onBlur: () => setIdx(null),
      onKeyDown: (e: KeyboardEvent<Element>) => {
        const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 };
        if (e.key in step) setIdx((i) => (i === null ? count - 1 : Math.max(0, Math.min(count - 1, i + step[e.key]))));
        else if (e.key === 'Home') setIdx(0);
        else if (e.key === 'End') setIdx(count - 1);
        else if (e.key === 'Escape') setIdx(null);
        else return;
        e.preventDefault();
      },
    },
  };
}

/** 折线路径：null 处断开 */
function linePath(pts: (readonly [number, number] | null)[]): string {
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** 底部贴基线、顶部圆角的柱子 */
function barPath(x: number, w: number, base: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  const top = base - h;
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

/** 环比：箭头 + 正负号 + 颜色，三重表达 */
export function Delta({ d, title }: { d: number | null; title?: string }) {
  if (d === null) return null;
  const v = Math.round(d * 100);
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const text = v > 0 ? `↑ +${v}%` : v < 0 ? `↓ −${-v}%` : '→ ±0%';
  return (
    <span className={`trend-delta ${cls}`} title={title}>
      {text}
    </span>
  );
}

// ───── 正确率趋势（日正确率点 + 7 日平均线） ─────

const M = { l: 38, r: 10, t: 10, b: 24 };

export function AccuracyChart({
  rows,
  compact = false,
  win = ROLL_DAYS,
  label,
}: {
  rows: TrendPoint[];
  compact?: boolean;
  /** 滑动窗口天数（图例与提示用） */
  win?: number;
  label: string;
}) {
  const t = useT();
  const f = useFmt();
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = compact ? 56 : 190;
  const m = compact ? { l: 2, r: 2, t: 4, b: 4 } : M;
  const pw = Math.max(1, W - m.l - m.r);
  const ph = H - m.t - m.b;
  const N = rows.length;
  const x = (i: number) => m.l + (N <= 1 ? pw / 2 : (i * pw) / (N - 1));
  const y = (v: number) => m.t + (1 - v) * ph;
  const s = useScrub(N, (px) => Math.round(((px - m.l) / pw) * (N - 1)));
  const dense = N > 120;
  const roll = linePath(rows.map((r, i) => (r.roll === null ? null : ([x(i), y(r.roll)] as const))));
  const h = s.idx !== null ? rows[s.idx] : null;
  const ticks = W > 0 ? tickIndices(N, Math.max(2, Math.floor(pw / 90))) : [];
  const fmtTick = N > 120 ? f.monthYear : f.day;

  return (
    <div ref={ref} className={`trend-wrap ${compact ? 'compact' : ''}`}>
      {W > 0 && (
        <svg
          width={W}
          height={H}
          className="trend-svg"
          role="img"
          aria-label={label}
          tabIndex={0}
          {...s.handlers}
        >
          {/* 网格：0/25/50/75/100%，紧凑模式只画 50% 参考线 */}
          {(compact ? [0.5] : [0, 0.25, 0.5, 0.75, 1]).map((v) => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'trend-base' : 'trend-grid'} />
              {!compact && (
                <text x={m.l - 6} y={y(v)} className="trend-axis" textAnchor="end" dominantBaseline="middle">
                  {pct(v)}
                </text>
              )}
            </g>
          ))}
          {compact && <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} className="trend-base" />}
          {!compact &&
            ticks.map((i, j) => (
              <text
                key={i}
                x={x(i)}
                y={H - 6}
                className="trend-axis"
                textAnchor={j === 0 ? 'start' : j === ticks.length - 1 ? 'end' : 'middle'}
              >
                {fmtTick(rows[i].key)}
              </text>
            ))}
          {/* 日正确率：题量足够为实点，题量少为空心点 */}
          {!compact &&
            rows.map((r, i) =>
              r.acc === null ? null : (
                <circle
                  key={r.key}
                  cx={x(i)}
                  cy={y(r.acc)}
                  r={r.low ? 2.5 : dense ? 1.6 : 2.4}
                  className={r.low ? 'trend-dot low' : 'trend-dot'}
                />
              ),
            )}
          <path d={roll} className={compact ? 'trend-line thin' : 'trend-line'} />
          {h && (
            <g>
              <line x1={x(s.idx!)} x2={x(s.idx!)} y1={m.t} y2={H - m.b} className="trend-cross" />
              {h.roll !== null && <circle cx={x(s.idx!)} cy={y(h.roll)} r={4.5} className="trend-focus" />}
              {!compact && h.acc !== null && <circle cx={x(s.idx!)} cy={y(h.acc)} r={3.5} className="trend-focus raw" />}
            </g>
          )}
        </svg>
      )}
      {h && (
        <Tip x={x(s.idx!)} y={compact ? 0 : m.t} width={W}>
          <span className="tip-head">{f.full(h.key)}</span>
          {h.roll !== null && (
            <span>
              <i className="key line" /> <strong>{pct(h.roll)}</strong> {t('stats.legendRoll', { n: win })}
            </span>
          )}
          {!compact && (
            <span>
              {h.acc !== null && <i className={`key dot ${h.low ? 'low' : ''}`} />}{' '}
              {h.unknown
                ? t('stats.tipUnknown')
                : h.n === 0
                  ? t('stats.tipNone')
                  : t('stats.tipDay', { pct: Math.round((h.acc ?? 0) * 100), n: h.n })}
            </span>
          )}
          {compact && <span className="tip-sub">{h.unknown ? t('stats.tipUnknown') : h.n === 0 ? t('stats.tipNone') : t('stats.nQ', { n: h.n })}</span>}
        </Tip>
      )}
    </div>
  );
}

export function AccuracyLegend() {
  const t = useT();
  return (
    <div className="trend-legend">
      <span>
        <i className="key dot" /> {t('stats.legendDaily')}
      </span>
      <span>
        <i className="key line" /> {t('stats.legendRoll', { n: ROLL_DAYS })}
      </span>
      <span>
        <i className="key dot low" /> {t('stats.legendLow', { n: MIN_DAY_N })}
      </span>
    </div>
  );
}

// ───── 题量柱状图 ─────

export function VolumeChart({ rows, weekly, label }: { rows: Bucket[]; weekly: boolean; label: string }) {
  const t = useT();
  const f = useFmt();
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 150;
  const pw = Math.max(1, W - M.l - M.r);
  const ph = H - M.t - M.b;
  const N = rows.length;
  const slot = pw / Math.max(1, N);
  const gap = slot >= 6 ? 2 : slot >= 3 ? 1 : 0;
  const top = niceMax(Math.max(...rows.map((r) => r.n), 1));
  const base = M.t + ph;
  const s = useScrub(N, (px) => Math.floor((px - M.l) / slot));
  const h = s.idx !== null ? rows[s.idx] : null;
  const ticks = W > 0 ? tickIndices(N, Math.max(2, Math.floor(pw / 90))) : [];
  const fmtTick = N > 30 && weekly ? f.monthYear : f.day;

  return (
    <div ref={ref} className="trend-wrap">
      {W > 0 && (
        <svg width={W} height={H} className="trend-svg" role="img" aria-label={label} tabIndex={0} {...s.handlers}>
          {[0.5, 1].map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={base - v * ph} y2={base - v * ph} className="trend-grid" />
              <text x={M.l - 6} y={base - v * ph} className="trend-axis" textAnchor="end" dominantBaseline="middle">
                {f.num(top * v)}
              </text>
            </g>
          ))}
          <text x={M.l - 6} y={base} className="trend-axis" textAnchor="end" dominantBaseline="middle">
            0
          </text>
          {rows.map((r, i) => (
            <path
              key={r.key}
              d={barPath(M.l + i * slot + gap / 2, Math.max(0.5, slot - gap), base, (r.n / top) * ph)}
              className={s.idx === i ? 'trend-bar hot' : 'trend-bar'}
            />
          ))}
          <line x1={M.l} x2={W - M.r} y1={base} y2={base} className="trend-base" />
          {ticks.map((i, j) => (
            <text
              key={i}
              x={j === 0 ? M.l : j === ticks.length - 1 ? W - M.r : M.l + (i + 0.5) * slot}
              y={H - 6}
              className="trend-axis"
              textAnchor={j === 0 ? 'start' : j === ticks.length - 1 ? 'end' : 'middle'}
            >
              {fmtTick(rows[i].key)}
            </text>
          ))}
        </svg>
      )}
      {h && (
        <Tip x={M.l + (s.idx! + 0.5) * slot} y={base - (h.n / top) * ph} width={W}>
          <span className="tip-head">{weekly ? `${f.day(h.key)} – ${f.day(h.end)}` : f.full(h.key)}</span>
          <span>
            <strong>{t('stats.nQ', { n: f.num(h.n) })}</strong>
          </span>
          {h.n > 0 && <span className="tip-sub">{t('stats.dayAcc', { pct: Math.round((h.c / h.n) * 100) })}</span>}
        </Tip>
      )}
    </div>
  );
}

// ───── 日历热力图 ─────

export function Heatmap({ grid, weekStart, goal, label }: { grid: HeatGrid; weekStart: 0 | 1; goal: number; label: string }) {
  const t = useT();
  const f = useFmt();
  const [ref, W] = useWidth<HTMLDivElement>();
  const cols = grid.weeks.length;
  const labelW = f.locale === 'zh' ? 18 : 30;
  const headH = 16;
  const cellSlot = Math.max(8, Math.min(18, Math.floor((W - labelW) / cols)));
  const cell = cellSlot - 2;
  const svgW = labelW + cols * cellSlot;
  const svgH = headH + 7 * cellSlot;
  const flat = grid.weeks.flat();
  const last = flat.findLastIndex((c) => !c.future);
  const [idx, setIdx] = useState<number | null>(null);
  const at = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - labelW) / cellSlot);
    const row = Math.floor((e.clientY - r.top - headH) / cellSlot);
    const i = col * 7 + row;
    setIdx(col >= 0 && col < cols && row >= 0 && row < 7 && !flat[i].future ? i : null);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    if (e.key in step) setIdx((i) => (i === null ? last : Math.max(0, Math.min(last, i + step[e.key]))));
    else if (e.key === 'End') setIdx(last);
    else if (e.key === 'Home') setIdx(0);
    else if (e.key === 'Escape') setIdx(null);
    else return;
    e.preventDefault();
  };
  const h = idx !== null ? flat[idx] : null;
  const cx = (i: number) => labelW + Math.floor(i / 7) * cellSlot;
  const cy = (i: number) => headH + (i % 7) * cellSlot;
  // 一周中标出周一、三、五
  const rowLabels = [1, 3, 5].map((wd) => (wd - weekStart + 7) % 7);

  return (
    <div ref={ref} className="trend-wrap heat">
      {W > 0 && (
        <svg
          width={svgW}
          height={svgH}
          className="trend-svg"
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerMove={at}
          onPointerDown={at}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setIdx(null)}
          onBlur={() => setIdx(null)}
          onKeyDown={onKey}
        >
          {grid.months.map((m) => (
            <text key={m.key} x={labelW + m.col * cellSlot} y={11} className="trend-axis">
              {f.month(m.key)}
            </text>
          ))}
          {rowLabels.map((r) => (
            <text key={r} x={0} y={headH + r * cellSlot + cell / 2} className="trend-axis" dominantBaseline="middle">
              {f.weekdayName(addDays(grid.weeks[0][0].key, r))}
            </text>
          ))}
          {flat.map((c, i) =>
            c.future ? null : (
              <rect key={c.key} x={cx(i)} y={cy(i)} width={cell} height={cell} rx={2} className={`heat-cell l${c.level}`} />
            ),
          )}
          {h && <rect x={cx(idx!) - 1} y={cy(idx!) - 1} width={cell + 2} height={cell + 2} rx={3} className="heat-focus" />}
        </svg>
      )}
      {h && (
        <Tip x={cx(idx!) + cell / 2} y={cy(idx!)} width={Math.max(W, svgW)}>
          <span className="tip-head">{f.full(h.key)}</span>
          <span>
            <strong>{h.n > 0 ? t('stats.nQ', { n: f.num(h.n) }) : t('stats.tipNone')}</strong>
          </span>
          {h.n > 0 && <span className="tip-sub">{t('stats.dayAcc', { pct: Math.round((h.c / h.n) * 100) })}</span>}
        </Tip>
      )}
      <div className="heat-legend" style={{ maxWidth: Math.max(svgW, 240) }}>
        <span className="muted">{t('stats.heatGoal', { n: goal })}</span>
        <span className="heat-scale">
          {t('stats.heatLess')}
          {[0, 1, 2, 3, 4].map((l) => (
            <svg key={l} width={12} height={12} aria-hidden="true">
              <rect width={12} height={12} rx={2} className={`heat-cell l${l}`} />
            </svg>
          ))}
          {t('stats.heatMore')}
        </span>
      </div>
    </div>
  );
}

// ───── 数据表（无障碍与精确数值） ─────

export function TrendTable({ rows }: { rows: TrendPoint[] }) {
  const t = useT();
  const f = useFmt();
  return (
    <details className="trend-table">
      <summary>{t('stats.table')}</summary>
      <div className="trend-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('stats.date')}</th>
              <th>{t('stats.answered')}</th>
              <th>{t('stats.right')}</th>
              <th>{t('stats.accCol')}</th>
              <th>{t('stats.legendRoll', { n: ROLL_DAYS })}</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.key}>
                <td>{f.full(r.key)}</td>
                <td>{f.num(r.n)}</td>
                <td>{f.num(r.c)}</td>
                <td>{r.acc === null ? '—' : pct(r.acc)}</td>
                <td>{r.roll === null ? '—' : pct(r.roll)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
