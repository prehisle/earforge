// 训练计划：今日训练（跨模块混合）与薄弱点专练的选题。纯函数，不修改 store。

import type { ExerciseDef } from './types';
import {
  MASTERY_ACC,
  MASTERY_N,
  activeItems,
  getProgress,
  itemStat,
  levelsOf,
  type ExerciseProgress,
  type ItemStat,
  type Store,
} from './progress';

/** 全新用户从这两个模块的第 1 级开始 */
export const STARTER_IDS = ['degrees', 'intervals'];
const MAX_MODULES = 4; // 一组最多混合几个模块
const MAX_ITEMS_PER_MODULE = 4; // 每个模块最多抽几个考点
const MIN_PER_MODULE = 2; // 入选模块至少出几题

export interface PlanEntry {
  exId: string;
  item: string;
}

export interface Candidate extends PlanEntry {
  priority: number;
  strength: number;
}

/** 只读取进度：在副本上规范化（补全选项、级别不越界），不写回 store。 */
export function peekProgress(store: Store, ex: ExerciseDef): ExerciseProgress {
  const p = store.exercises[ex.id];
  const copy: Store = { ...store, exercises: p ? { [ex.id]: structuredClone(p) } : {} };
  return getProgress(copy, ex);
}

/** 当前选项下的全部考点。 */
export function allItemsOf(ex: ExerciseDef, options: Record<string, string>): string[] {
  return [...new Set(levelsOf(ex, options).flatMap((l) => l.items))];
}

/**
 * 出这些考点要用的选项：当前选项能覆盖就用当前的；
 * 否则在 scoped 选项（如调式）的各取值里找能覆盖的那个（如 minor:d3 → 自然小调）。
 */
export function optionsFor(ex: ExerciseDef, p: ExerciseProgress, items: string[]): Record<string, string> {
  const covers = (opts: Record<string, string>) => {
    const all = new Set(allItemsOf(ex, opts));
    return items.every((it) => all.has(it));
  };
  if (covers(p.options)) return p.options;
  for (const o of ex.options ?? []) {
    if (!o.scoped) continue;
    for (const v of o.values) {
      const opts = { ...p.options, [o.id]: v.id };
      if (covers(opts)) return opts;
    }
  }
  return p.options;
}

/** 掌握强度 0..1：滑动正确率 × 练习量置信度 */
export function strength(st: ItemStat): number {
  return st.n === 0 ? 0 : st.acc * Math.min(1, st.n / MASTERY_N);
}

/** 复习间隔（小时）：掌握越好间隔越长，从 1 小时到约 4 天 */
export function reviewInterval(st: ItemStat): number {
  return Math.pow(96, strength(st));
}

/** 考点优先级：越弱越高；超过复习间隔越久越高；没练过的新考点居中。 */
export function priority(st: ItemStat, now: number): number {
  if (st.n === 0) return 1;
  const hours = Math.max(0, now - st.last) / 3.6e6;
  const overdue = Math.min(2, hours / reviewInterval(st));
  return (1 - strength(st)) * 2 + overdue * 0.5;
}

function started(p: ExerciseProgress | undefined): boolean {
  return !!p && Object.values(p.items).some((st) => st.n > 0);
}

/** 今日训练的候选模块：已开始过的（不含需要麦克风或手动输入的）；不足两个时补上入门模块。 */
export function planModules(store: Store, exercises: ExerciseDef[]): ExerciseDef[] {
  const pool = exercises.filter((ex) => !ex.mic && !ex.manual);
  const mods = pool.filter((ex) => started(store.exercises[ex.id]));
  if (mods.length < 2) {
    for (const id of STARTER_IDS) {
      const ex = pool.find((e) => e.id === id);
      if (ex && !mods.includes(ex)) mods.push(ex);
    }
  }
  return mods;
}

/** 所有候选考点（只含各模块当前启用的考点），按优先级从高到低。 */
export function rankItems(store: Store, exercises: ExerciseDef[], now = Date.now()): Candidate[] {
  const out: Candidate[] = [];
  for (const ex of planModules(store, exercises)) {
    const p = peekProgress(store, ex);
    for (const item of activeItems(ex, p)) {
      const st = itemStat(p, item);
      out.push({ exId: ex.id, item, priority: priority(st, now), strength: strength(st) });
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/** 最大余数法分配：每份至少 min，其余按权重分。 */
export function allocate(total: number, weights: number[], min = 0): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const base = Math.min(min, Math.floor(total / n));
  const rest = total - base * n;
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * rest);
  const out = raw.map((r) => base + Math.floor(r));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) out[order[k][1]]++;
  return out;
}

export interface PlanOptions {
  size?: number;
  now?: number;
  rng?: () => number;
}

/** 生成一组今日训练：弱项与到期复习优先，跨模块分配，打乱顺序且尽量不连续重复同一考点。 */
export function planSession(store: Store, exercises: ExerciseDef[], opts: PlanOptions = {}): PlanEntry[] {
  const size = Math.max(1, opts.size ?? 20);
  const rng = opts.rng ?? Math.random;
  const ranked = rankItems(store, exercises, opts.now);

  // 按模块分组，模块需求度 = 前 3 个考点的平均优先级
  const byMod = new Map<string, Candidate[]>();
  for (const c of ranked) byMod.set(c.exId, [...(byMod.get(c.exId) ?? []), c]);
  const need = (cs: Candidate[]) => cs.slice(0, 3).reduce((a, c) => a + c.priority, 0) / Math.min(3, cs.length);
  const maxMods = Math.max(1, Math.min(MAX_MODULES, Math.floor(size / MIN_PER_MODULE)));
  const mods = [...byMod.entries()].sort((a, b) => need(b[1]) - need(a[1])).slice(0, maxMods);
  if (mods.length === 0) return [];

  const modSlots = allocate(
    size,
    mods.map(([, cs]) => need(cs) + 0.2),
    MIN_PER_MODULE,
  );

  const list: PlanEntry[] = [];
  mods.forEach(([exId, cs], i) => {
    const slots = modSlots[i];
    const top = cs.slice(0, Math.max(1, Math.min(MAX_ITEMS_PER_MODULE, slots)));
    allocate(
      slots,
      top.map((c) => c.priority + 0.1),
      1,
    ).forEach((k, j) => {
      for (let t = 0; t < k; t++) list.push({ exId, item: top[j].item });
    });
  });
  return shuffleNoRepeat(list, rng);
}

const same = (a: PlanEntry, b: PlanEntry) => a.exId === b.exId && a.item === b.item;

/** 洗牌后修正相邻重复：与后面第一个不同的题交换。 */
export function shuffleNoRepeat(list: PlanEntry[], rng: () => number): PlanEntry[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  for (let i = 1; i < a.length; i++) {
    if (!same(a[i], a[i - 1])) continue;
    const j = a.findIndex(
      (x, k) =>
        k > i && !same(x, a[i - 1]) && (k + 1 >= a.length || !same(a[i], a[k + 1])) && (k - 1 === i || !same(a[i], a[k - 1])),
    );
    if (j > 0) [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 某模块的薄弱点：已练考点按正确率由低到高，取未掌握的 2~4 个（不足 2 个时用次弱/未练考点补足）。
 * pool 为候选考点（如统计页某个调式分组），缺省为当前选项下的全部考点；结果都在同一个调式内。
 */
export function weakItems(ex: ExerciseDef, p: ExerciseProgress, pool = allItemsOf(ex, p.options)): string[] {
  const inPool = new Set(pool);
  const practiced = pool
    .filter((it) => (p.items[it]?.n ?? 0) > 0)
    .sort((a, b) => itemStat(p, a).acc - itemStat(p, b).acc || itemStat(p, a).n - itemStat(p, b).n);
  const out = practiced.filter((it) => itemStat(p, it).acc < MASTERY_ACC).slice(0, 4);
  const active = activeItems(ex, p).filter((it) => inPool.has(it));
  for (const it of [...practiced, ...active, ...pool]) {
    if (out.length >= 2) break;
    if (!out.includes(it)) out.push(it);
  }
  return out;
}
