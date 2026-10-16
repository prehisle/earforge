import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXAM_PRESETS,
  buildExam,
  canPlay,
  drawItems,
  drillTargets,
  examGrade,
  gradeQuestion,
  initRun,
  playsLeft,
  presetCount,
  runReducer,
  scoreExam,
  secsLeft,
  sectionItems,
  sectionOptions,
  weakItems,
  type RunAction,
  type RunState,
} from '../engine/exam';
import { EXAM_HISTORY_MAX, addExamRecord, presetHistory, sanitizeExams, type ExamRecord } from '../engine/examHistory';
import { levelsOf, loadStore } from '../engine/progress';
import { DEFAULT_SETTINGS } from '../engine/types';
import { exerciseById } from '../exercises';
import { setLocale } from '../i18n';
import { zh } from '../i18n/zh';

const CJK = /[一-鿿]/;

afterEach(() => setLocale('zh'));

describe('试卷', () => {
  it('试卷 id 唯一，满分 100，标题与部分名称都在词典里', () => {
    expect(new Set(EXAM_PRESETS.map((p) => p.id)).size).toBe(EXAM_PRESETS.length);
    for (const p of EXAM_PRESETS) {
      expect(p.sections.reduce((a, s) => a + s.points, 0)).toBe(100);
      expect(p.title in zh && p.desc in zh).toBe(true);
      expect(p.minutes).toBeGreaterThan(0);
      expect(p.replays).toBeGreaterThanOrEqual(0);
      for (const s of p.sections) expect(s.title in zh).toBe(true);
    }
  });

  it('每部分的选项取值有效、级别存在、考点至少 2 个', () => {
    for (const p of EXAM_PRESETS)
      for (const s of p.sections) {
        const ex = exerciseById[s.exId];
        expect(ex, s.exId).toBeDefined();
        expect(ex.mic || ex.manual).toBeFalsy();
        const opts = sectionOptions(s);
        for (const [k, v] of Object.entries(s.options)) {
          const o = ex.options?.find((x) => x.id === k);
          expect(o, `${p.id}/${s.exId}.${k}`).toBeDefined();
          expect(o!.values.some((x) => x.id === v), `${p.id}/${s.exId}.${k}=${v}`).toBe(true);
        }
        const levels = levelsOf(ex, opts);
        for (const i of s.levels) expect(i).toBeLessThan(levels.length);
        expect(sectionItems(s).length).toBeGreaterThanOrEqual(2);
      }
  });

  it('难度逐级提高：题数与时限不减', () => {
    const [a, b, c] = EXAM_PRESETS;
    expect(presetCount(a)).toBeLessThanOrEqual(presetCount(b));
    expect(presetCount(b)).toBeLessThanOrEqual(presetCount(c));
    expect(a.minutes).toBeLessThan(b.minutes);
    expect(b.minutes).toBeLessThan(c.minutes);
  });

  for (const lang of ['zh', 'en'] as const)
    it(`每套试卷都能按固定级别出题（${lang}）`, () => {
      setLocale(lang);
      for (const p of EXAM_PRESETS)
        for (let round = 0; round < 5; round++) {
          const qs = buildExam(p, { ...DEFAULT_SETTINGS, lang });
          expect(qs.length).toBe(presetCount(p));
          p.sections.forEach((s, si) => {
            const mine = qs.filter((x) => x.section === si);
            expect(mine.length).toBe(s.count);
            const pool = new Set(sectionItems(s));
            for (const { ex, q } of mine) {
              expect(ex.id).toBe(s.exId);
              expect(pool.has(q.item), `${p.id}/${s.exId} ${q.item}`).toBe(true);
              for (const it of q.stepItems ?? []) expect(pool.has(it) || it === q.answer[0]).toBe(true);
              expect(q.answer.length).toBeGreaterThan(0);
              const ids = q.choices.map((c) => c.id);
              for (const a of q.answer) expect(ids).toContain(a);
              expect(ids.length).toBeGreaterThanOrEqual(2);
              expect(q.prompt.length).toBeGreaterThan(0);
              if (lang === 'en') expect(q.prompt).not.toMatch(CJK);
              if (s.exId === 'dictation') expect(q.answer.length).toBe(Number(s.options.len));
              if (s.exId === 'progressions') expect(q.answer.length).toBe(4);
              if (s.exId === 'harmony') {
                expect(q.answer.length).toBe(Number(s.options.len));
                // 和声听写的每一步（含开头的 Ⅰ 与解决用的和弦）都在本部分的考点里
                for (const it of q.stepItems ?? []) expect(pool.has(it), `${p.id} harmony ${it}`).toBe(true);
              }
              if (q.answer.length === 1 && s.exId !== 'rhythm') expect(q.answer[0]).toBe(q.item);
            }
          });
        }
    });

  it('和声听写：考级模拟只考原位，艺考模拟加入六和弦与属七及其转位', () => {
    const harm = (id: string) => EXAM_PRESETS.find((p) => p.id === id)!.sections.find((s) => s.exId === 'harmony')!;
    const grade = sectionItems(harm('grade'));
    expect(grade.sort()).toEqual(['I', 'IV', 'V', 'ii', 'vi'].sort());
    const conserv = sectionItems(harm('conserv'));
    for (const it of ['I6', 'V6', 'V7', 'V65', 'V43', 'V42']) expect(conserv).toContain(it);
    expect(conserv).not.toContain('I64');
    expect(harm('grade').count).toBeLessThan(harm('conserv').count);
    // 艺考的和声题选项超过 9 个时，也要能用键盘作答（见 ui/keys.ts 的 CHOICE_KEYS）
    expect(conserv.length).toBeGreaterThan(9);
  });

  it('考点抽取均匀、不连续重复', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const items = ['a', 'b', 'c'];
    for (let k = 0; k < 50; k++) {
      const out = drawItems(items, 7, rnd);
      expect(out.length).toBe(7);
      for (const it of items) expect(out.filter((x) => x === it).length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
    }
    expect(drawItems(['x'], 3)).toEqual(['x', 'x', 'x']);
  });
});

describe('计分', () => {
  it('单题按步给分，未作答为错', () => {
    expect(gradeQuestion(['a'], ['a'])).toEqual({ steps: [true], score: 1 });
    expect(gradeQuestion(['a'], [null])).toEqual({ steps: [false], score: 0 });
    expect(gradeQuestion(['a', 'b', 'c', 'd'], ['a', 'x', 'c', null])).toEqual({
      steps: [true, false, true, false],
      score: 0.5,
    });
  });

  const preset = {
    ...EXAM_PRESETS[0],
    sections: [
      { ...EXAM_PRESETS[0].sections[0], count: 2, points: 60 },
      { ...EXAM_PRESETS[0].sections[1], count: 1, points: 40 },
    ],
  };
  const qs = [
    { section: 0, ex: { id: 'intervals' }, q: { item: 'P5', answer: ['P5'] } },
    { section: 0, ex: { id: 'intervals' }, q: { item: 'M3', answer: ['M3'] } },
    { section: 1, ex: { id: 'chords' }, q: { item: 'maj', answer: ['maj'] } },
  ];

  it('各部分按满分折算，总分取整', () => {
    const s = scoreExam(preset, qs, [['P5'], ['P4'], ['maj']]);
    expect(s.sections[0]).toEqual({ got: 30, max: 60, pct: 50, right: 1, n: 2 });
    expect(s.sections[1]).toEqual({ got: 40, max: 40, pct: 100, right: 1, n: 1 });
    expect(s.total).toBe(70);
    expect(scoreExam(preset, qs, [['P5'], ['M3'], ['maj']]).total).toBe(100);
    const blank = scoreExam(preset, qs, [[null], [null], [null]]);
    expect(blank.total).toBe(0);
    // 未作答不计入考点汇总（不是答错的证据）
    expect(blank.items).toEqual([]);
    expect(scoreExam(preset, qs, [['P4'], [null], [null]]).items).toEqual([{ exId: 'intervals', item: 'P5', n: 1, c: 0 }]);
  });

  it('多步题部分给分，并按步汇总考点', () => {
    const multi = [
      { section: 0, ex: { id: 'dictation' }, q: { item: 'd4', answer: ['d0', 'd2', 'd4'], stepItems: ['d0', 'd2', 'd4'] } },
      { section: 0, ex: { id: 'dictation' }, q: { item: 'd2', answer: ['d0', 'd2', 'd0'], stepItems: ['d0', 'd2', 'd0'] } },
      { section: 1, ex: { id: 'chords' }, q: { item: 'min', answer: ['min'] } },
    ];
    const s = scoreExam(preset, multi, [['d0', 'd4', 'd4'], ['d0', 'd2', 'd0'], ['maj']]);
    expect(s.sections[0].pct).toBe(83); // (2/3 + 1) / 2
    expect(s.sections[0].right).toBe(1);
    expect(s.total).toBe(50); // 60 × 0.83 + 0
    const d2 = s.items.find((x) => x.item === 'd2')!;
    expect(d2).toEqual({ exId: 'dictation', item: 'd2', n: 2, c: 1 });
    expect(s.items.find((x) => x.item === 'd0')).toMatchObject({ n: 3, c: 3 });
    const weak = weakItems(s.items);
    expect(weak.map((w) => w.item)).toEqual(['min', 'd2']);
  });

  it('专练目标：错的考点 + 误认成的考点，不足 2 个时补足', () => {
    const answers = [['P5'], ['P4'], ['maj']];
    const s = scoreExam(preset, qs, answers);
    const drills = drillTargets(preset, qs, answers, s);
    expect(drills).toHaveLength(1);
    expect(drills[0].exId).toBe('intervals');
    expect(drills[0].items).toEqual(['M3', 'P4']);
    // 只错一题、误选的不是考点（如节奏选项 r0）时用卷中的其他考点补足
    const answers2 = [['P5'], ['zz'], ['maj']];
    const d2 = drillTargets(preset, qs, answers2, scoreExam(preset, qs, answers2));
    expect(d2[0].items[0]).toBe('M3');
    expect(d2[0].items.length).toBe(2);
    expect(sectionItems(preset.sections[0])).toContain(d2[0].items[1]);
  });

  it('评级', () => {
    expect(examGrade(95)).toBe('excellent');
    expect(examGrade(90)).toBe('excellent');
    expect(examGrade(80)).toBe('good');
    expect(examGrade(60)).toBe('pass');
    expect(examGrade(59)).toBe('fail');
  });
});

describe('答题流程 reducer', () => {
  const T0 = 1_000_000;
  const run = (s: RunState, ...as: RunAction[]) => as.reduce(runReducer, s);

  it('重听次数：自动播放一次 + replays 次，用完后不能再播放', () => {
    let s = initRun([1, 1], 2, null, T0);
    expect(playsLeft(s)).toBe(3);
    s = run(s, { type: 'play' }, { type: 'play' }, { type: 'play' });
    expect(canPlay(s)).toBe(false);
    expect(run(s, { type: 'play' })).toBe(s);
    // 下一题重新计数
    s = run(s, { type: 'next', now: T0 });
    expect(s.idx).toBe(1);
    expect(playsLeft(s)).toBe(3);
    expect(s.plays).toEqual([3, 0]);
  });

  it('作答可修改；多步题自动跳到下一个空格', () => {
    let s = initRun([3], 0, null, T0);
    s = run(s, { type: 'answer', id: 'a', now: T0 });
    expect(s.cursor).toBe(1);
    s = run(s, { type: 'cursor', step: 2 }, { type: 'answer', id: 'c', now: T0 });
    expect(s.cursor).toBe(1); // 回到未答的第 2 格
    s = run(s, { type: 'answer', id: 'b', now: T0 });
    expect(s.answers[0]).toEqual(['a', 'b', 'c']);
    s = run(s, { type: 'cursor', step: 0 }, { type: 'answer', id: 'x', now: T0 });
    expect(s.answers[0]).toEqual(['x', 'b', 'c']);
    expect(s.cursor).toBe(1);
    expect(run(s, { type: 'cursor', step: 5 }).cursor).toBe(1);
  });

  it('最后一题「下一题」即交卷；交卷后忽略其他操作', () => {
    let s = initRun([1, 1], 1, null, T0);
    s = run(s, { type: 'answer', id: 'a', now: T0 }, { type: 'next', now: T0 + 1000 }, { type: 'next', now: T0 + 5000 });
    expect(s.status).toBe('done');
    expect(s.timedOut).toBe(false);
    expect(s.endedAt).toBe(T0 + 5000);
    const after = run(s, { type: 'answer', id: 'z', now: T0 }, { type: 'play' }, { type: 'tick', now: T0 + 1e9 });
    expect(after).toBe(s);
  });

  it('计时：时间到自动交卷，未答的保持空', () => {
    let s = initRun([1, 1, 1], 2, 60, T0);
    expect(secsLeft(s, T0)).toBe(60);
    expect(secsLeft(s, T0 + 30_500)).toBe(30);
    s = run(s, { type: 'answer', id: 'a', now: T0 }, { type: 'next', now: T0 + 10_000 }, { type: 'tick', now: T0 + 59_999 });
    expect(s.status).toBe('running');
    s = run(s, { type: 'tick', now: T0 + 60_000 });
    expect(s.status).toBe('done');
    expect(s.timedOut).toBe(true);
    expect(s.endedAt).toBe(T0 + 60_000);
    expect(s.answers).toEqual([['a'], [null], [null]]);
    expect(secsLeft(s, T0 + 99_000)).toBe(0);
  });

  it('截止时间之后的作答不被接受，直接按超时交卷（计时器还没收卷时按下选项）', () => {
    let s = initRun([1, 1], 0, 10, T0);
    s = run(s, { type: 'answer', id: 'a', now: T0 + 9_999 });
    expect(s.answers[0]).toEqual(['a']);
    s = run(s, { type: 'next', now: T0 + 9_999 }, { type: 'answer', id: 'b', now: T0 + 10_000 });
    expect(s.status).toBe('done');
    expect(s.timedOut).toBe(true);
    expect(s.endedAt).toBe(T0 + 10_000);
    expect(s.answers).toEqual([['a'], [null]]);
    // 不限时的考试不受影响
    const free = run(initRun([1], 0, null, T0), { type: 'answer', id: 'x', now: T0 + 1e10 });
    expect(free.answers).toEqual([['x']]);
  });

  it('时间已过时点「下一题」也按超时交卷；不限时不会超时', () => {
    const s = run(initRun([1, 1], 2, 10, T0), { type: 'next', now: T0 + 11_000 });
    expect(s.status).toBe('done');
    expect(s.timedOut).toBe(true);
    expect(s.endedAt).toBe(T0 + 10_000);
    const free = run(initRun([1], 2, null, T0), { type: 'tick', now: T0 + 1e10 });
    expect(free.status).toBe('running');
    expect(secsLeft(free, T0)).toBeNull();
  });
});

describe('历史成绩', () => {
  const rec = (at: number, score: number, preset = 'beginner'): ExamRecord => ({
    preset,
    at,
    score,
    sections: [score],
    timed: true,
    secs: 100,
  });

  it('规范化：丢弃坏条目、限制范围、按时间排序', () => {
    const out = sanitizeExams([
      rec(3, 80),
      null,
      { preset: '', at: 1, score: 1 },
      { preset: 'grade', at: 2, score: 140, sections: [120, -3, 'x'], timed: 'yes', secs: -1, timedOut: true },
      { preset: 'grade', at: 5, score: 'NaN' },
    ]);
    expect(out).toEqual([
      { preset: 'grade', at: 2, score: 100, sections: [100, 0, 0], timed: false, secs: 0, timedOut: true },
      rec(3, 80),
    ]);
    expect(sanitizeExams(undefined)).toEqual([]);
    expect(sanitizeExams({})).toEqual([]);
  });

  it('追加与上限、最好成绩', () => {
    const list: ExamRecord[] = [];
    for (let i = 0; i < EXAM_HISTORY_MAX + 5; i++) addExamRecord(list, rec(i + 1, i % 100, i % 2 ? 'grade' : 'beginner'));
    expect(list.length).toBe(EXAM_HISTORY_MAX);
    expect(list[0].at).toBe(6);
    const h = presetHistory(list, 'grade');
    expect(h.attempts.every((r) => r.preset === 'grade')).toBe(true);
    expect(h.best).toBe(99);
    expect(presetHistory(undefined, 'grade')).toEqual({ attempts: [], best: null });
  });

  it('旧数据没有 exams 字段时读取为空列表；已有记录原样保留', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
    });
    try {
      mem.set('earforge:v1', JSON.stringify({ version: 1, settings: {}, exercises: {}, daily: {} }));
      expect(loadStore().exams).toEqual([]);
      mem.set('earforge:v1', JSON.stringify({ version: 1, settings: {}, exercises: {}, daily: {}, exams: [rec(5, 70)] }));
      expect(loadStore().exams).toEqual([rec(5, 70)]);
      mem.clear();
      expect(loadStore().exams).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
