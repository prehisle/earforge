import { describe, expect, it } from 'vitest';
import { detectPitch } from '../audio/pitch';
import { activeItems, canLevelUp, pickItem, record, type ExerciseProgress, type Store } from '../engine/progress';
import { DEFAULT_SETTINGS } from '../engine/types';
import { resolutionPath } from '../exercises/common';
import { makeMelody } from '../exercises/dictation';
import { EXERCISES, exerciseById } from '../exercises';
import { nameInSystem } from '../music/theory';

function tone(freq: number, sr = 44100, n = 2048, harmonics = 1): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++)
    for (let h = 1; h <= harmonics; h++) buf[i] += (0.5 / h) * Math.sin((2 * Math.PI * freq * h * i) / sr);
  return buf;
}

describe('音高检测', () => {
  it.each([110, 196, 261.63, 440, 880])('识别 %f Hz 正弦波', (f) => {
    const r = detectPitch(tone(f), 44100)!;
    expect(r).not.toBeNull();
    expect(Math.abs(1200 * Math.log2(r.freq / f))).toBeLessThan(5); // 误差 < 5 音分
  });
  it('有泛音的人声式波形不误判为八度', () => {
    const r = detectPitch(tone(220, 44100, 2048, 6), 44100)!;
    expect(Math.round(r.midi)).toBe(57); // A3
  });
  it('静音返回 null', () => {
    expect(detectPitch(new Float32Array(2048), 44100)).toBeNull();
  });
});

describe('乐理', () => {
  it('唱名体系', () => {
    expect(nameInSystem(67, 7, 'movable')).toBe('do'); // G 调的 G
    expect(nameInSystem(71, 7, 'jianpu')).toBe('3');
    expect(nameInSystem(67, 7, 'fixed')).toBe('sol');
    expect(nameInSystem(70, 5, 'letter')).toBe('B♭'); // F 调用降号
  });
  it('解决路径：ti 上行、fa 下行', () => {
    expect(resolutionPath(71, 60)).toEqual([71, 72]);
    expect(resolutionPath(65, 60)).toEqual([65, 64, 62, 60]);
    expect(resolutionPath(66, 60)).toEqual([66, 67, 69, 71, 72]); // fi → sol la ti do
    expect(resolutionPath(63, 60)).toEqual([63, 62, 60]); // me → re do
  });
  it('旋律以 do 开头、长度正确、包含考点', () => {
    for (let k = 0; k < 200; k++) {
      const m = makeMelody([0, 2, 4, 5, 7], 5, 4);
      expect(m).toHaveLength(4);
      expect(m[0]).toBe(0);
      expect(m).toContain(5);
    }
  });
});

describe('自适应引擎', () => {
  const fresh = (): ExerciseProgress => ({ level: 0, custom: null, items: {}, options: {} });
  const store = (): Store => ({ version: 1, settings: DEFAULT_SETTINGS, exercises: {}, daily: {} });

  it('薄弱考点被抽中的概率更高', () => {
    const p = fresh();
    const s = store();
    for (let i = 0; i < 10; i++) {
      record(s, p, 'P5', true);
      record(s, p, 'P8', false);
    }
    let weak = 0;
    for (let i = 0; i < 2000; i++) if (pickItem(p, ['P5', 'P8']) === 'P8') weak++;
    expect(weak / 2000).toBeGreaterThan(0.75);
  });

  it('全部掌握后才能升级', () => {
    const ex = exerciseById.intervals;
    const p = fresh();
    const s = store();
    expect(canLevelUp(ex, p)).toBe(false);
    for (let i = 0; i < 8; i++) record(s, p, 'P5', true);
    expect(canLevelUp(ex, p)).toBe(false);
    for (let i = 0; i < 8; i++) record(s, p, 'P8', true);
    expect(canLevelUp(ex, p)).toBe(true);
    p.level = 1;
    expect(activeItems(ex, p)).toEqual(['P5', 'P8', 'M3', 'P4']);
  });

  it('每个练习每个级别都能正常出题', () => {
    for (const ex of EXERCISES) {
      const opts = Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default]));
      const variants = [opts, ...(ex.options ?? []).flatMap((o) => o.values.map((v) => ({ ...opts, [o.id]: v.id })))];
      ex.levels.forEach((_, lv) => {
        const items = activeItems(ex, { ...fresh(), level: lv });
        for (const options of variants)
          for (const item of items) {
            const q = ex.generate(item, { settings: DEFAULT_SETTINGS, items, options });
            expect(q.events.length).toBeGreaterThan(0);
            expect(q.answer.length).toBeGreaterThan(0);
            if (!q.sing && !q.tap && !q.notate) for (const a of q.answer) expect(q.choices.map((c) => c.id)).toContain(a);
          }
      });
    }
  });
});
