import { describe, expect, it } from 'vitest';
import {
  activeItems,
  canLevelUp,
  getProgress,
  itemGroups,
  levelsOf,
  record,
  setOption,
  type ExerciseProgress,
  type Store,
} from '../engine/progress';
import { DEFAULT_SETTINGS } from '../engine/types';
import { MODE_OPTION, bareItem, cadenceEvents, modeItem, resolutionPath } from '../exercises/common';
import { degrees, semi } from '../exercises/degrees';
import { dictation } from '../exercises/dictation';
import { modeChords, progressions } from '../exercises/progressions';
import { singing } from '../exercises/singing';
import { MODES, MODE_BY_ID, cadence, diatonicTriads, keyName, mod, nameInSystem } from '../music/theory';

const M = MODE_BY_ID;
const store = (): Store => ({ version: 1, settings: DEFAULT_SETTINGS, exercises: {}, daily: {} });

describe('调式音阶', () => {
  it('各调式的自然音级', () => {
    expect(M.major.scale).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(M.minor.scale).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(M.harmonic.scale).toEqual([0, 2, 3, 5, 7, 8, 11]);
    expect(M.dorian.scale).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect(M.mixolydian.scale).toEqual([0, 2, 4, 5, 7, 9, 10]);
  });
  it('调名按关系大调决定升降号', () => {
    expect(keyName(2, M.minor)).toBe('D'); // D 小调
    expect(keyName(10, M.minor)).toBe('B♭'); // B♭ 小调（关系大调 D♭）
    expect(keyName(8, M.minor)).toBe('G♯'); // G♯ 小调（关系大调 B）
    expect(keyName(0, M.dorian)).toBe('C'); // C 多利亚 = B♭ 大调音阶
    expect(keyName(10, M.mixolydian)).toBe('B♭');
    expect(nameInSystem(70, 2, 'letter', M.minor)).toBe('B♭'); // D 小调的 le
    expect(nameInSystem(63, 0, 'movable', M.minor)).toBe('me');
  });
});

describe('终止式', () => {
  const t = 60;
  it.each(MODES.map((m) => [m.id, m] as const))('%s：以主和弦开始和结束，所有和弦音都在音域内', (_, m) => {
    const c = cadence(t, m);
    for (const chord of [c[0], c[c.length - 1]]) {
      expect(mod(chord[0] - t, 12)).toBe(0); // 低音为主音
      expect(chord.map((n) => mod(n - t, 12))).toContain(m.scale[2]); // 调式的三音
    }
    for (const chord of c) for (const n of chord) expect(n - t).toBeGreaterThanOrEqual(-14);
    for (const chord of c) for (const n of chord) expect(n - t).toBeLessThanOrEqual(12);
    // 上方声部平稳：最高音每步不超过大三度
    for (let i = 1; i < c.length; i++) expect(Math.abs(Math.max(...c[i]) - Math.max(...c[i - 1]))).toBeLessThanOrEqual(4);
  });
  it('大调终止式保持不变', () => {
    expect(cadence(60)).toEqual([
      [48, 64, 67],
      [53, 65, 69],
      [55, 62, 67, 71],
      [48, 64, 67, 72],
    ]);
  });
  it('小调：ⅰ–ⅳ–Ⅴ–ⅰ，Ⅴ 含导音 ti，ⅳ 含 le', () => {
    for (const m of [M.minor, M.harmonic]) {
      const c = cadence(60, m).map((ch) => ch.map((n) => mod(n - 60, 12)));
      expect(c).toHaveLength(4);
      expect(c[1]).toEqual(expect.arrayContaining([5, 8]));
      expect(c[2]).toEqual(expect.arrayContaining([7, 11, 2]));
    }
  });
  it('多利亚的 Ⅳ 含 la，混合利底亚的 ♭Ⅶ 含 te', () => {
    expect(cadence(60, M.dorian)[1].map((n) => mod(n, 12))).toEqual(expect.arrayContaining([5, 9]));
    expect(cadence(60, M.mixolydian)[1].map((n) => mod(n, 12))).toEqual(expect.arrayContaining([10, 2, 5]));
  });
  it('事件时长：最后一个和弦拉长', () => {
    const ev = cadenceEvents(60, M.dorian);
    expect(ev).toHaveLength(3);
    expect(ev[2].dur).toBeGreaterThan(ev[1].dur);
  });
});

describe('解决路径按调式音阶', () => {
  it('le 在自然小调经 te、在和声小调经 ti 上行解决', () => {
    expect(resolutionPath(68, 60, M.minor)).toEqual([68, 70, 72]);
    expect(resolutionPath(68, 60, M.harmonic)).toEqual([68, 71, 72]);
    expect(resolutionPath(68, 60)).toEqual([68, 69, 71, 72]); // 大调里 le 是变化音
  });
  it('多利亚 la → te → do，混合利底亚 te → do', () => {
    expect(resolutionPath(69, 60, M.dorian)).toEqual([69, 70, 72]);
    expect(resolutionPath(70, 60, M.mixolydian)).toEqual([70, 72]);
    expect(resolutionPath(64, 60, M.mixolydian)).toEqual([64, 62, 60]);
  });
  it('每个调式每个音：路径只经过本调式音级并到达 do', () => {
    for (const m of MODES)
      for (let d = 0; d < 12; d++) {
        const path = resolutionPath(60 + d, 60, m);
        expect(path[0]).toBe(60 + d);
        expect(mod(path[path.length - 1], 12)).toBe(0);
        for (const n of path.slice(1)) expect(m.scale).toContain(mod(n - 60, 12));
      }
  });
});

describe('和弦性质与罗马数字', () => {
  const romans = (id: keyof typeof M) => diatonicTriads(M[id]).map((t) => t.roman);
  it('自然三和弦', () => {
    expect(romans('major')).toEqual(['Ⅰ', 'ⅱ', 'ⅲ', 'Ⅳ', 'Ⅴ', 'ⅵ', 'ⅶ°']);
    expect(romans('minor')).toEqual(['ⅰ', 'ⅱ°', '♭Ⅲ', 'ⅳ', 'ⅴ', '♭Ⅵ', '♭Ⅶ']);
    expect(romans('harmonic')).toEqual(['ⅰ', 'ⅱ°', '♭Ⅲ+', 'ⅳ', 'Ⅴ', '♭Ⅵ', 'ⅶ°']);
    expect(romans('dorian')).toEqual(['ⅰ', 'ⅱ', '♭Ⅲ', 'Ⅳ', 'ⅴ', 'ⅵ°', '♭Ⅶ']);
    expect(romans('mixolydian')).toEqual(['Ⅰ', 'ⅱ', 'ⅲ°', 'Ⅳ', 'ⅴ', 'ⅵ', '♭Ⅶ']);
  });
  it('自然小调的属和弦为大三和弦 Ⅴ，自然的 ⅴ 另列', () => {
    const chords = modeChords(M.minor);
    const V = chords.find((c) => c.id === 'V')!;
    expect([V.root, V.third, V.fifth]).toEqual([7, 4, 7]);
    expect(chords.find((c) => c.id === 'v')!.third).toBe(3);
    expect(chords.find((c) => c.id === 'bVII')!.name).toBe('下主和弦');
  });
  it('和弦音都在调式音阶内（自然小调的 Ⅴ 除外）', () => {
    for (const m of MODES)
      for (const c of modeChords(m)) {
        if (m.id === 'minor' && c.id === 'V') continue;
        for (const i of [0, c.third, c.fifth]) expect(m.scale).toContain(mod(c.root + i, 12));
      }
  });
});

describe('练习在各调式下出题', () => {
  const tonal = [degrees, progressions, dictation, singing];

  it('都有默认为大调的 mode 选项，且大调考点 id 与旧版一致', () => {
    for (const ex of tonal) {
      const o = ex.options!.find((x) => x.id === 'mode')!;
      expect(o.default).toBe('major');
      expect(o.values.map((v) => v.id)).toEqual(MODES.map((m) => m.id));
      expect(levelsOf(ex, { mode: 'major' })).toEqual(ex.levels);
    }
    expect(degrees.levels.map((l) => l.items)).toEqual([
      ['d0', 'd4', 'd7'],
      ['d2', 'd5'],
      ['d9', 'd11'],
      ['d3', 'd10'],
      ['d6', 'd8', 'd1'],
    ]);
    expect(progressions.levels.flatMap((l) => l.items)).toEqual(['I', 'IV', 'V', 'vi', 'ii', 'iii', 'vii']);
    expect(dictation.levels[3].name).toBe('+ 变化音 ♭3 ♭7 ♯4');
    expect(singing.levels.map((l) => l.name)).toEqual(['do · mi · sol', '+ re · fa', '+ la · ti']);
  });

  it('音级类练习：前几级恰为调式的自然音级，变化音级别补齐其余半音', () => {
    for (const m of MODES) {
      const lv = levelsOf(degrees, { mode: m.id });
      const diatonic = lv.slice(0, 3).flatMap((l) => l.items.map(semi));
      expect([...diatonic].sort((a, b) => a - b)).toEqual(m.scale);
      expect(lv.flatMap((l) => l.items.map(semi)).sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
      for (const ex of [dictation, singing]) {
        const l2 = levelsOf(ex, { mode: m.id });
        expect(l2.slice(0, 3).flatMap((l) => l.items.map(semi)).sort((a, b) => a - b)).toEqual(m.scale);
      }
      expect(lv[0].items).toEqual([0, 2, 4].map((k) => modeItem(m, `d${m.scale[k]}`)));
    }
    expect(levelsOf(degrees, { mode: 'minor' })[0].name).toBe('do · me · sol');
    expect(levelsOf(progressions, { mode: 'minor' })[0].name).toBe('ⅰ · ⅳ · Ⅴ');
    expect(levelsOf(progressions, { mode: 'mixolydian' })[0].name).toBe('Ⅰ · Ⅳ · ♭Ⅶ');
  });

  it('每个练习、每个调式、每个级别、每种选项组合都能出题，答案都在选项里', () => {
    for (const ex of tonal) {
      const defaults = Object.fromEntries(ex.options!.map((o) => [o.id, o.default]));
      for (const m of MODES) {
        const base = { ...defaults, mode: m.id };
        const others = ex.options!.filter((o) => o.id !== 'mode');
        const variants = [base, ...others.flatMap((o) => o.values.map((v) => ({ ...base, [o.id]: v.id })))];
        const levels = levelsOf(ex, base);
        const known = new Set(levels.flatMap((l) => l.items));
        levels.forEach((_, lv) => {
          const p: ExerciseProgress = { level: lv, custom: null, items: {}, options: base };
          const items = activeItems(ex, p);
          for (const options of variants)
            for (const item of items)
              for (let k = 0; k < 3; k++) {
                const q = ex.generate(item, { settings: DEFAULT_SETTINGS, items, options });
                expect(q.events.length).toBeGreaterThan(0);
                expect(q.answer.length).toBeGreaterThan(0);
                expect(q.prompt).toContain(m.label);
                // 前奏是本调式的终止式（首和弦低音比主音低一个八度）
                expect(q.prelude).toEqual(cadenceEvents(q.prelude![0].notes[0] + 12, m));
                for (const a of q.answer) expect(known.has(a)).toBe(true);
                if (q.sing) continue;
                const ids = q.choices.map((c) => c.id);
                for (const a of q.answer) expect(ids).toContain(a);
                // 选项只来自当前调式的考点
                for (const id of ids) expect(known.has(id)).toBe(true);
              }
        });
      }
    }
    // 穷举所有组合，较慢；并行跑全部测试时默认 5 秒不够
  }, 20000);

  it('非变化音级别里出现的音都属于该调式', () => {
    for (const ex of [degrees, dictation, singing])
      for (const m of MODES) {
        const items = activeItems(ex, { level: 2, custom: null, items: {}, options: { mode: m.id } });
        const q = ex.generate(items[items.length - 1], {
          settings: DEFAULT_SETTINGS,
          items,
          options: { ...Object.fromEntries(ex.options!.map((o) => [o.id, o.default])), mode: m.id, len: '5' },
        });
        for (const a of q.answer) expect(m.scale).toContain(semi(a));
        for (const c of q.choices) expect(m.scale).toContain(semi(c.id));
      }
  });

  it('题目文案显示调式', () => {
    const s = { ...DEFAULT_SETTINGS, keyMode: 'C' as const };
    const q = degrees.generate('minor:d3', { settings: s, items: ['minor:d0', 'minor:d3'], options: { mode: 'minor' } });
    expect(q.prompt.startsWith('C 小调 · ')).toBe(true);
    const q2 = progressions.generate('dorian:IV', {
      settings: s,
      items: ['dorian:i', 'dorian:IV'],
      options: { mode: 'dorian', len: '1' },
    });
    expect(q2.prompt.startsWith('C 多利亚 · ')).toBe(true);
    expect(q2.choices.map((c) => c.label)).toEqual(['ⅰ', 'Ⅳ']);
  });
});

describe('切换调式时的进度', () => {
  it('各调式分别记录级别与自选考点，考点 id 互不冲突', () => {
    const s = store();
    const p = getProgress(s, degrees);
    expect(p.options.mode).toBe('major');
    p.level = 3;
    for (let i = 0; i < 6; i++) record(s, p, 'd4', true);
    setOption(degrees, p, 'mode', 'minor');
    expect(p.level).toBe(0);
    expect(activeItems(degrees, p)).toEqual(['minor:d0', 'minor:d3', 'minor:d7']);
    expect(canLevelUp(degrees, p)).toBe(false); // 大调的掌握度不影响小调
    p.custom = ['minor:d0', 'minor:d8'];
    setOption(degrees, p, 'mode', 'major');
    expect(p.level).toBe(3);
    expect(p.custom).toBeNull();
    setOption(degrees, p, 'mode', 'minor');
    expect(p.custom).toEqual(['minor:d0', 'minor:d8']);
    expect(p.items.d4.n).toBe(6);
    expect(bareItem('minor:d8')).toBe('d8');
  });

  it('旧数据：无 mode 选项按大调；级别越界、异己考点被修正；视唱旧的 mode=sight 被重置', () => {
    const s = store();
    s.exercises.degrees = { level: 99, custom: ['d0', 'dorian:d9'], items: {}, options: { octave: 'one' } };
    s.exercises.singing = { level: 1, custom: null, items: {}, options: { mode: 'echo', len: '3' } };
    s.exercises.progressions = { level: 0, custom: ['minor:i', 'x'], items: {}, options: { mode: 'phrygian' } };
    const d = getProgress(s, degrees);
    expect(d.options.mode).toBe('major');
    expect(d.level).toBe(4);
    expect(d.custom).toEqual(['d0']);
    const g = getProgress(s, singing);
    expect(g.options).toEqual({ mode: 'major', task: 'sight', len: '3' });
    expect(activeItems(singing, g)).toEqual(['d0', 'd4', 'd7', 'd2', 'd5']);
    const pr = getProgress(s, progressions);
    expect(pr.options.mode).toBe('major');
    expect(pr.custom).toBeNull();
  });

  it('统计按调式分组，大调组与旧版考点一致', () => {
    const groups = itemGroups(degrees);
    expect(groups.map((g) => g.label)).toEqual(MODE_OPTION.values.map((v) => v.label));
    expect(groups[0].items.sort()).toEqual(degrees.levels.flatMap((l) => l.items).sort());
    expect(itemGroups(singing)).toHaveLength(MODES.length);
  });
});
