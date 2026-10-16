// 趋势统计：纯函数，供统计页的趋势图使用（滑动平均、按周汇总、环比、日历热力图）。
// 日期一律用本地日期键 YYYY-MM-DD；日期运算先转成 UTC 日序号再算，避开夏令时与月末问题。

import type { DayStat } from './progress';

export type Daily = Record<string, DayStat>;

export interface Counts {
  n: number;
  c: number;
}

/** 当天作答少于此数时，日正确率不画成实点（只画淡色空心点），避免「答 1 错 1 = 0%」误导 */
export const MIN_DAY_N = 5;
/** 7 日滑动窗口内作答少于此数时不画滑动线 */
export const MIN_ROLL_N = 10;
/** 一个周期内作答少于此数时不计算周期正确率与环比 */
export const MIN_PERIOD_N = 20;
export const ROLL_DAYS = 7;

export type RangeId = '30' | '90' | '365' | 'all';
export const RANGES: RangeId[] = ['30', '90', '365', 'all'];

// ───── 日期 ─────

/** 本地日期键 */
export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

/** 日期键 → 日序号（1970-01-01 起的天数），与时区无关 */
export function dayNum(key: string): number {
  const [y, m, d] = parts(key);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
}

/** 日序号 → 日期键 */
export function keyOfNum(n: number): string {
  const d = new Date(n * 864e5);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(key: string, n: number): string {
  return keyOfNum(dayNum(key) + n);
}

/** b - a 的天数 */
export function diffDays(a: string, b: string): number {
  return dayNum(b) - dayNum(a);
}

/** 星期几：0 = 周日 … 6 = 周六 */
export function weekday(key: string): number {
  return (((dayNum(key) + 4) % 7) + 7) % 7; // 1970-01-01 是周四
}

/** 日期键 → 本地正午的 Date（用于 Intl 格式化，正午避开夏令时切换的那一小时） */
export function dateOf(key: string): Date {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d, 12);
}

/** from..to（含两端）的所有日期键 */
export function dayList(from: string, to: string): string[] {
  const a = dayNum(from);
  const b = dayNum(to);
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(keyOfNum(i));
  return out;
}

/** 所在周的第一天（weekStart：0 = 周日起，1 = 周一起） */
export function weekStartOf(key: string, weekStart: 0 | 1): string {
  return addDays(key, -((weekday(key) - weekStart + 7) % 7));
}

// ───── 计数 ─────

/**
 * 某天的作答数。指定练习时：当天有分练习记录则取之；当天有作答但没有分练习记录（旧数据）返回 null 表示未知。
 */
export function countsOn(daily: Daily, key: string, exId?: string): Counts | null {
  const d = daily[key];
  if (!d || d.n === 0) return { n: 0, c: 0 };
  if (!exId) return { n: d.n, c: d.c };
  if (!d.ex) return null;
  const e = d.ex[exId];
  return e ? { n: e[0], c: e[1] } : { n: 0, c: 0 };
}

/** from..to 的合计（未知的天跳过） */
export function sumRange(daily: Daily, from: string, to: string, exId?: string): Counts {
  const out = { n: 0, c: 0 };
  for (let i = dayNum(from); i <= dayNum(to); i++) {
    const x = countsOn(daily, keyOfNum(i), exId);
    if (x) {
      out.n += x.n;
      out.c += x.c;
    }
  }
  return out;
}

export const accOf = (x: Counts, min = 1): number | null => (x.n >= min && x.n > 0 ? x.c / x.n : null);

export function firstDay(daily: Daily): string | null {
  let first: string | null = null;
  for (const [k, v] of Object.entries(daily)) if (v.n > 0 && (!first || k < first)) first = k;
  return first;
}

export function practiceDays(daily: Daily): number {
  return Object.values(daily).filter((d) => d.n > 0).length;
}

/** 历史最长连续练习天数 */
export function bestStreak(daily: Daily): number {
  const nums = Object.entries(daily)
    .filter(([, v]) => v.n > 0)
    .map(([k]) => dayNum(k))
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < nums.length; i++) {
    run = i > 0 && nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

// ───── 范围与序列 ─────

/** 范围的起始日期。全部 = 第一次练习起（至少 30 天，不然图太空） */
export function rangeStart(range: RangeId, daily: Daily, todayKey: string): string {
  if (range !== 'all') return addDays(todayKey, -(Number(range) - 1));
  const f = firstDay(daily);
  const min = addDays(todayKey, -29);
  return f && f < min ? f : min;
}

export interface TrendPoint {
  key: string;
  n: number;
  c: number;
  /** 分练习数据未知（旧版本记录） */
  unknown: boolean;
  /** 日正确率；当天没有作答为 null */
  acc: number | null;
  /** 当天题量太少（0 < n < MIN_DAY_N），日正确率仅供参考 */
  low: boolean;
  /** 截至当天的 N 日（默认 7）滑动正确率（窗口内按题数加权合计）；题量不足为 null */
  roll: number | null;
}

/** 范围内每天的作答、日正确率与 N 日滑动正确率（模块小图在长范围用 28 日，曲线更平稳）。滑动窗口会用到范围开始前的数据。 */
export function trendSeries(daily: Daily, from: string, to: string, exId?: string, days = ROLL_DAYS): TrendPoint[] {
  const a = dayNum(from);
  const b = dayNum(to);
  const win: (Counts | null)[] = [];
  for (let i = a - days + 1; i < a; i++) win.push(countsOn(daily, keyOfNum(i), exId));
  const out: TrendPoint[] = [];
  for (let i = a; i <= b; i++) {
    const key = keyOfNum(i);
    const x = countsOn(daily, key, exId);
    win.push(x);
    if (win.length > days) win.shift();
    const w = win.reduce<Counts>((s, v) => (v ? { n: s.n + v.n, c: s.c + v.c } : s), { n: 0, c: 0 });
    const n = x?.n ?? 0;
    const c = x?.c ?? 0;
    out.push({
      key,
      n,
      c,
      unknown: x === null,
      acc: n > 0 ? c / n : null,
      low: n > 0 && n < MIN_DAY_N,
      roll: accOf(w, MIN_ROLL_N),
    });
  }
  return out;
}

export interface Bucket {
  /** 起始日期 */
  key: string;
  /** 结束日期（含） */
  end: string;
  n: number;
  c: number;
}

/** 按天的序列汇总成周（首尾不完整的周只包含范围内的天） */
export function bucketWeeks(rows: { key: string; n: number; c: number }[], weekStart: 0 | 1): Bucket[] {
  const out: Bucket[] = [];
  for (const r of rows) {
    const ws = weekStartOf(r.key, weekStart);
    const last = out[out.length - 1];
    if (last && weekStartOf(last.key, weekStart) === ws) {
      last.end = r.key;
      last.n += r.n;
      last.c += r.c;
    } else out.push({ key: r.key, end: r.key, n: r.n, c: r.c });
  }
  return out;
}

/** 按天还是按周显示题量：超过 120 天按周 */
export const volumeByWeek = (days: number) => days > 120;

/** 模块小图的滑动窗口：长范围用 28 日 */
export const sparkWindow = (days: number) => (days > 120 ? 28 : ROLL_DAYS);

export interface PeriodDelta {
  cur: number | null;
  prev: number | null;
  /** cur - prev（0..1 的差，即百分点/100）；任一侧题量不足为 null */
  delta: number | null;
  n: number;
}

/** 最近 len 天（含今天）与之前 len 天的正确率对比 */
export function periodDelta(daily: Daily, todayKey: string, len: number, exId?: string): PeriodDelta {
  const curFrom = addDays(todayKey, -(len - 1));
  const cur = sumRange(daily, curFrom, todayKey, exId);
  const prev = sumRange(daily, addDays(curFrom, -len), addDays(curFrom, -1), exId);
  const a = accOf(cur, MIN_PERIOD_N);
  const b = accOf(prev, MIN_PERIOD_N);
  return { cur: a, prev: b, delta: a !== null && b !== null ? a - b : null, n: cur.n };
}

// ───── 日历热力图 ─────

export interface HeatCell {
  key: string;
  n: number;
  c: number;
  /** 今天之后（不画） */
  future: boolean;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatGrid {
  /** 每列一周，每列 7 格，从 weekStart 那天开始 */
  weeks: HeatCell[][];
  /** 月份标签：在该月第一次出现的那一列 */
  months: { col: number; key: string }[];
}

/** 颜色等级按每日目标划分：1 不到一半，2 不到目标，3 达标，4 达到两倍以上 */
export function heatLevel(n: number, goal: number): HeatCell['level'] {
  if (n <= 0) return 0;
  const g = Math.max(1, goal);
  if (n < g / 2) return 1;
  if (n < g) return 2;
  if (n < g * 2) return 3;
  return 4;
}

/** 最近 weeks 周的日历网格（最后一列包含今天） */
export function heatmapGrid(daily: Daily, todayKey: string, weeks: number, weekStart: 0 | 1, goal: number): HeatGrid {
  const start = addDays(weekStartOf(todayKey, weekStart), -(weeks - 1) * 7);
  const t = dayNum(todayKey);
  const grid: HeatCell[][] = [];
  const months: HeatGrid['months'] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, w * 7 + d);
      const x = daily[key];
      const n = x?.n ?? 0;
      col.push({ key, n, c: x?.c ?? 0, future: dayNum(key) > t, level: heatLevel(n, goal) });
    }
    // 该列包含某月 1 日（或是第一列）时标出月份
    const first = col.find((c) => c.key.endsWith('-01'));
    if (w === 0) months.push({ col: 0, key: col[0].key });
    else if (first) months.push({ col: w, key: first.key });
    grid.push(col);
  }
  // 第一列的月份与第二个标签挨得太近时去掉第一列的标签
  if (months.length > 1 && months[1].col < 3) months.shift();
  return { weeks: grid, months };
}

/** 等距取 k 个刻度下标（含首尾） */
export function tickIndices(len: number, k: number): number[] {
  if (len <= 0) return [];
  if (len === 1 || k <= 1) return [0];
  const m = Math.min(k, len);
  const out = new Set<number>();
  for (let j = 0; j < m; j++) out.add(Math.round((j * (len - 1)) / (m - 1)));
  return [...out];
}

/** 题量轴的「整」上限：1/2/5 × 10^k */
export function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
