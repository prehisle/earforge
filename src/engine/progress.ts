// 学习进度：每个考点的掌握度（指数滑动正确率）、自适应抽题、自动升级。数据保存在 localStorage。

import type { ExerciseDef, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

export interface ItemStat {
  n: number; // 作答次数
  c: number; // 答对次数
  acc: number; // 滑动正确率 0..1
  last: number; // 上次作答时间戳
}

export interface ExerciseProgress {
  level: number; // 已解锁到的级别（0 起）
  custom: string[] | null; // 用户自选考点；null 表示按级别
  items: Record<string, ItemStat>;
  options: Record<string, string>;
}

export interface Store {
  version: 1;
  settings: Settings;
  exercises: Record<string, ExerciseProgress>;
  daily: Record<string, { n: number; c: number }>; // YYYY-MM-DD
}

const KEY = 'earforge:v1';
const ALPHA = 0.3; // 新结果权重
const MASTERY_ACC = 0.85;
const MASTERY_N = 5;

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
      s.exercises ??= {};
      s.daily ??= {};
      return s;
    }
  } catch {
    /* 数据损坏则重置 */
  }
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, exercises: {}, daily: {} };
}

export function saveStore(s: Store): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function getProgress(s: Store, ex: ExerciseDef): ExerciseProgress {
  let p = s.exercises[ex.id];
  if (!p) {
    p = { level: 0, custom: null, items: {}, options: {} };
    s.exercises[ex.id] = p;
  }
  for (const o of ex.options ?? []) p.options[o.id] ??= o.default;
  return p;
}

/** 当前启用的考点：自选优先，否则为 0..level 所有级别的并集。 */
export function activeItems(ex: ExerciseDef, p: ExerciseProgress): string[] {
  if (p.custom && p.custom.length > 0) return p.custom;
  const set = new Set<string>();
  for (let i = 0; i <= Math.min(p.level, ex.levels.length - 1); i++) ex.levels[i].items.forEach((it) => set.add(it));
  return [...set];
}

export function itemStat(p: ExerciseProgress, item: string): ItemStat {
  return p.items[item] ?? { n: 0, c: 0, acc: 0.5, last: 0 };
}

/** 加权抽题：越不熟、越久没练、越新的考点越容易被抽到；尽量不连续重复。 */
export function pickItem(p: ExerciseProgress, items: string[], prev?: string): string {
  if (items.length === 1) return items[0];
  const now = Date.now();
  const weights = items.map((it) => {
    const st = itemStat(p, it);
    let w = 0.2 + Math.pow(1 - st.acc, 1.5) * 2.5;
    if (st.n < 3) w += 1;
    const hours = st.last ? (now - st.last) / 3.6e6 : 24;
    w += Math.min(0.5, hours / 48);
    if (it === prev) w *= 0.25;
    return w;
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function record(s: Store, p: ExerciseProgress, item: string, correct: boolean): void {
  const st = itemStat(p, item);
  st.n++;
  if (correct) st.c++;
  st.acc = st.acc * (1 - ALPHA) + (correct ? 1 : 0) * ALPHA;
  st.last = Date.now();
  p.items[item] = st;
  const d = (s.daily[today()] ??= { n: 0, c: 0 });
  d.n++;
  if (correct) d.c++;
}

/** 当前级别所有考点都已掌握 → 可以升级。 */
export function canLevelUp(ex: ExerciseDef, p: ExerciseProgress): boolean {
  if (p.custom || p.level >= ex.levels.length - 1) return false;
  return activeItems(ex, p).every((it) => {
    const st = itemStat(p, it);
    return st.n >= MASTERY_N && st.acc >= MASTERY_ACC;
  });
}

export function mastery(p: ExerciseProgress, items: string[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((a, it) => {
    const st = itemStat(p, it);
    return a + (st.n === 0 ? 0 : st.acc * Math.min(1, st.n / MASTERY_N));
  }, 0);
  return sum / items.length;
}

/** 连续练习天数（今天未练则从昨天往前数）。 */
export function streak(s: Store): number {
  let count = 0;
  const d = new Date();
  const key = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (!s.daily[key(d)]) d.setDate(d.getDate() - 1);
  while (s.daily[key(d)]) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}
