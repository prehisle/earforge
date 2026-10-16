import { describe, expect, it } from 'vitest';
import { activeItems, type Store } from '../engine/progress';
import { planModules, planSession } from '../engine/planner';
import { DEFAULT_SETTINGS } from '../engine/types';
import { EXERCISES } from '../exercises';
import { BAR, UNITS } from '../exercises/rhythm';
import { judgeTaps, onsetsOf, rhythmTap, tapTolerance } from '../exercises/rhythmTap';

const fresh = (level: number) => ({ level, custom: null, items: {}, options: {} });
const total = (r: number[]) => r.reduce((s, d) => s + Math.abs(d), 0);

/** 可复现的抖动 */
function jitter(seed: number, amp: number): () => number {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x / 2147483647 - 0.5) * 2 * amp;
  };
}

describe('节奏模仿：容差', () => {
  it('八分音符的 35%，限制在 60~150ms', () => {
    expect(tapTolerance(80)).toBeCloseTo(0.13125);
    expect(tapTolerance(40)).toBe(0.15);
    expect(tapTolerance(200)).toBe(0.06);
  });

  it('起音只算发声的音，休止跳过', () => {
    expect(onsetsOf([12, -12, 6, 6, 12], 60)).toEqual([0, 2, 2.5, 3]);
  });
});

describe('节奏模仿：判定', () => {
  // 四分 · 八分八分 · 附点四分八分（♩=80）
  const bpm = 80;
  const t = onsetsOf([12, 6, 6, 18, 6], bpm);

  it('完美', () => {
    const j = judgeTaps(t, t, bpm);
    expect(j.pass).toBe(true);
    expect(j.extras).toHaveLength(0);
    expect(j.notes.every((n) => n.kind === 'ok')).toBe(true);
    expect(j.meanAbs).toBeCloseTo(0);
    expect(j.offset).toBeCloseTo(0);
  });

  it('小幅随机抖动仍算通过', () => {
    const r = jitter(7, 0.03);
    const j = judgeTaps(t, t.map((x) => x + r()), bpm);
    expect(j.pass).toBe(true);
  });

  it('整体偏晚 / 偏早一点：校准后通过，并报告偏移', () => {
    const late = judgeTaps(t, t.map((x) => x + 0.08), bpm);
    expect(late.pass).toBe(true);
    expect(late.offset).toBeCloseTo(0.08);
    expect(late.notes.every((n) => n.kind === 'ok')).toBe(true);
    const early = judgeTaps(t, t.map((x) => x - 0.07), bpm);
    expect(early.pass).toBe(true);
    expect(early.offset).toBeCloseTo(-0.07);
  });

  it('整体偏移超出容差：不通过', () => {
    const j = judgeTaps(t, t.map((x) => x + 0.2), bpm);
    expect(j.pass).toBe(false);
    expect(Math.abs(j.offset)).toBeGreaterThan(j.tol);
  });

  it('某个音偏太多：漏打 + 多打，不通过', () => {
    const taps = [...t];
    taps[2] += 0.22;
    const j = judgeTaps(t, taps, bpm);
    expect(j.pass).toBe(false);
    expect(j.notes[2].kind).toBe('miss');
    expect(j.extras).toHaveLength(1);
    expect(j.notes.filter((n) => n.kind !== 'miss')).toHaveLength(t.length - 1);
    expect(Math.abs(j.offset)).toBeLessThan(0.01); // 其余音的中位偏移不受影响
  });

  it('漏打 + 偏太多 + 多打混在一起：不为多配上一个音而整体错位', () => {
    // 四分休止 · 八分 + 两个十六分 · 二分（♩=80）
    const s = onsetsOf([-12, 6, 3, 3, 24], bpm);
    const taps = [s[0], s[2] + 0.2, s[3], s[3] + 0.25]; // 漏第 2 个，第 3 个晚 200ms，末尾多打
    taps.sort((a, b) => a - b);
    const j = judgeTaps(s, taps, bpm);
    expect(j.pass).toBe(false);
    expect(Math.abs(j.offset)).toBeLessThan(0.02);
    expect(j.notes[0].kind).toBe('ok');
  });

  it('某个音偏一些但在容差内：算打中，标为偏早 / 偏晚', () => {
    const taps = [...t];
    taps[1] -= 0.1;
    taps[3] += 0.1;
    const j = judgeTaps(t, taps, bpm);
    expect(j.pass).toBe(true);
    expect(j.notes[1].kind).toBe('early');
    expect(j.notes[3].kind).toBe('late');
  });

  it('漏打', () => {
    const j = judgeTaps(t, t.filter((_, i) => i !== 3), bpm);
    expect(j.pass).toBe(false);
    expect(j.notes[3].kind).toBe('miss');
    expect(j.notes.filter((n) => n.kind === 'miss')).toHaveLength(1);
    expect(j.extras).toHaveLength(0);
  });

  it('多打', () => {
    const j = judgeTaps(t, [...t, t[3] + 0.375].sort((a, b) => a - b), bpm);
    expect(j.pass).toBe(false);
    expect(j.notes.every((n) => n.kind !== 'miss')).toBe(true);
    expect(j.extras).toHaveLength(1);
    expect(j.extras[0]).toBeCloseTo(t[3] + 0.375);
  });

  it('什么都没打', () => {
    const j = judgeTaps(t, [], bpm);
    expect(j.pass).toBe(false);
    expect(j.meanAbs).toBeNull();
    expect(j.notes.every((n) => n.kind === 'miss')).toBe(true);
  });

  it('十六分音符（♩=100，间隔 150ms，窗口重叠）：抖动 + 偏移仍能正确配对', () => {
    const fast = 100;
    const s = onsetsOf([3, 3, 3, 3, 6, 3, 3, 3, 3, 6, 12], fast);
    const r = jitter(3, 0.035);
    const j = judgeTaps(s, s.map((x) => x + 0.04 + r()), fast);
    expect(j.pass).toBe(true);
    j.notes.forEach((n, i) => expect(n.tap! - s[i]).toBeLessThan(0.1));
  });

  it('十六分音符少打一个：只漏一个，其余配对不错位', () => {
    const fast = 100;
    const s = onsetsOf([3, 3, 3, 3, 12, 24], fast);
    const j = judgeTaps(s, s.filter((_, i) => i !== 1), fast);
    expect(j.pass).toBe(false);
    expect(j.notes.map((n) => n.kind)).toEqual(['ok', 'miss', 'ok', 'ok', 'ok', 'ok']);
  });

  it('三连音：打成两个八分不通过，打准通过', () => {
    const tr = onsetsOf([4, 4, 4, 12, 24], bpm);
    expect(judgeTaps(tr, tr.map((x) => x + 0.01), bpm).pass).toBe(true);
    const asEighths = onsetsOf([6, 6, 12, 24], bpm);
    const j = judgeTaps(tr, asEighths, bpm);
    expect(j.pass).toBe(false);
  });

  it('只有一个音（全音符）', () => {
    const w = onsetsOf([48], 60);
    expect(judgeTaps(w, [0.05], 60).pass).toBe(true);
    expect(judgeTaps(w, [0.05, 2], 60).pass).toBe(false);
  });
});

describe('节奏模仿：出题', () => {
  const variants = [
    { mode: 'read', speed: 'mid', bars: '1' },
    { mode: 'listen', speed: 'slow', bars: '2' },
    { mode: 'read', speed: 'fast', bars: '2' },
  ];

  it('每个级别、每个考点都能出题，时值与模式正确', () => {
    for (let lv = 0; lv < rhythmTap.levels.length; lv++) {
      const items = activeItems(rhythmTap, fresh(lv));
      for (const options of variants)
        for (const item of items)
          for (let k = 0; k < 10; k++) {
            const q = rhythmTap.generate(item, { settings: DEFAULT_SETTINGS, items, options });
            expect(q.tap).toBeDefined();
            const tap = q.tap!;
            expect(total(tap.durs)).toBe(BAR * Number(options.bars));
            expect(tap.showNotation).toBe(options.mode === 'read');
            expect(tap.countIn).toBe(4);
            expect(q.answer).toHaveLength(1);
            expect(onsetsOf(tap.durs, tap.bpm).length).toBeGreaterThanOrEqual(1);
            // 包含考点单元的时值片段
            const seq = tap.durs.join(',');
            expect(`,${seq},`).toContain(`,${UNITS[item].durs.join(',')},`);
            expect(q.events.some((e) => e.kind === 'perc')).toBe(true);
          }
    }
  });

  it('已注册在节奏听写之后，今日训练不会选入', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(ids.indexOf('rhythmTap')).toBe(ids.indexOf('rhythm') + 1);
    const stat = { n: 10, c: 5, acc: 0.5, last: Date.now() };
    const store: Store = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      exercises: { rhythmTap: { level: 0, custom: null, items: { q: stat, h: stat }, options: {} } },
      daily: {},
    };
    expect(planModules(store, EXERCISES).map((e) => e.id)).not.toContain('rhythmTap');
    expect(planSession(store, EXERCISES).some((e) => e.exId === 'rhythmTap')).toBe(false);
  });
});
