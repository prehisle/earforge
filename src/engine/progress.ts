// 学习进度：每个考点的掌握度（指数滑动正确率）、自适应抽题、自动升级。数据保存在 localStorage。

import type { ExerciseDef, Level, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { detectLocale } from '../i18n';
import { sanitizeExams, type ExamRecord } from './examHistory';

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
  /** scoped 选项其他取值下暂存的级别与自选考点，键为「选项id:取值」 */
  scoped?: Record<string, { level: number; custom: string[] | null }>;
}

/**
 * 每日汇总。ex 为按练习拆分的 [作答, 答对]（元组比对象省约 30% 体积）；
 * 旧版本记录的日子没有 ex，趋势图把这些天的分练习数据视为「未知」而不是 0。
 */
export interface DayStat {
  n: number;
  c: number;
  ex?: Record<string, [number, number]>;
}

/** 视唱曲库中一首歌的记录 */
export interface SongResult {
  best: number; // 跟唱最高音准分 0..100
  attempts: number; // 跟唱次数
  practiced: number; // 逐音练习唱完的次数
  last: number; // 上次练习时间戳
  lastScore: number; // 上次跟唱的分数
}

export interface Store {
  version: 1;
  settings: Settings;
  exercises: Record<string, ExerciseProgress>;
  daily: Record<string, DayStat>; // 键为本地日期 YYYY-MM-DD
  /** 视唱曲库的记录（按曲目 id），与练耳进度分开，不计入每日题数。旧数据没有该字段 */
  songs?: Record<string, SongResult>;
  /** 模拟考试的历史成绩（按时间先后）。旧数据没有该字段 */
  exams?: ExamRecord[];
}

const KEY = 'earforge:v1';
const ALPHA = 0.3; // 新结果权重
export const MASTERY_ACC = 0.85;
export const MASTERY_N = 5;

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
      s.exercises ??= {};
      s.daily = sanitizeDaily(s.daily);
      s.songs ??= {};
      s.exams = sanitizeExams(s.exams);
      // 已有练习记录的一定是老用户，不再显示新手引导
      if (!s.settings.onboarded && hasProgress(s)) s.settings.onboarded = true;
      return s;
    }
  } catch {
    /* 数据损坏则重置 */
  }
  // 全新用户：显示新手引导，界面语言跟随浏览器
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, onboarded: false, lang: detectLocale() },
    exercises: {},
    daily: {},
    songs: {},
    exams: [],
  };
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** 规范化每日记录（读取本地数据与导入备份时用）：丢弃格式不对的日期与字段，答对数不超过作答数。 */
export function sanitizeDaily(raw: unknown): Record<string, DayStat> {
  const out: Record<string, DayStat> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!DAY_KEY.test(k) || !v || typeof v !== 'object') continue;
    const d = v as { n?: unknown; c?: unknown; ex?: unknown };
    const n = count(d.n);
    const day: DayStat = { n, c: Math.min(n, count(d.c)) };
    if (d.ex && typeof d.ex === 'object') {
      const ex: Record<string, [number, number]> = {};
      for (const [id, e] of Object.entries(d.ex as Record<string, unknown>)) {
        if (!Array.isArray(e)) continue;
        const en = count(e[0]);
        if (en > 0) ex[id] = [en, Math.min(en, count(e[1]))];
      }
      if (Object.keys(ex).length > 0) day.ex = ex;
    }
    out[k] = day;
  }
  return out;
}

/** 是否已有练习记录（任一考点作答过，或有每日记录） */
export function hasProgress(s: Store): boolean {
  return Object.keys(s.daily).length > 0 || Object.values(s.exercises).some((p) => Object.keys(p.items ?? {}).length > 0);
}

export function saveStore(s: Store): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** 取进度并规范化：补全/修正选项（未知取值回到默认），级别不越界，自选考点只保留当前级别表中的。 */
export function getProgress(s: Store, ex: ExerciseDef): ExerciseProgress {
  let p = s.exercises[ex.id];
  if (!p) {
    p = { level: 0, custom: null, items: {}, options: {} };
    s.exercises[ex.id] = p;
  }
  for (const o of ex.options ?? [])
    if (!o.values.some((v) => v.id === p.options[o.id])) p.options[o.id] = o.default;
  const levels = levelsOf(ex, p.options);
  p.level = Math.max(0, Math.min(p.level, levels.length - 1));
  if (p.custom) {
    const known = new Set(levels.flatMap((l) => l.items));
    const kept = p.custom.filter((it) => known.has(it));
    p.custom = kept.length > 0 ? kept : null;
  }
  return p;
}

/** 当前选项下的级别表。 */
export function levelsOf(ex: ExerciseDef, options: Record<string, string>): Level[] {
  return ex.levelsFor?.(options) ?? ex.levels;
}

/** 当前级别（越界时取最近的）。 */
export function currentLevel(ex: ExerciseDef, p: ExerciseProgress): Level {
  const levels = levelsOf(ex, p.options);
  return levels[Math.max(0, Math.min(p.level, levels.length - 1))];
}

/** 修改选项。scoped 选项（如调式）切换时，暂存旧取值下的级别与自选考点，恢复新取值下的。 */
export function setOption(ex: ExerciseDef, p: ExerciseProgress, id: string, value: string): void {
  const old = p.options[id];
  if (old === value) return;
  if (ex.options?.find((o) => o.id === id)?.scoped) {
    p.scoped ??= {};
    p.scoped[`${id}:${old}`] = { level: p.level, custom: p.custom };
    const saved = p.scoped[`${id}:${value}`];
    p.level = saved?.level ?? 0;
    p.custom = saved?.custom ?? null;
  }
  p.options[id] = value;
}

/** 按 scoped 选项的各个取值列出全部考点（统计页分组用）；没有 scoped 选项时只有一组。 */
export function itemGroups(ex: ExerciseDef): { id: string; label: string; items: string[] }[] {
  const defaults = Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default]));
  const o = ex.options?.find((x) => x.scoped);
  const variants = o
    ? o.values.map((v) => ({ id: v.id, label: v.label, options: { ...defaults, [o.id]: v.id } }))
    : [{ id: '', label: '', options: defaults }];
  return variants.map((v) => ({
    id: v.id,
    label: v.label,
    items: [...new Set(levelsOf(ex, v.options).flatMap((l) => l.items))],
  }));
}

/** 当前启用的考点：自选优先，否则为 0..level 所有级别的并集。 */
export function activeItems(ex: ExerciseDef, p: ExerciseProgress): string[] {
  if (p.custom && p.custom.length > 0) return p.custom;
  const levels = levelsOf(ex, p.options);
  const set = new Set<string>();
  for (let i = 0; i <= Math.min(p.level, levels.length - 1); i++) levels[i].items.forEach((it) => set.add(it));
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
  // 按练习记一笔：p 一定是 s.exercises 中的某个对象（由 getProgress 取得），反查得到练习 id
  const exId = Object.keys(s.exercises).find((k) => s.exercises[k] === p);
  if (exId) {
    const e = ((d.ex ??= {})[exId] ??= [0, 0]);
    e[0]++;
    if (correct) e[1]++;
  }
}

/** 当前级别所有考点都已掌握 → 可以升级。 */
export function canLevelUp(ex: ExerciseDef, p: ExerciseProgress): boolean {
  if (p.custom || p.level >= levelsOf(ex, p.options).length - 1) return false;
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
