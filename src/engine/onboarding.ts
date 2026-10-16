// 新手引导：按用户背景设定各模块的起始级别与每日目标。纯函数（applyBackground 只修改传入的 store）。

import type { ExerciseDef } from './types';
import { t } from '../i18n';
import { getProgress, levelsOf, type Store } from './progress';

export type Background = 'beginner' | 'player' | 'exam';

/** 背景选项；label / desc 按当前语言取值 */
export const BACKGROUNDS: { id: Background; readonly label: string; readonly desc: string }[] = (
  ['beginner', 'player', 'exam'] as const
).map((id) => ({
  id,
  get label() {
    return t(`bg.${id}`);
  },
  get desc() {
    return t(`bg.${id}.desc`);
  },
}));

/**
 * 各背景的起始级别（0 起，即「已解锁到第几级」，前面各级的考点一并启用）。未列出的模块从第 1 级开始。
 * 学过乐器：跳过音级、和弦、转位、音阶的第 1 级与音程的前 2 级，和声听写从原位 Ⅰ Ⅳ Ⅴ ⅵ ⅱ 起；
 * 备考：再往前推一到两级，并覆盖七和弦（含转位）、旋律听写，和声听写直接到六和弦与属七（与艺考模拟一致）。
 */
export const START_LEVELS: Record<Background, Record<string, number>> = {
  beginner: {},
  player: { degrees: 1, intervals: 2, chords: 1, inversions: 1, scales: 1, progressions: 1, rhythm: 1, rhythmTap: 1, harmony: 1 },
  exam: { degrees: 2, intervals: 3, chords: 3, inversions: 2, scales: 2, progressions: 2, rhythm: 2, rhythmTap: 2, dictation: 1, singing: 1, harmony: 3 },
};

/** 建议的每日目标题数 */
export const DAILY_GOALS: Record<Background, number> = { beginner: 20, player: 30, exam: 50 };

/** 某背景下某模块的起始级别（按当前选项的级别表截断）。 */
export function startLevel(bg: Background, ex: ExerciseDef, options: Record<string, string> = {}): number {
  const lv = START_LEVELS[bg][ex.id] ?? 0;
  return Math.max(0, Math.min(lv, levelsOf(ex, options).length - 1));
}

/**
 * 应用背景：提升各模块的起始级别并设定每日目标。只升不降，已有的练习记录与自选考点保持不变
 * （重新查看引导时不会把用户已解锁的级别调低）。
 */
export function applyBackground(store: Store, bg: Background, exercises: ExerciseDef[]): void {
  for (const ex of exercises) {
    if (!START_LEVELS[bg][ex.id]) continue;
    const p = getProgress(store, ex);
    p.level = Math.max(p.level, startLevel(bg, ex, p.options));
  }
  store.settings.dailyGoal = DAILY_GOALS[bg];
}

/** 累计作答题数（首页「从这里开始」提示用） */
export function totalAnswered(store: Store): number {
  return Object.values(store.daily).reduce((a, d) => a + d.n, 0);
}

/** 新手提示显示到累计答满这么多题为止 */
export const NEWBIE_QUESTIONS = 10;
