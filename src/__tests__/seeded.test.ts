import { describe, expect, it } from 'vitest';
import { levelsOf } from '../engine/progress';
import { mulberry32, newSeed, questionSeed, SEEDED_GEN_SETTINGS, seededSource, withSeed } from '../engine/seeded';
import { planSet, SET_EXERCISES } from '../engine/setRunner';
import { DEFAULT_SETTINGS, type ExerciseDef, type Question, type Settings } from '../engine/types';
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

/** 与显示无关的题目内容：去掉选项名称、题干等随唱名体系 / 语言变化的文字 */
function content(q: Question) {
  return {
    item: q.item,
    prelude: q.prelude,
    events: q.events,
    resolution: q.resolution,
    choices: q.choices.map((c) => [c.id, c.rhythm, c.group]),
    answer: q.answer,
    stepItems: q.stepItems,
    tap: q.tap,
    sing: q.sing && { targets: q.sing.targets, showDisplay: q.sing.showDisplay },
    score: q.score,
    notate: q.notate,
  };
}

describe('固定题目：不同用户设置下题目相同', () => {
  // 两个设置尽量不同的用户（调、音区、唱名、记谱、音色……）
  const userA: Settings = { ...DEFAULT_SETTINGS, keyMode: 'random', voice: 'low' };
  const userB: Settings = {
    ...DEFAULT_SETTINGS,
    keyMode: 'C',
    voice: 'high',
    naming: 'fixed',
    notation: 'staff',
    timbre: 'random',
    autoNext: false,
    midi: true,
    volume: 0.3,
  };
  const genWith = (user: Settings, normalize: boolean, ex: ExerciseDef, item: string, items: string[], options: Record<string, string>, seed: number) => {
    const settings = normalize ? { ...user, ...SEEDED_GEN_SETTINGS } : user;
    return content(withSeed(seed, () => ex.generate(item, { settings, items, options })));
  };

  for (const ex of SET_EXERCISES)
    it(ex.id, () => {
      for (const options of optionSets(ex)) {
        const items = [...new Set(levelsOf(ex, options).flatMap((l) => l.items))];
        for (const [i, item] of items.entries()) {
          const seed = questionSeed(77, i);
          expect(genWith(userB, true, ex, item, items, options, seed), `${ex.id} ${item} ${JSON.stringify(options)}`).toEqual(
            genWith(userA, true, ex, item, items, options, seed),
          );
        }
      }
    });

  it('不统一设置时，固定 C 调的用户会拿到不同的题（说明统一是必要的）', () => {
    const ex = SET_EXERCISES.find((x) => x.id === 'degrees')!;
    const options = Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default]));
    const items = levelsOf(ex, options)[0].items;
    const differ = items.filter(
      (item, i) =>
        JSON.stringify(genWith(userA, false, ex, item, items, options, questionSeed(77, i))) !==
        JSON.stringify(genWith(userB, false, ex, item, items, options, questionSeed(77, i))),
    );
    expect(differ.length).toBeGreaterThan(0);
  });
});

describe('固定题目：跨版本稳定', () => {
  // 分享链接里只有 seed，没有「题库版本」：练习的级别 / 考点 / generate 或出题顺序（planSet）一改，
  // 同一个固定题目链接就会悄悄出不同的题。这个指纹把当前的出题结果钉住——测试失败说明固定题目变了：
  // 若是有意的改动，在 CHANGELOG 里注明「旧的固定题目链接题目会变化」，再更新这里的指纹。
  it('同一 seed 的出题指纹不变', () => {
    const fnv = (s: string) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
      return h.toString(16).padStart(8, '0');
    };
    const settings = { ...DEFAULT_SETTINGS, ...SEEDED_GEN_SETTINGS };
    const out: Record<string, string> = {};
    for (const ex of SET_EXERCISES) {
      const options = Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default]));
      const items = levelsOf(ex, options)[0].items;
      const qs = items.map((item, i) => content(withSeed(questionSeed(20261016, i), () => ex.generate(item, { settings, items, options }))));
      out[ex.id] = fnv(JSON.stringify(qs));
    }
    // 出题顺序
    const set = {
      id: 'x',
      name: '',
      created: 1,
      count: 30,
      parts: [
        { ex: 'intervals', items: ['m3', 'M3', 'P5'], options: {} },
        { ex: 'chords', items: ['maj', 'min'], options: {}, weight: 2 },
      ],
    };
    out.plan = fnv(JSON.stringify(planSet(set, mulberry32(20261016))));
    expect(out).toMatchInlineSnapshot(`
      {
        "chords": "ca51f7f3",
        "degrees": "72ed7b5c",
        "dictation": "f7e17488",
        "harmony": "8a3c5401",
        "intervals": "802f8034",
        "inversions": "da8ba142",
        "plan": "56254f35",
        "progressions": "75f60a18",
        "rhythm": "97855478",
        "rhythmDictation": "cbde7c78",
        "scales": "0bc327a8",
      }
    `);
  });
});
