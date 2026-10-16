import type { ExerciseDef } from '../engine/types';
import { t } from '../i18n';
import { randInt } from '../music/theory';
import { option } from './common';
import { SPEED, TPQ, UNITS, describe, flatten, makeBar, rhythm, rhythmEvents, type Bar } from './rhythm';

// 节奏模仿：看谱或听一遍后，自己把节奏打出来（空格 / 字母键 / 点击敲击区 / 拍手）。
// 级别与考点复用节奏听写的节奏单元；判定只看起音时刻。

/** 目标起音时刻（秒，相对节奏型开始），休止不计。 */
export function onsetsOf(durs: number[], bpm: number): number[] {
  const beat = 60 / bpm;
  const out: number[] = [];
  let t = 0;
  for (const d of durs) {
    if (d > 0) out.push((t / TPQ) * beat);
    t += Math.abs(d);
  }
  return out;
}

/** 单个音的容差（秒）：八分音符时值的 35%，限制在 60~150ms。 */
export function tapTolerance(bpm: number): number {
  return Math.min(0.15, Math.max(0.06, 0.35 * (30 / bpm)));
}

export type TapKind = 'ok' | 'early' | 'late' | 'miss';

export interface TapNote {
  /** 目标起音（秒） */
  t: number;
  /** 匹配到的敲击（秒），漏打为 null */
  tap: number | null;
  /** 去掉整体偏移后的偏差（秒，正为偏晚） */
  err: number | null;
  kind: TapKind;
}

export interface TapJudge {
  tol: number;
  /** 整体偏移（秒，正为偏晚）：匹配上的敲击偏差的中位数 */
  offset: number;
  notes: TapNote[];
  /** 多打的敲击（秒） */
  extras: number[];
  /** 去掉整体偏移后的平均绝对偏差（秒），没有匹配时为 null */
  meanAbs: number | null;
  pass: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 保序匹配（动态规划）：在偏移 off 下，最大化匹配数，其次最小化偏差平方和。返回每个目标匹配的敲击下标。 */
function align(targets: number[], taps: number[], off: number, tol: number): (number | null)[] {
  const n = targets.length;
  const m = taps.length;
  // dp[i][j]：前 i 个目标与前 j 个敲击的最优 [匹配数, -代价]
  const cnt: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const from: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0)); // 0 跳过目标 1 跳过敲击 2 匹配
  const better = (c1: number, k1: number, c2: number, k2: number) => c1 > c2 || (c1 === c2 && k1 < k2 - 1e-12);
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      let bc = -1;
      let bk = Infinity;
      let bf = 0;
      if (i > 0) [bc, bk, bf] = [cnt[i - 1][j], cost[i - 1][j], 0];
      if (j > 0 && better(cnt[i][j - 1], cost[i][j - 1], bc, bk)) [bc, bk, bf] = [cnt[i][j - 1], cost[i][j - 1], 1];
      if (i > 0 && j > 0) {
        const e = taps[j - 1] - targets[i - 1] - off;
        if (Math.abs(e) <= tol) {
          const c = cnt[i - 1][j - 1] + 1;
          const k = cost[i - 1][j - 1] + e * e;
          if (better(c, k, bc, bk)) [bc, bk, bf] = [c, k, 2];
        }
      }
      cnt[i][j] = bc;
      cost[i][j] = bk;
      from[i][j] = bf;
    }
  const match: (number | null)[] = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const f = from[i][j];
    if (f === 2) match[--i] = --j;
    else if (f === 1) j--;
    else i--;
  }
  return match;
}

/**
 * 判定一次敲击。targets、taps 均为秒（同一时间轴，taps 升序）。
 * 1) 在 ±2 倍容差内枚举候选整体偏移（0 与每对「敲击 - 目标」），各做一次保序匹配并计算代价；
 * 2) 取代价最小者，以其匹配偏差的中位数作为整体偏移，再匹配一次得到最终结果。
 * 通过条件：每个音都打中（校准后 |偏差| ≤ 容差）、没有多打、整体偏移不超过容差。
 */
export function judgeTaps(targets: number[], taps: number[], bpm: number): TapJudge {
  const tol = tapTolerance(bpm);
  const sorted = [...taps].sort((a, b) => a - b);
  const maxShift = 2 * tol;
  const cands = new Set<number>([0]);
  for (const u of sorted) for (const t of targets) if (Math.abs(u - t) <= maxShift) cands.add(u - t);

  // 代价：每个漏打 / 多打记 1，校准后的偏差与整体偏移按容差归一后平方计入。
  // 偏移也计代价，避免为了多配上一个音把整串敲击错位到相邻的音上。
  const evaluate = (off: number) => {
    const match = align(targets, sorted, off, tol);
    const errs = match.flatMap((j, i) => (j === null ? [] : [sorted[j] - targets[i]]));
    const med = errs.length ? median(errs) : 0;
    const unmatched = targets.length + sorted.length - 2 * errs.length;
    const cost = unmatched + errs.reduce((s, e) => s + 0.5 * ((e - med) / tol) ** 2, 0) + (med / tol) ** 2;
    return { cost, med };
  };
  let best = { cost: Infinity, med: 0 };
  for (const off of cands) {
    const r = evaluate(off);
    if (r.cost < best.cost - 1e-9) best = r;
  }
  const offset = Math.max(-maxShift, Math.min(maxShift, best.med));
  const match = align(targets, sorted, offset, tol);

  const used = new Set<number>();
  const notes: TapNote[] = targets.map((t, i) => {
    const j = match[i];
    if (j === null) return { t, tap: null, err: null, kind: 'miss' };
    used.add(j);
    const err = sorted[j] - t - offset;
    const kind: TapKind = Math.abs(err) <= tol / 2 ? 'ok' : err < 0 ? 'early' : 'late';
    return { t, tap: sorted[j], err, kind };
  });
  const extras = sorted.filter((_, j) => !used.has(j));
  const errs = notes.flatMap((x) => (x.err === null ? [] : [Math.abs(x.err)]));
  const meanAbs = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
  const pass = notes.every((x) => x.kind !== 'miss') && extras.length === 0 && Math.abs(offset) <= tol;
  return { tol, offset, notes, extras, meanAbs, pass };
}

export const rhythmTap: ExerciseDef = {
  id: 'rhythmTap',
  get title() {
    return t('ex.rhythmTap.title');
  },
  get subtitle() {
    return t('ex.rhythmTap.subtitle');
  },
  icon: '👏',
  group: 'basics',
  manual: true,
  levels: rhythm.levels,
  options: [
    option(
      'mode',
      'ex.rhythmTap.mode',
      [
        ['read', 'ex.rhythmTap.mode.read'],
        ['listen', 'ex.rhythmTap.mode.listen'],
      ],
      'read',
    ),
    ...(rhythm.options ?? []),
  ],
  itemLabel: (it) => UNITS[it].name,
  generate(item, ctx) {
    const bpm = SPEED[ctx.options.speed] ?? 80;
    const nBars = ctx.options.bars === '2' ? 2 : 1;
    const listen = ctx.options.mode === 'listen';
    const pool = [...new Set([...ctx.items.filter((u) => u in UNITS && u !== 'w'), 'q'])];
    const at = randInt(0, nBars - 1);
    const bars: Bar[] = Array.from({ length: nBars }, (_, i) => makeBar(pool, i === at ? item : undefined));
    const durs = flatten(bars);
    return {
      item,
      // 示范：预备拍 + 节奏型（听后打先播放；看谱打在作答后可以听）
      events: rhythmEvents(durs, bpm),
      choices: [],
      answer: ['tap'],
      prompt: t(listen ? 'ex.rhythmTap.promptListen' : 'ex.rhythmTap.promptRead', { bpm }),
      explain: describe(bars),
      tap: { durs, bpm, showNotation: !listen, countIn: 4 },
    };
  },
};
