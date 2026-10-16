// 自定义练习组合的纯函数：规范化（读取存储、导入备份、打开分享链接时用）与出题顺序。
// 不依赖 progress.ts（progress.ts 读取存储时要用 sanitizeSets），也不修改练习本身的出题逻辑。

import { EXERCISES, exerciseById } from '../exercises';
import type { ExerciseDef, Level, Settings } from './types';
import type { PracticeSet, SetPart } from './practiceSet';

/** 每组题数范围与缺省值 */
export const SET_COUNT_MIN = 5;
export const SET_COUNT_MAX = 100;
export const SET_COUNT_DEFAULT = 20;
/** 权重范围 */
export const SET_WEIGHT_MAX = 3;
/** 名称最长字数 */
export const SET_NAME_MAX = 40;
/** 最多保存的组合数 */
export const SETS_MAX = 100;

/** 能放进组合的练习：与今日训练相同，不含需要麦克风或手动输入（打节奏）的练习。 */
export function canUseInSet(ex: ExerciseDef): boolean {
  return !ex.mic && !ex.manual;
}

export const SET_EXERCISES: ExerciseDef[] = EXERCISES.filter(canUseInSet);

/** 练习的默认选项 */
export function defaultOptions(ex: ExerciseDef): Record<string, string> {
  return Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default]));
}

/** 完整选项：默认值 + 组合里给定的（未知或取值不对的忽略）。 */
export function fullOptions(ex: ExerciseDef, options: Record<string, string>): Record<string, string> {
  const out = defaultOptions(ex);
  for (const o of ex.options ?? []) {
    const v = options[o.id];
    if (o.values.some((x) => x.id === v)) out[o.id] = v;
  }
  return out;
}

/** 给定选项下的级别表（同 progress.levelsOf，这里不引入 progress.ts 以免循环依赖） */
export function setLevels(ex: ExerciseDef, options: Record<string, string>): Level[] {
  return ex.levelsFor?.(fullOptions(ex, options)) ?? ex.levels;
}

/** 给定选项下的全部考点（按级别顺序） */
export function setAllItems(ex: ExerciseDef, options: Record<string, string>): string[] {
  return [...new Set(setLevels(ex, options).flatMap((l) => l.items))];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clampInt = (v: unknown, min: number, max: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : d;

/** 新的本地 id */
export function newSetId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

/** 规范化一个练习：未知练习返回 null；只保留认识的选项取值与当前选项下存在的考点（去重，保持顺序）。 */
export function normalizePart(raw: unknown): SetPart | null {
  if (!isObj(raw) || typeof raw.ex !== 'string') return null;
  const ex = exerciseById[raw.ex] as ExerciseDef | undefined;
  if (!ex || !canUseInSet(ex)) return null;
  const options: Record<string, string> = {};
  if (isObj(raw.options))
    for (const o of ex.options ?? []) {
      const v = raw.options[o.id];
      if (typeof v === 'string' && o.values.some((x) => x.id === v)) options[o.id] = v;
    }
  const known = new Set(setAllItems(ex, options));
  const items = Array.isArray(raw.items) ? [...new Set(raw.items.filter((it): it is string => typeof it === 'string' && known.has(it)))] : [];
  if (items.length === 0) return null;
  const part: SetPart = { ex: ex.id, items, options };
  const weight = clampInt(raw.weight, 1, SET_WEIGHT_MAX, 1);
  if (weight > 1) part.weight = weight;
  return part;
}

/**
 * 规范化组合（读取存储、导入备份、打开分享链接时用）：
 * 丢弃未知/不能用的练习、已不存在的考点与选项取值、重复的练习（保留第一个）；题数限定在 5–100，权重 1–3。
 * 没有可用的练习或格式不对时返回 null。缺少 id / 创建时间（如分享来的）时新生成。
 */
export function normalizeSet(raw: unknown): PracticeSet | null {
  if (!isObj(raw) || !Array.isArray(raw.parts)) return null;
  const parts: SetPart[] = [];
  for (const p of raw.parts) {
    const part = normalizePart(p);
    if (part && !parts.some((x) => x.ex === part.ex)) parts.push(part);
  }
  if (parts.length === 0) return null;
  const set: PracticeSet = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : newSetId(),
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, SET_NAME_MAX) : '',
    parts,
    count: clampInt(raw.count, SET_COUNT_MIN, SET_COUNT_MAX, SET_COUNT_DEFAULT),
    created: typeof raw.created === 'number' && Number.isFinite(raw.created) && raw.created > 0 ? Math.floor(raw.created) : Date.now(),
  };
  // 固定题目的种子：32 位无符号整数
  if (typeof raw.seed === 'number' && Number.isInteger(raw.seed) && raw.seed >= 0 && raw.seed <= 0xffffffff) set.seed = raw.seed;
  return set;
}

/** 规范化保存的组合列表：丢弃无效的与重复 id 的，最多 SETS_MAX 个。 */
export function sanitizeSets(raw: unknown): PracticeSet[] {
  if (!Array.isArray(raw)) return [];
  const out: PracticeSet[] = [];
  for (const v of raw) {
    const s = normalizeSet(v);
    if (s && !out.some((x) => x.id === s.id)) out.push(s);
    if (out.length >= SETS_MAX) break;
  }
  return out;
}

// ───── 出题 ─────

/** 下一题：与 Practice.tsx 的 Draw 结构相同（模块 + 考点 + 出题上下文） */
export interface SetDraw {
  ex: ExerciseDef;
  item: string;
  items: string[];
  options: Record<string, string>;
}

/** 与 Practice.tsx 的 QuizSource 结构相同的有限题源 */
export interface SetSource {
  next(): SetDraw | null;
  hasNext(): boolean;
  /** 本组题数 */
  readonly total: number;
  /** 已出的题数 */
  readonly shown: number;
}

/** 按权重把 total 分给各部分（按比例取整，余下的给小数部分大的）；题数够时每部分至少 1 题。 */
export function allocateCounts(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const min = total >= n ? 1 : 0;
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const ideal = weights.map((w) => (w / sum) * total);
  const out = ideal.map((x) => Math.max(min, Math.floor(x)));
  const argmax = (score: (i: number) => number, ok: (i: number) => boolean) => {
    let best = -1;
    for (let i = 0; i < n; i++) if (ok(i) && (best < 0 || score(i) > score(best))) best = i;
    return best;
  };
  let diff = total - out.reduce((a, b) => a + b, 0);
  // 保底 1 题导致超出时，从比理想值多得最多的部分减
  for (; diff < 0; diff++) out[argmax((i) => out[i] - ideal[i], (i) => out[i] > min)]--;
  for (; diff > 0; diff--) out[argmax((i) => ideal[i] - out[i], () => true)]++;
  return out;
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 抽 n 个考点：洗牌后轮流取，均匀覆盖、尽量不连续重复。 */
function drawFrom(items: string[], n: number, rng: () => number): string[] {
  const out: string[] = [];
  while (out.length < n) {
    const bag = shuffle([...items], rng);
    if (bag.length > 1 && bag[0] === out[out.length - 1]) [bag[0], bag[1]] = [bag[1], bag[0]];
    out.push(...bag);
  }
  return out.slice(0, n);
}

/** 一组题的顺序：各部分按权重分配题数，部分内考点均匀轮换，再整体打乱（同一考点尽量不相邻）。 */
export function planSet(set: PracticeSet, rng: () => number = Math.random): { part: number; item: string }[] {
  type Entry = { part: number; item: string };
  const counts = allocateCounts(set.count, set.parts.map((p) => p.weight ?? 1));
  const pool = shuffle(
    set.parts.flatMap((p, part) => drawFrom(p.items, counts[part], rng).map((item): Entry => ({ part, item }))),
    rng,
  );
  // 依次取池中第一个与上一题不同的；只剩同一考点时，插到前面两边都不同的位置
  const same = (a: Entry, b: Entry | undefined) => !!b && a.part === b.part && a.item === b.item;
  const out: Entry[] = [];
  while (pool.length > 0) {
    const k = pool.findIndex((x) => !same(x, out[out.length - 1]));
    if (k >= 0) {
      out.push(pool.splice(k, 1)[0]);
      continue;
    }
    const x = pool.shift()!;
    const pos = out.findIndex((y, i) => !same(x, y) && !same(x, out[i - 1]));
    out.splice(pos < 0 ? out.length : pos, 0, x);
  }
  return out;
}

/**
 * 组合的题源（交给 Quiz）：rng 只决定本组的出题顺序；题目本身由各练习的 generate 生成。
 * 给定同一个 rng 序列时顺序完全相同（固定题目功能据此复现）。
 */
export function setSource(set: PracticeSet, rng: () => number = Math.random): SetSource {
  const plan = planSet(set, rng);
  const parts = set.parts.map((p) => {
    const ex = exerciseById[p.ex];
    return { ex, items: p.items, options: fullOptions(ex, p.options) };
  });
  let i = 0;
  return {
    next() {
      const e = plan[i];
      if (!e) return null;
      i++;
      const p = parts[e.part];
      return { ex: p.ex, item: e.item, items: p.items, options: p.options };
    },
    hasNext: () => i < plan.length,
    get total() {
      return plan.length;
    },
    get shown() {
      return i;
    },
  };
}

/**
 * 这个练习在给定选项下至少要选几个考点：选项就是考点本身的练习（如音程、和弦性质）只选一个时只有一个选项可点，
 * 需要至少 2 个；其他练习（如节奏、听写）一个考点也能出题。
 */
export function minItems(ex: ExerciseDef, options: Record<string, string>, settings: Settings): number {
  const all = setAllItems(ex, options);
  if (all.length < 2) return 1;
  try {
    const q = ex.generate(all[0], { settings, items: [all[0]], options: fullOptions(ex, options) });
    return !q.notate && !q.tap && !q.sing && q.choices.length < 2 ? 2 : 1;
  } catch {
    return 2;
  }
}
