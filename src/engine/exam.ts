// 模拟考试：试卷（固定的部分、题数、难度、时限与重听次数）、出题、计分，以及答题流程的纯 reducer。
// 题目全部由现有练习的生成器产生（不照搬任何真题）；难度按每部分固定的级别与选项，与用户自己的进度无关。

import type { Timbre } from '../audio/timbres';
import { exerciseById } from '../exercises';
import { levelsOf } from './progress';
import type { ExamPreset, ExamSection } from './examPresets';
import type { ExerciseDef, Question, Settings } from './types';

// 试卷定义在 examPresets.ts（首页入口卡片只用到它），这里一并导出
export { EXAM_PRESETS, examPresetById, presetCount, type ExamPreset, type ExamSection } from './examPresets';

/** 部分的完整选项：练习默认值 + 固定选项。 */
export function sectionOptions(sec: ExamSection): Record<string, string> {
  const ex = exerciseById[sec.exId];
  return { ...Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default])), ...sec.options };
}

/** 部分的考点：所选级别的并集。 */
export function sectionItems(sec: ExamSection): string[] {
  const levels = levelsOf(exerciseById[sec.exId], sectionOptions(sec));
  return [...new Set(sec.levels.flatMap((i) => levels[i]?.items ?? []))];
}

/** 抽 n 个考点：洗牌后轮流取，尽量均匀覆盖、不连续重复。 */
export function drawItems(items: string[], n: number, rnd: () => number = Math.random): string[] {
  const out: string[] = [];
  while (out.length < n) {
    const bag = [...items];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // 新一轮的第一个与上一轮的最后一个相同时，换到后面
    if (bag.length > 1 && bag[0] === out[out.length - 1]) [bag[0], bag[1]] = [bag[1], bag[0]];
    out.push(...bag);
  }
  return out.slice(0, n);
}

export interface ExamQuestion {
  /** 所属部分（下标） */
  section: number;
  ex: ExerciseDef;
  q: Question;
}

/** 按试卷生成整套题目（使用当前语言与用户的命名、调性等显示设置）。 */
export function buildExam(preset: ExamPreset, settings: Settings, rnd: () => number = Math.random): ExamQuestion[] {
  return preset.sections.flatMap((sec, section) => {
    const ex = exerciseById[sec.exId];
    const items = sectionItems(sec);
    const options = sectionOptions(sec);
    return drawItems(items, sec.count, rnd).map((item) => ({
      section,
      ex,
      q: ex.generate(item, { settings, items, options }),
    }));
  });
}

// ───── 计分 ─────

/** 一题的判分：每一步是否答对（未作答为错），得分为答对步数的比例（听写按音给分）。 */
export function gradeQuestion(answer: string[], given: (string | null)[]): { steps: boolean[]; score: number } {
  const steps = answer.map((a, i) => given[i] === a);
  return { steps, score: steps.length ? steps.filter(Boolean).length / steps.length : 0 };
}

export interface SectionScore {
  /** 本部分得分（按满分折算，保留一位小数） */
  got: number;
  max: number;
  /** 得分率 0..100（取整） */
  pct: number;
  /** 全对的题数 / 题数 */
  right: number;
  n: number;
}

export interface ItemScore {
  exId: string;
  item: string;
  n: number;
  c: number;
}

export interface ExamScore {
  /** 总分 0..100（取整） */
  total: number;
  sections: SectionScore[];
  /** 每题每步的判分 */
  graded: { steps: boolean[]; score: number }[];
  /** 按考点汇总（每个作答过的步骤一次） */
  items: ItemScore[];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function scoreExam(
  preset: ExamPreset,
  questions: { section: number; ex: { id: string }; q: Pick<Question, 'answer' | 'item' | 'stepItems'> }[],
  answers: (string | null)[][],
): ExamScore {
  const graded = questions.map((x, i) => gradeQuestion(x.q.answer, answers[i] ?? []));
  const sections = preset.sections.map((sec, si) => {
    const idx = questions.map((x, i) => (x.section === si ? i : -1)).filter((i) => i >= 0);
    const sum = idx.reduce((a, i) => a + graded[i].score, 0);
    const frac = idx.length ? sum / idx.length : 0;
    return {
      got: round1(frac * sec.points),
      max: sec.points,
      pct: Math.round(frac * 100),
      right: idx.filter((i) => graded[i].score === 1).length,
      n: idx.length,
    };
  });
  const total = Math.round(
    preset.sections.reduce((a, sec, si) => a + (sections[si].n ? (sec.points * sections[si].pct) / 100 : 0), 0),
  );
  const items = new Map<string, ItemScore>();
  questions.forEach((x, i) =>
    graded[i].steps.forEach((ok, s) => {
      // 未作答（如时间到）不算考点证据，只在分数里计为错
      if ((answers[i]?.[s] ?? null) === null) return;
      const item = x.q.stepItems?.[s] ?? x.q.item;
      const key = `${x.ex.id}:${item}`;
      const it = items.get(key) ?? { exId: x.ex.id, item, n: 0, c: 0 };
      it.n++;
      if (ok) it.c++;
      items.set(key, it);
    }),
  );
  return { total, sections, graded, items: [...items.values()] };
}

/** 评级：90 优秀、75 良好、60 合格，否则未通过。 */
export function examGrade(total: number): 'excellent' | 'good' | 'pass' | 'fail' {
  return total >= 90 ? 'excellent' : total >= 75 ? 'good' : total >= 60 ? 'pass' : 'fail';
}

/** 薄弱考点：有答错的考点，按正确率由低到高。 */
export function weakItems(items: ItemScore[]): ItemScore[] {
  return items.filter((it) => it.c < it.n).sort((a, b) => a.c / a.n - b.c / b.n || b.n - a.n);
}

/**
 * 专练用的考点（按练习）：答错的考点 + 被误认成的选项（若也是该练习的考点），不足 2 个时用本练习在卷中的其他考点补足。
 * 返回 [练习 id, 考点][]，顺序按薄弱程度。
 */
export function drillTargets(
  preset: ExamPreset,
  questions: { section: number; ex: { id: string }; q: Pick<Question, 'answer' | 'item' | 'stepItems'> }[],
  answers: (string | null)[][],
  score: ExamScore,
): { exId: string; items: string[] }[] {
  const out = new Map<string, string[]>();
  const add = (exId: string, item: string) => {
    const list = out.get(exId) ?? [];
    if (!list.includes(item)) list.push(item);
    out.set(exId, list);
  };
  for (const w of weakItems(score.items)) add(w.exId, w.item);
  // 误认成的选项
  questions.forEach((x, i) => {
    const pool = new Set(sectionItems(preset.sections[x.section]));
    x.q.answer.forEach((a, s) => {
      const g = answers[i]?.[s];
      if (g && g !== a && pool.has(g) && out.has(x.ex.id)) add(x.ex.id, g);
    });
  });
  for (const [exId, list] of out) {
    if (list.length >= 2) continue;
    const pool = preset.sections.filter((s) => s.exId === exId).flatMap(sectionItems);
    for (const it of pool) if (list.length < 2 && !list.includes(it)) list.push(it);
  }
  return [...out.entries()].map(([exId, items]) => ({ exId, items }));
}

// ───── 答题流程（纯 reducer） ─────

export interface RunState {
  status: 'running' | 'done';
  /** 当前题 */
  idx: number;
  /** 每题的步数 */
  lens: number[];
  /** 每题每步的作答（null 为未答） */
  answers: (string | null)[][];
  /** 当前题正在作答的步骤 */
  cursor: number;
  /** 每题已播放次数（含自动播放） */
  plays: number[];
  /** 每题最多播放次数 = 1 + 重听次数 */
  maxPlays: number;
  /** 每题播放时用的乐器（随机音色模式下每题不同；null 为跟随设置）：重听与交卷后回顾都用它 */
  timbres: (Timbre | null)[];
  startedAt: number;
  /** 截止时间戳；null 为不限时 */
  deadline: number | null;
  endedAt: number | null;
  timedOut: boolean;
}

export type RunAction =
  | { type: 'play'; timbre?: Timbre | null }
  | { type: 'answer'; id: string; now: number }
  | { type: 'cursor'; step: number }
  | { type: 'next'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'submit'; now: number };

export function initRun(lens: number[], replays: number, limitSecs: number | null, now: number): RunState {
  return {
    status: 'running',
    idx: 0,
    lens,
    answers: lens.map((n) => Array<string | null>(n).fill(null)),
    cursor: 0,
    plays: lens.map(() => 0),
    timbres: lens.map(() => null),
    maxPlays: 1 + Math.max(0, replays),
    startedAt: now,
    deadline: limitSecs === null ? null : now + limitSecs * 1000,
    endedAt: null,
    timedOut: false,
  };
}

/** 当前题还能否播放 */
export const canPlay = (s: RunState) => s.status === 'running' && s.plays[s.idx] < s.maxPlays;

/** 当前题剩余播放次数 */
export const playsLeft = (s: RunState) => Math.max(0, s.maxPlays - s.plays[s.idx]);

/** 剩余秒数（不限时为 null） */
export const secsLeft = (s: RunState, now: number) =>
  s.deadline === null ? null : Math.max(0, Math.ceil((s.deadline - (s.endedAt ?? now)) / 1000));

const finish = (s: RunState, now: number, timedOut: boolean): RunState => ({
  ...s,
  status: 'done',
  endedAt: timedOut && s.deadline !== null ? s.deadline : now,
  timedOut,
});

export function runReducer(s: RunState, a: RunAction): RunState {
  if (s.status === 'done') return s;
  switch (a.type) {
    case 'play': {
      if (!canPlay(s)) return s;
      const plays = [...s.plays];
      plays[s.idx]++;
      if (!a.timbre || s.timbres[s.idx]) return { ...s, plays };
      // 记下本题第一次播放（自动播放）时的乐器
      const timbres = [...s.timbres];
      timbres[s.idx] = a.timbre;
      return { ...s, plays, timbres };
    }
    case 'answer': {
      // 已到截止时间（计时器还没来得及收卷）：不再接受作答，直接按超时收卷
      if (s.deadline !== null && a.now >= s.deadline) return finish(s, a.now, true);
      const answers = s.answers.map((x) => [...x]);
      const cur = answers[s.idx];
      cur[s.cursor] = a.id;
      // 跳到后面第一个未答的步骤；都答了就停在原处（可以继续修改）
      let next = s.cursor;
      for (let k = 1; k < cur.length; k++) {
        const j = (s.cursor + k) % cur.length;
        if (cur[j] === null) {
          next = j;
          break;
        }
      }
      if (next === s.cursor && s.cursor < cur.length - 1 && cur.every((x) => x !== null)) next = s.cursor + 1;
      return { ...s, answers, cursor: next };
    }
    case 'cursor':
      return a.step >= 0 && a.step < s.lens[s.idx] ? { ...s, cursor: a.step } : s;
    case 'next':
      if (s.deadline !== null && a.now >= s.deadline) return finish(s, a.now, true);
      return s.idx >= s.lens.length - 1 ? finish(s, a.now, false) : { ...s, idx: s.idx + 1, cursor: 0 };
    case 'tick':
      return s.deadline !== null && a.now >= s.deadline ? finish(s, a.now, true) : s;
    case 'submit':
      return finish(s, a.now, s.deadline !== null && a.now >= s.deadline);
  }
}
