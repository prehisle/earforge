// 自定义练习组合：规范化、出题顺序（分布与可复现）、存储读取 / 导入备份、内置模板。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISES, exerciseById } from '../exercises';
import { importBackup, parseStore, type Store } from '../engine/progress';
import type { PracticeSet } from '../engine/practiceSet';
import { deleteSet, duplicateSet, putSet, saveSet } from '../engine/sets';
import {
  allocateCounts,
  canUseInSet,
  fullOptions,
  minItems,
  normalizeSet,
  planSet,
  sanitizeSets,
  setSource,
  SET_EXERCISES,
} from '../engine/setRunner';
import { SET_TEMPLATES, templateSet } from '../engine/setTemplates';
import { DEFAULT_SETTINGS } from '../engine/types';

/** 可复现的伪随机数（mulberry32） */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base = (): PracticeSet => ({
  id: 'a',
  name: '测试',
  count: 20,
  created: 1700000000000,
  parts: [
    { ex: 'intervals', items: ['P5', 'P8', 'M3'], options: { dir: 'mix' } },
    { ex: 'chords', items: ['maj', 'min'], options: {}, weight: 2 },
  ],
});

const fresh = (): Store => ({ version: 1, settings: { ...DEFAULT_SETTINGS }, exercises: {}, daily: {}, songs: {}, exams: [], sets: [] });

afterEach(() => vi.unstubAllGlobals());

describe('normalizeSet', () => {
  it('合法的组合原样保留', () => {
    expect(normalizeSet(base())).toEqual(base());
  });

  it('丢弃未知练习、需要麦克风或手动输入的练习、重复的练习', () => {
    const s = normalizeSet({
      ...base(),
      parts: [
        { ex: 'nope', items: ['x'], options: {} },
        { ex: 'singing', items: ['d0', 'd4'], options: {} },
        { ex: 'rhythmTap', items: ['q', 'h'], options: {} },
        { ex: 'intervals', items: ['P5', 'P8'], options: {} },
        { ex: 'intervals', items: ['M3', 'P4'], options: {} },
      ],
    });
    expect(s?.parts).toEqual([{ ex: 'intervals', items: ['P5', 'P8'], options: {} }]);
  });

  it('丢弃不存在的考点（含当前调式下没有的）、未知选项与取值；考点去重', () => {
    const s = normalizeSet({
      ...base(),
      parts: [
        { ex: 'intervals', items: ['P5', 'P5', 'X9', 3, 'P8'], options: { dir: 'sideways', bogus: 'y' } },
        // 大调下没有小调的考点
        { ex: 'degrees', items: ['d0', 'minor:d3', 'd4'], options: { mode: 'major', octave: 'wide' } },
      ],
    });
    expect(s?.parts[0]).toEqual({ ex: 'intervals', items: ['P5', 'P8'], options: {} });
    expect(s?.parts[1].options).toEqual({ mode: 'major', octave: 'wide' });
    expect(s?.parts[1].items).not.toContain('minor:d3');
  });

  it('小调的考点在小调选项下保留', () => {
    const ex = exerciseById.degrees;
    const minor = fullOptions(ex, { mode: 'minor' });
    const items = (ex.levelsFor?.(minor) ?? ex.levels)[0].items;
    const s = normalizeSet({ ...base(), parts: [{ ex: 'degrees', items, options: { mode: 'minor' } }] });
    expect(s?.parts[0].items).toEqual(items);
  });

  it('考点全被丢弃的练习去掉；没有可用练习时返回 null', () => {
    expect(normalizeSet({ ...base(), parts: [{ ex: 'intervals', items: ['zzz'], options: {} }] })).toBeNull();
    expect(normalizeSet({ ...base(), parts: [] })).toBeNull();
    expect(normalizeSet({ ...base(), parts: 'x' })).toBeNull();
    expect(normalizeSet(null)).toBeNull();
    expect(normalizeSet('set')).toBeNull();
    const s = normalizeSet({ ...base(), parts: [{ ex: 'intervals', items: [], options: {} }, base().parts[1]] });
    expect(s?.parts.map((p) => p.ex)).toEqual(['chords']);
  });

  it('题数限定 5–100（取整，缺省 20），权重 1–3（1 时省略）', () => {
    expect(normalizeSet({ ...base(), count: 1 })?.count).toBe(5);
    expect(normalizeSet({ ...base(), count: 1e6 })?.count).toBe(100);
    expect(normalizeSet({ ...base(), count: 12.6 })?.count).toBe(13);
    expect(normalizeSet({ ...base(), count: 'x' })?.count).toBe(20);
    expect(normalizeSet({ ...base(), count: NaN })?.count).toBe(20);
    const w = (weight: unknown) => normalizeSet({ ...base(), parts: [{ ...base().parts[0], weight }] })?.parts[0].weight;
    expect(w(9)).toBe(3);
    expect(w(0)).toBeUndefined();
    expect(w(1)).toBeUndefined();
    expect(w('2')).toBeUndefined();
    expect(w(2)).toBe(2);
  });

  it('名称去空白并限长；缺少 id 与创建时间（分享来的）时新生成；seed 只接受 32 位无符号整数', () => {
    const s = normalizeSet({ name: `  ${'长'.repeat(80)}  `, parts: base().parts, count: 10 });
    expect(s?.name).toHaveLength(40);
    expect(s?.id).toMatch(/^s/);
    expect(s?.created).toBeGreaterThan(0);
    expect(normalizeSet({ ...base(), name: 5 })?.name).toBe('');
    expect(normalizeSet({ ...base(), seed: 42 })?.seed).toBe(42);
    expect(normalizeSet({ ...base(), seed: -1 })?.seed).toBeUndefined();
    expect(normalizeSet({ ...base(), seed: 1.5 })?.seed).toBeUndefined();
    expect(normalizeSet({ ...base(), seed: 2 ** 32 })?.seed).toBeUndefined();
  });

  it('能放进组合的练习：与今日训练相同（不含麦克风 / 手动输入）', () => {
    expect(SET_EXERCISES.map((e) => e.id)).not.toContain('singing');
    expect(SET_EXERCISES.map((e) => e.id)).not.toContain('rhythmTap');
    expect(SET_EXERCISES.length).toBe(EXERCISES.filter((e) => !e.mic && !e.manual).length);
    expect(SET_EXERCISES.every(canUseInSet)).toBe(true);
  });
});

describe('出题', () => {
  it('按权重分配题数，每部分至少 1 题', () => {
    expect(allocateCounts(20, [1, 2])).toEqual([7, 13]);
    expect(allocateCounts(5, [1, 1, 3])).toEqual([1, 1, 3]);
    expect(allocateCounts(5, [1, 1, 1, 1, 3])).toEqual([1, 1, 1, 1, 1]);
    expect(allocateCounts(12, [1, 1, 3])).toEqual([3, 2, 7]);
    expect(allocateCounts(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateCounts(2, [1, 1, 1]).reduce((a, b) => a + b)).toBe(2);
    expect(allocateCounts(5, [])).toEqual([]);
  });

  it('题源：题数正确，hasNext / shown 正确，每题的考点属于该部分，选项补全默认值', () => {
    const set = base();
    const src = setSource(set, seeded(1));
    expect(src.total).toBe(20);
    const draws = [];
    while (src.hasNext()) draws.push(src.next()!);
    expect(src.next()).toBeNull();
    expect(src.shown).toBe(20);
    expect(draws).toHaveLength(20);
    const iv = draws.filter((d) => d.ex.id === 'intervals');
    const ch = draws.filter((d) => d.ex.id === 'chords');
    expect(iv).toHaveLength(7);
    expect(ch).toHaveLength(13);
    expect(iv.every((d) => set.parts[0].items.includes(d.item) && d.items === set.parts[0].items)).toBe(true);
    expect(ch[0].options).toEqual({ voicing: 'both', inv: 'root' });
    expect(iv[0].options).toEqual({ dir: 'mix' });
    // 部分内考点均匀轮换
    const counts = new Map<string, number>();
    for (const d of iv) counts.set(d.item, (counts.get(d.item) ?? 0) + 1);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
  });

  it('同一个 rng 序列出题顺序完全相同；不同种子顺序不同', () => {
    const order = (seed: number) => planSet(base(), seeded(seed)).map((e) => `${e.part}:${e.item}`);
    expect(order(7)).toEqual(order(7));
    expect(order(7)).not.toEqual(order(8));
    const a = setSource(base(), seeded(3));
    const b = setSource(base(), seeded(3));
    for (let i = 0; i < 20; i++) expect(a.next()?.item).toBe(b.next()?.item);
  });

  it('同一考点尽量不相邻', () => {
    for (let seed = 0; seed < 50; seed++) {
      const plan = planSet({ ...base(), count: 30 }, seeded(seed));
      for (let i = 1; i < plan.length; i++) expect(`${plan[i].part}:${plan[i].item}`).not.toBe(`${plan[i - 1].part}:${plan[i - 1].item}`);
    }
  });

  it('多次随机的总体分布接近权重', () => {
    const rng = seeded(99);
    let a = 0;
    let n = 0;
    for (let k = 0; k < 50; k++)
      for (const e of planSet({ ...base(), count: 9 }, rng)) {
        n++;
        if (e.part === 0) a++;
      }
    expect(a / n).toBeCloseTo(1 / 3, 1);
  });

  it('每题都能生成（各练习的考点与选项都被认得）', () => {
    for (const tpl of SET_TEMPLATES) {
      const set = normalizeSet({ ...templateSet(tpl, tpl.id), id: 'x', created: 1 })!;
      const src = setSource(set, seeded(5));
      for (let d = src.next(); d; d = src.next()) {
        const q = d.ex.generate(d.item, { settings: DEFAULT_SETTINGS, items: d.items, options: d.options });
        expect(q.answer.length).toBeGreaterThan(0);
      }
    }
  });

  it('选项就是考点的练习至少要选 2 个考点，节奏等 1 个也可以', () => {
    expect(minItems(exerciseById.intervals, {}, DEFAULT_SETTINGS)).toBe(2);
    expect(minItems(exerciseById.chords, {}, DEFAULT_SETTINGS)).toBe(2);
    expect(minItems(exerciseById.rhythm, {}, DEFAULT_SETTINGS)).toBe(1);
    expect(minItems(exerciseById.rhythmDictation, {}, DEFAULT_SETTINGS)).toBe(1);
  });
});

describe('内置模板', () => {
  it('3–5 个，规范化后不丢任何练习与考点', () => {
    expect(SET_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(SET_TEMPLATES.length).toBeLessThanOrEqual(5);
    for (const tpl of SET_TEMPLATES) {
      const draft = templateSet(tpl, 'n');
      const set = normalizeSet({ ...draft, id: 'x', created: 1 });
      expect(set, tpl.id).not.toBeNull();
      expect(set!.parts.map((p) => p.ex)).toEqual(tpl.parts.map((p) => p.ex));
      for (const [i, p] of set!.parts.entries()) {
        expect(p.items, `${tpl.id}/${p.ex}`).toEqual(draft.parts[i].items);
        expect(p.options).toEqual(tpl.parts[i].options);
        expect(p.items.length).toBeGreaterThanOrEqual(minItems(exerciseById[p.ex], p.options, DEFAULT_SETTINGS));
      }
      expect(set!.count).toBe(tpl.count);
    }
  });
});

describe('存储', () => {
  it('读取：旧数据没有 sets 时为空数组；无效的组合与重复 id 丢弃', () => {
    expect(parseStore(JSON.stringify({ version: 1, settings: {}, exercises: {}, daily: {} })).sets).toEqual([]);
    const s = parseStore(
      JSON.stringify({ version: 1, settings: {}, exercises: {}, daily: {}, sets: [base(), { ...base(), name: 'dup' }, { id: 'b', parts: [] }, 5] }),
    );
    expect(s.sets).toEqual([base()]);
    expect(parseStore(JSON.stringify({ version: 1, settings: {}, exercises: {}, daily: {}, sets: 'x' })).sets).toEqual([]);
  });

  it('sanitizeSets：最多保留 100 个', () => {
    const many = Array.from({ length: 130 }, (_, i) => ({ ...base(), id: `id${i}` }));
    const out = sanitizeSets(many);
    expect(out).toHaveLength(100);
    expect(out[0].id).toBe('id0');
    expect(sanitizeSets({})).toEqual([]);
  });

  it('全新用户的存储有空的 sets', () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    expect(parseStore(null).sets).toEqual([]);
  });

  it('导入备份：有 sets 时整体替换（并规范化），旧备份没有 sets 时保留现有的', () => {
    const st = fresh();
    st.sets = [base()];
    importBackup(st, { version: 1, settings: {}, exercises: {}, daily: {} });
    expect(st.sets).toEqual([base()]);
    importBackup(st, { version: 1, settings: {}, exercises: {}, daily: {}, sets: [{ ...base(), id: 'c', count: 999 }, { junk: 1 }] });
    expect(st.sets.map((s) => [s.id, s.count])).toEqual([['c', 100]]);
  });

  it('保存：新建追加、同 id 覆盖、无效不改；复制与删除', () => {
    const st = fresh();
    const a = putSet(st, { name: '甲', parts: base().parts, count: 10 })!;
    expect(a.id).toBeTruthy();
    expect(st.sets).toHaveLength(1);
    putSet(st, { ...a, name: '乙' });
    expect(st.sets).toHaveLength(1);
    expect(st.sets![0].name).toBe('乙');
    expect(st.sets![0].created).toBe(a.created);
    expect(putSet(st, { name: 'x', parts: [], count: 10 })).toBeNull();
    expect(st.sets).toHaveLength(1);
    const copy = duplicateSet(st, a.id, '乙（副本）')!;
    expect(copy.id).not.toBe(a.id);
    expect(st.sets!.map((s) => s.name)).toEqual(['乙', '乙（副本）']);
    deleteSet(st, a.id);
    expect(st.sets!.map((s) => s.id)).toEqual([copy.id]);
  });

  it('saveSet 通过 update 保存并返回带 id 的组合（分享链接导入用）', () => {
    let st = fresh();
    const update = (fn: (s: Store) => void) => {
      const next = structuredClone(st);
      fn(next);
      st = next;
    };
    const saved = saveSet(update, { name: '分享来的', parts: base().parts, count: 30, seed: 7 });
    expect(saved?.id).toBeTruthy();
    expect(st.sets).toEqual([saved]);
    expect(saved?.seed).toBe(7);
  });
});
