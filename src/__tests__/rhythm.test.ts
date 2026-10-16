import { describe, expect, it } from 'vitest';
import { activeItems } from '../engine/progress';
import { DEFAULT_SETTINGS } from '../engine/types';
import { BAR, UNITS, soundKey, rhythm } from '../exercises/rhythm';

const fresh = (level: number) => ({ level, custom: null, items: {}, options: {} });
const variants = [
  { speed: 'mid', bars: '1' },
  { speed: 'slow', bars: '2' },
  { speed: 'fast', bars: '1' },
];

/** 遍历所有级别、所有考点、所有选项组合，各出若干题 */
function* questions(times = 20) {
  for (let lv = 0; lv < rhythm.levels.length; lv++) {
    const items = activeItems(rhythm, fresh(lv));
    for (const options of variants)
      for (const item of items)
        for (let k = 0; k < times; k++) yield { lv, item, options, q: rhythm.generate(item, { settings: DEFAULT_SETTINGS, items, options }) };
  }
}

const total = (r: number[]) => r.reduce((s, d) => s + Math.abs(d), 0);

describe('节奏听写', () => {
  it('每个单元时值为 1、2 或 4 拍', () => {
    for (const u of Object.values(UNITS)) expect([12, 24, 48]).toContain(total(u.durs));
  });

  it('每题小节时值总和正确', () => {
    for (const { q, options } of questions()) {
      const bars = Number(options.bars);
      for (const c of q.choices) {
        expect(c.rhythm).toBeDefined();
        expect(total(c.rhythm!)).toBe(BAR * bars);
        // 每个小节线都落在单元边界上（不出现跨小节的音）
        let t = 0;
        const bounds = new Set<number>();
        for (const d of c.rhythm!) bounds.add((t += Math.abs(d)));
        for (let b = 1; b <= bars; b++) expect(bounds.has(BAR * b)).toBe(true);
      }
    }
  });

  it('每个级别都能出题，答案在选项里，3~4 个选项', () => {
    for (const { q } of questions(5)) {
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      expect(q.choices.length).toBeLessThanOrEqual(4);
      expect(q.answer).toHaveLength(1);
      expect(q.choices.map((c) => c.id)).toContain(q.answer[0]);
    }
  });

  it('自选任意两个考点也能出至少 3 个选项', () => {
    const all = Object.keys(UNITS);
    for (const a of all)
      for (const b of all) {
        if (a === b) continue;
        for (const bars of ['1', '2']) {
          const q = rhythm.generate(a, { settings: DEFAULT_SETTINGS, items: [a, b], options: { speed: 'mid', bars } });
          expect(q.choices.length).toBeGreaterThanOrEqual(3);
          expect(new Set(q.choices.map((c) => soundKey(c.rhythm!))).size).toBe(q.choices.length);
        }
      }
  });

  it('两个带休止的单元（ere + eer）两小节也总能出至少 3 个选项', () => {
    // 回归：原题小节可能有两个休止（不满足 goodBar），曾导致干扰项全被拒、偶尔只剩 2 个选项
    for (let k = 0; k < 500; k++) {
      const q = rhythm.generate('ere', { settings: DEFAULT_SETTINGS, items: ['ere', 'eer'], options: { speed: 'mid', bars: '2' } });
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('干扰项与答案不同、彼此不重复（按听感即起音与发声长度比较）', () => {
    for (const { q } of questions()) {
      const keys = q.choices.map((c) => soundKey(c.rhythm!));
      expect(new Set(keys).size).toBe(keys.length);
      expect(new Set(q.choices.map((c) => c.id)).size).toBe(q.choices.length);
    }
  });

  it('答案包含被考的单元', () => {
    for (const { q, item } of questions(10)) {
      const ans = q.choices.find((c) => c.id === q.answer[0])!.rhythm!.join(',');
      expect(ans).toContain(UNITS[item].durs.join(','));
      expect(q.item).toBe(item);
    }
  });

  it('事件时间单调递增，敲击声与答案节奏一致', () => {
    for (const { q, options } of questions(5)) {
      for (let i = 1; i < q.events.length; i++) expect(q.events[i].time).toBeGreaterThanOrEqual(q.events[i - 1].time);
      const perc = q.events.filter((e) => e.kind === 'perc');
      for (let i = 1; i < perc.length; i++) expect(perc[i].time).toBeGreaterThan(perc[i - 1].time);
      const ans = q.choices.find((c) => c.id === q.answer[0])!.rhythm!;
      expect(perc.length).toBe(ans.filter((d) => d > 0).length);
      // 预备拍 4 下 + 每小节 4 下
      const clicks = q.events.filter((e) => e.kind === 'click');
      expect(clicks).toHaveLength(4 + 4 * Number(options.bars));
      expect(clicks[0].accent).toBe(true);
      expect(perc[0].time).toBeGreaterThanOrEqual(clicks[3].time);
    }
  });
});

describe('听感键', () => {
  it('长音与「短音 + 休止」听起来不同', () => {
    expect(soundKey([24])).not.toBe(soundKey([12, -12])); // 二分 vs 四分 + 四分休止
    expect(soundKey([12])).not.toBe(soundKey([6, -6])); // 四分 vs 八分 + 八分休止
    expect(soundKey([12, -6, -6])).toBe(soundKey([12, -12])); // 相邻休止听起来一样
  });
});
