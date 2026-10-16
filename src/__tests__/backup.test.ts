// 本地数据的迁移与备份导入：旧版本/残缺数据不报错，导入时恢复曲库记录。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISES, exerciseById } from '../exercises';
import { activeItems, canLevelUp, currentLevel, getProgress, importBackup, itemStat, loadStore, mergeSettings, sanitizeExercises, type Store } from '../engine/progress';
import { DEFAULT_SETTINGS } from '../engine/types';
import { rankItems, weakItems } from '../engine/planner';

const fresh = (): Store => ({
  version: 1,
  settings: { ...DEFAULT_SETTINGS, lang: 'en' },
  exercises: {},
  daily: {},
  songs: {},
  exams: [],
});

function withStorage(raw: string) {
  const mem = new Map([['earforge:v1', raw]]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  });
}

describe('导入备份', () => {
  it('恢复曲库记录（原来只导入进度、每日记录与考试，曲库记录丢失）', () => {
    const st = fresh();
    importBackup(st, {
      version: 1,
      settings: {},
      exercises: {},
      daily: {},
      songs: { twinkle: { best: 92, attempts: 3, practiced: 1, last: 1700000000000, lastScore: 80 } },
    });
    expect(st.songs?.twinkle).toEqual({ best: 92, attempts: 3, practiced: 1, last: 1700000000000, lastScore: 80 });
  });

  it('旧版本备份（没有曲库/考试/语言字段）：保留现有的曲库与考试记录，沿用当前语言', () => {
    const st = fresh();
    st.songs = { a: { best: 50, attempts: 1, practiced: 0, last: 1, lastScore: 50 } };
    st.exams = [{ preset: 'basic', at: 1, score: 70, sections: [70], timed: false, secs: 60 }];
    importBackup(st, { version: 1, settings: { naming: 'fixed' }, exercises: { intervals: { level: 1, custom: null, items: {}, options: {} } }, daily: {} });
    expect(st.songs.a.best).toBe(50);
    expect(st.exams).toHaveLength(1);
    expect(st.settings.lang).toBe('en');
    expect(st.settings.naming).toBe('fixed');
    expect(st.settings.tipsSeen).toEqual([]);
    expect(st.exercises.intervals.level).toBe(1);
  });

  it('格式不对时抛错', () => {
    for (const bad of [null, [], { version: 2, exercises: {} }, { version: 1 }, { version: 1, exercises: [] }])
      expect(() => importBackup(fresh(), bad)).toThrow();
  });

  it('残缺的练习进度（缺 items/options、级别不是数字）不会让出题、统计与计划报错', () => {
    const st = fresh();
    importBackup(st, {
      version: 1,
      exercises: {
        intervals: { level: 'x' },
        chords: { items: { maj: { n: 3 } }, custom: 'nope' },
        degrees: null,
      },
    });
    for (const ex of EXERCISES) {
      const p = getProgress(st, ex);
      expect(() => [currentLevel(ex, p).name, activeItems(ex, p), canLevelUp(ex, p), weakItems(ex, p)]).not.toThrow();
    }
    expect(itemStat(st.exercises.chords, 'maj')).toEqual({ n: 3, c: 0, acc: 0.5, last: 0 });
    expect(() => rankItems(st, EXERCISES)).not.toThrow();
  });
});

describe('读取本地数据', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('残缺的练习进度被补全', () => {
    withStorage(JSON.stringify({ version: 1, settings: {}, exercises: { intervals: { level: 2, items: { m3: { n: 4, c: 9, acc: 2 } } } }, daily: {} }));
    const s = loadStore();
    const p = getProgress(s, exerciseById.intervals);
    expect(p.options).toBeTruthy();
    expect(p.items.m3).toEqual({ n: 4, c: 4, acc: 1, last: 0 });
    expect(s.songs).toEqual({});
  });

  it('sanitizeExercises 保留正常的数据不变', () => {
    const p = { level: 3, custom: ['a', 'b'], items: { a: { n: 5, c: 4, acc: 0.8, last: 12 } }, options: { mode: 'minor' }, scoped: { 'mode:major': { level: 1, custom: null } } };
    expect(sanitizeExercises({ x: p })).toEqual({ x: p });
  });
});

describe('合并设置', () => {
  it('类型不对的字段回到默认值，正常字段保留', () => {
    const s = mergeSettings({ tipsSeen: null, volume: 'loud', dailyGoal: 50, lang: 'fr', autoNext: false, naming: 'fixed' });
    expect(s.tipsSeen).toEqual([]);
    expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(s.dailyGoal).toBe(50);
    expect(s.lang).toBe('zh');
    expect(s.autoNext).toBe(false);
    expect(s.naming).toBe('fixed');
  });

  it('不共享默认设置里的数组', () => {
    const s = mergeSettings(undefined);
    s.tipsSeen.push('x');
    expect(DEFAULT_SETTINGS.tipsSeen).toEqual([]);
  });
});
