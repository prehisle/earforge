import { describe, expect, it } from 'vitest';
import { levelsOf } from '../engine/progress';
import { mulberry32, newSeed, questionSeed, seededSource, withSeed } from '../engine/seeded';
import { DEFAULT_SETTINGS, type ExerciseDef, type Question } from '../engine/types';
import { EXERCISES } from '../exercises';

/** 可比较的题目投影（去掉函数） */
function project(q: Question) {
  return {
    item: q.item,
    prelude: q.prelude,
    events: q.events,
    resolution: q.resolution,
    choices: q.choices.map((c) => [c.id, c.label, c.sub, c.rhythm, c.group]),
    answer: q.answer,
    stepItems: q.stepItems,
    prompt: q.prompt,
    explain: q.explain,
    sing: q.sing,
    tap: q.tap,
    score: q.score,
    notate: q.notate,
  };
}

/** 每个练习：默认选项，再逐个把一个选项换成其他取值 */
function optionSets(ex: ExerciseDef): Record<string, string>[] {
  const base = Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default]));
  const out = [base];
  for (const o of ex.options ?? []) for (const v of o.values) if (v.id !== o.default) out.push({ ...base, [o.id]: v.id });
  return out;
}

function gen(ex: ExerciseDef, item: string, items: string[], options: Record<string, string>, seed: number) {
  return project(withSeed(seed, () => ex.generate(item, { settings: DEFAULT_SETTINGS, items, options })));
}

describe('withSeed', () => {
  it('结束后恢复 Math.random，抛异常时也恢复', () => {
    const orig = Math.random;
    expect(withSeed(1, () => Math.random())).toBe(withSeed(1, () => Math.random()));
    expect(Math.random).toBe(orig);
    expect(() =>
      withSeed(2, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(Math.random).toBe(orig);
  });

  it('可嵌套：内层结束后外层序列继续', () => {
    const plain = withSeed(5, () => [Math.random(), Math.random()]);
    const nested = withSeed(5, () => {
      const a = Math.random();
      const inner = withSeed(9, () => Math.random());
      return [a, Math.random(), inner];
    });
    expect(nested.slice(0, 2)).toEqual(plain);
    expect(nested[2]).toBe(withSeed(9, () => Math.random()));
  });

  it('mulberry32 在 [0,1) 内且分布大致均匀', () => {
    const r = mulberry32(42);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      bins[Math.floor(x * 10)]++;
    }
    for (const b of bins) expect(b).toBeGreaterThan(850);
  });
});

describe('questionSeed / seededSource', () => {
  it('第 k 题的 seed 只取决于组合 seed 与题号', () => {
    const a = Array.from({ length: 50 }, (_, k) => questionSeed(123, k));
    const b = [...Array.from({ length: 50 }, (_, k) => k)].reverse().map((k) => questionSeed(123, k)).reverse();
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(50);
    expect(questionSeed(124, 0)).not.toBe(questionSeed(123, 0));
    for (const s of a) expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
  });

  it('seededSource 按顺序给每题加 seed，与作答无关', () => {
    let n = 0;
    const src = seededSource({ next: () => (n < 3 ? { i: n++ } : null), hasNext: () => n < 3 }, 7);
    expect(src.hasNext?.()).toBe(true);
    const got = [src.next(), src.next(), src.next(), src.next()];
    expect(got.slice(0, 3).map((d) => d?.seed)).toEqual([0, 1, 2].map((k) => questionSeed(7, k)));
    expect(got.map((d) => d?.i)).toEqual([0, 1, 2, undefined]);
    expect(src.hasNext?.()).toBe(false);
  });

  it('newSeed 是 1…2³²−1 的整数', () => {
    for (let i = 0; i < 20; i++) {
      const s = newSeed();
      expect(Number.isInteger(s) && s >= 1 && s <= 0xffffffff).toBe(true);
    }
  });
});

describe('固定题目：每个练习同一 seed 出同一题', () => {
  for (const ex of EXERCISES)
    it(ex.id, () => {
      let differ = 0;
      let total = 0;
      for (const options of optionSets(ex)) {
        const items = [...new Set(levelsOf(ex, options).flatMap((l) => l.items))];
        for (const [i, item] of items.entries()) {
          const seed = questionSeed(2024, i);
          const a = gen(ex, item, items, options, seed);
          // 中间插入一次无种子的生成，确认没有跨题的隐藏状态
          ex.generate(item, { settings: DEFAULT_SETTINGS, items, options });
          const b = gen(ex, item, items, options, seed);
          expect(b, `${ex.id} ${item} ${JSON.stringify(options)}`).toEqual(a);
          total++;
          if (JSON.stringify(gen(ex, item, items, options, seed ^ 0x5bd1e995)) !== JSON.stringify(a)) differ++;
        }
      }
      // 不同 seed 通常出不同的题（个别考点本身只有一种题，如固定的单音节奏）
      expect(differ / total).toBeGreaterThan(0.5);
    });
});
