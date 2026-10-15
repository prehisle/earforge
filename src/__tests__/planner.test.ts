import { describe, expect, it } from 'vitest';
import { activeItems, type ExerciseProgress, type ItemStat, type Store } from '../engine/progress';
import { allocate, peekProgress, planSession, priority, rankItems, weakItems, type PlanEntry } from '../engine/planner';
import { DEFAULT_SETTINGS } from '../engine/types';
import { EXERCISES, exerciseById } from '../exercises';

const NOW = Date.UTC(2026, 9, 15, 12);
const HOUR = 3.6e6;

/** 可复现的伪随机数 */
function seeded(seed = 1): () => number {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

function st(acc: number, n: number, hoursAgo = 1): ItemStat {
  return { n, c: Math.round(acc * n), acc, last: NOW - hoursAgo * HOUR };
}

function prog(level: number, items: Record<string, ItemStat>, custom: string[] | null = null): ExerciseProgress {
  return { level, custom, items, options: {} };
}

function store(exercises: Record<string, ExerciseProgress> = {}): Store {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, exercises, daily: {} };
}

const count = (plan: PlanEntry[], f: (e: PlanEntry) => boolean) => plan.filter(f).length;

/** 计划中的每个考点都必须在对应模块当前启用的考点里 */
function expectUnlocked(s: Store, plan: PlanEntry[]) {
  for (const e of plan) {
    const ex = exerciseById[e.exId];
    expect(activeItems(ex, peekProgress(s, ex))).toContain(e.item);
  }
}

describe('今日训练计划', () => {
  it('新用户：从调内音级和音程识别第 1 级开始', () => {
    const s = store();
    const plan = planSession(s, EXERCISES, { size: 20, now: NOW, rng: seeded() });
    expect(plan).toHaveLength(20);
    expect(new Set(plan.map((e) => e.exId))).toEqual(new Set(['degrees', 'intervals']));
    const level0 = [...exerciseById.degrees.levels[0].items, ...exerciseById.intervals.levels[0].items];
    for (const e of plan) expect(level0).toContain(e.item);
    expect(count(plan, (e) => e.exId === 'degrees')).toBeGreaterThanOrEqual(5);
    expect(count(plan, (e) => e.exId === 'intervals')).toBeGreaterThanOrEqual(5);
    expect(s.exercises).toEqual({}); // 不写回 store
  });

  it('题数可配置', () => {
    expect(planSession(store(), EXERCISES, { size: 10, now: NOW, rng: seeded() })).toHaveLength(10);
    expect(planSession(store(), EXERCISES, { size: 3, now: NOW, rng: seeded() })).toHaveLength(3);
  });

  it('薄弱点优先：掌握度低的考点排第一、出题最多', () => {
    const s = store({
      degrees: prog(1, {
        d0: st(0.95, 20),
        d4: st(0.92, 20),
        d7: st(0.9, 20),
        d2: st(0.3, 10),
        d5: st(0.88, 12),
      }),
      intervals: prog(0, { P5: st(0.95, 20), P8: st(0.95, 20) }),
    });
    const ranked = rankItems(s, EXERCISES, NOW);
    expect(ranked[0]).toMatchObject({ exId: 'degrees', item: 'd2' });
    const plan = planSession(s, EXERCISES, { size: 20, now: NOW, rng: seeded() });
    const d2 = count(plan, (e) => e.item === 'd2');
    for (const it of ['d0', 'd4', 'd7', 'd5', 'P5', 'P8']) expect(d2).toBeGreaterThan(count(plan, (e) => e.item === it));
    // 薄弱模块分到更多题
    expect(count(plan, (e) => e.exId === 'degrees')).toBeGreaterThan(count(plan, (e) => e.exId === 'intervals'));
  });

  it('间隔重复：同样掌握度，久没练的优先；掌握越好间隔越长', () => {
    expect(priority(st(0.95, 20, 200), NOW)).toBeGreaterThan(priority(st(0.95, 20, 1), NOW));
    // 3 小时：弱项已到期，强项还没到
    const weak = st(0.5, 10, 3);
    const strong = st(0.95, 20, 3);
    expect(priority(weak, NOW)).toBeGreaterThan(priority(strong, NOW));
    expect(priority(strong, NOW)).toBeLessThan(0.3);
  });

  it('跨模块分布合理：开始过的模块都有题，没有模块独占', () => {
    const s = store({
      degrees: prog(0, { d0: st(0.6, 8), d4: st(0.7, 8), d7: st(0.8, 8) }),
      intervals: prog(1, { P5: st(0.7, 8), P8: st(0.9, 8), M3: st(0.5, 6), P4: st(0.6, 6) }),
      chords: prog(0, { maj: st(0.6, 6), min: st(0.6, 6) }),
    });
    const plan = planSession(s, EXERCISES, { size: 20, now: NOW, rng: seeded(7) });
    expect(plan).toHaveLength(20);
    for (const id of ['degrees', 'intervals', 'chords']) {
      const k = count(plan, (e) => e.exId === id);
      expect(k).toBeGreaterThanOrEqual(2);
      expect(k).toBeLessThanOrEqual(12);
    }
    // 没开始过的模块不出现
    expect(plan.every((e) => ['degrees', 'intervals', 'chords'].includes(e.exId))).toBe(true);
    // 不连续重复同一考点
    for (let i = 1; i < plan.length; i++)
      expect(plan[i].exId === plan[i - 1].exId && plan[i].item === plan[i - 1].item).toBe(false);
    expectUnlocked(s, plan);
  });

  it('不会选到未解锁的考点：尊重级别与自选考点，跳过需要麦克风的模块', () => {
    const s = store({
      // 曾到过高级别、后又降回第 1 级：d9 有记录且很弱，但当前未启用
      degrees: prog(0, { d0: st(0.9, 10), d4: st(0.9, 10), d7: st(0.9, 10), d9: st(0.1, 10) }),
      // 自选考点只有大三度、小三度
      intervals: prog(5, { P5: st(0.2, 10), M3: st(0.6, 10), m3: st(0.6, 10) }, ['M3', 'm3']),
      singing: prog(0, { d0: st(0.1, 10) }),
    });
    for (let seed = 1; seed <= 20; seed++) {
      const plan = planSession(s, EXERCISES, { size: 20, now: NOW, rng: seeded(seed) });
      expectUnlocked(s, plan);
      expect(plan.some((e) => e.item === 'd9' || e.item === 'P5')).toBe(false);
      expect(plan.some((e) => e.exId === 'singing')).toBe(false);
    }
  });

  it('只开始过一个模块时补上入门模块', () => {
    const s = store({ chords: prog(0, { maj: st(0.5, 6), min: st(0.5, 6) }) });
    const ids = new Set(planSession(s, EXERCISES, { size: 20, now: NOW, rng: seeded() }).map((e) => e.exId));
    expect(ids.has('chords')).toBe(true);
    expect(ids.has('degrees') || ids.has('intervals')).toBe(true);
  });

  it('最大余数分配：总数守恒、满足下限', () => {
    expect(allocate(20, [3, 1, 1], 2)).toEqual([10, 5, 5]);
    expect(allocate(7, [1, 1, 1], 2).reduce((a, b) => a + b)).toBe(7);
    expect(Math.min(...allocate(7, [5, 0.1, 0.1], 2))).toBe(2);
  });
});

describe('薄弱点', () => {
  it('取掌握度最低的 2~4 个考点，不修改自选设置', () => {
    const p = prog(
      2,
      {
        d0: st(0.95, 20),
        d4: st(0.3, 10),
        d7: st(0.9, 20),
        d2: st(0.5, 10),
        d5: st(0.6, 10),
        d9: st(0.7, 10),
        d11: st(0.4, 10),
      },
      ['d0', 'd4'],
    );
    const weak = weakItems(exerciseById.degrees, p);
    expect(weak).toEqual(['d4', 'd11', 'd2', 'd5']);
    expect(p.custom).toEqual(['d0', 'd4']);
  });

  it('全都掌握时也至少给出 2 个最弱的', () => {
    const p = prog(0, { d0: st(0.95, 20), d4: st(0.9, 20), d7: st(0.97, 20) });
    expect(weakItems(exerciseById.degrees, p)).toEqual(['d4', 'd0']);
  });
});
