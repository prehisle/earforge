import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DAILY_GOALS,
  START_LEVELS,
  applyBackground,
  startLevel,
  totalAnswered,
  type Background,
} from '../engine/onboarding';
import {
  activeItems,
  backupJson,
  getProgress,
  hasProgress,
  levelsOf,
  loadStore,
  onStorageStatus,
  saveStore,
  storageOk,
  type Store,
} from '../engine/progress';
import { DEFAULT_SETTINGS } from '../engine/types';
import { EXERCISES, exerciseById } from '../exercises';

function fresh(): Store {
  return { version: 1, settings: { ...DEFAULT_SETTINGS, onboarded: false }, exercises: {}, daily: {} };
}

const BGS: Background[] = ['beginner', 'player', 'exam'];

describe('新手引导：按基础设定起始级别', () => {
  it('零基础：所有模块从第 1 级开始，不创建多余的进度', () => {
    const s = fresh();
    applyBackground(s, 'beginner', EXERCISES);
    expect(s.exercises).toEqual({});
    expect(s.settings.dailyGoal).toBe(DAILY_GOALS.beginner);
  });

  it('学过乐器：跳过音级、和弦第 1 级与音程前 2 级', () => {
    const s = fresh();
    applyBackground(s, 'player', EXERCISES);
    expect(s.exercises.degrees.level).toBe(1);
    expect(s.exercises.chords.level).toBe(1);
    expect(s.exercises.intervals.level).toBe(2);
    expect(s.exercises.dictation).toBeUndefined();
    expect(s.settings.dailyGoal).toBe(30);
    // 启用的考点是前几级的并集：音程含 P5 P8 M3 P4 m3 M6
    expect(activeItems(exerciseById.intervals, s.exercises.intervals)).toHaveLength(6);
  });

  it('备考起点不低于学过乐器，学过乐器不低于零基础', () => {
    for (const ex of EXERCISES) {
      const [a, b, c] = BGS.map((bg) => startLevel(bg, ex));
      expect(a).toBe(0);
      expect(b).toBeGreaterThanOrEqual(a);
      expect(c).toBeGreaterThanOrEqual(b);
    }
    expect(DAILY_GOALS.exam).toBeGreaterThan(DAILY_GOALS.player);
  });

  it('起始级别不越界，且各模块至少留出一级可以升', () => {
    for (const bg of BGS)
      for (const [id, lv] of Object.entries(START_LEVELS[bg])) {
        const ex = exerciseById[id];
        expect(ex, id).toBeDefined();
        const n = levelsOf(ex, {}).length;
        expect(startLevel(bg, ex)).toBe(Math.min(lv, n - 1));
        expect(lv, id).toBeLessThan(n - 1);
      }
  });

  it('不在 store 中造假统计：只改级别，不写考点记录与每日记录', () => {
    const s = fresh();
    applyBackground(s, 'exam', EXERCISES);
    expect(Object.values(s.exercises).every((p) => Object.keys(p.items).length === 0)).toBe(true);
    expect(s.daily).toEqual({});
    expect(hasProgress(s)).toBe(false);
    expect(totalAnswered(s)).toBe(0);
  });

  it('只升不降：重新查看引导时保留已解锁的级别与练习记录', () => {
    const s = fresh();
    const p = getProgress(s, exerciseById.intervals);
    p.level = 5;
    p.items.P5 = { n: 10, c: 9, acc: 0.9, last: 1 };
    applyBackground(s, 'player', EXERCISES);
    expect(s.exercises.intervals.level).toBe(5);
    expect(s.exercises.intervals.items.P5.n).toBe(10);
    expect(s.exercises.degrees.level).toBe(1);
  });

  it('按当前 scoped 选项（调式）的级别表截断', () => {
    const s = fresh();
    const ex = exerciseById.progressions;
    getProgress(s, ex).options.mode = 'minor';
    applyBackground(s, 'exam', EXERCISES);
    const p = s.exercises.progressions;
    expect(p.level).toBe(Math.min(START_LEVELS.exam.progressions, levelsOf(ex, p.options).length - 1));
  });
});

describe('老用户识别', () => {
  it('有考点记录或每日记录即视为已有进度', () => {
    const s = fresh();
    expect(hasProgress(s)).toBe(false);
    getProgress(s, exerciseById.degrees); // 只打开过练习，没有作答
    expect(hasProgress(s)).toBe(false);
    s.exercises.degrees.items.d0 = { n: 1, c: 1, acc: 0.65, last: 1 };
    expect(hasProgress(s)).toBe(true);
    const t = fresh();
    t.daily['2026-10-01'] = { n: 3, c: 2 };
    expect(hasProgress(t)).toBe(true);
    expect(totalAnswered(t)).toBe(3);
  });

  describe('loadStore', () => {
    const mem = new Map<string, string>();
    beforeEach(() => {
      mem.clear();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('全新用户：显示引导', () => {
      expect(loadStore().settings.onboarded).toBe(false);
      expect(loadStore().settings.tipsSeen).toEqual([]);
    });

    it('旧版数据（没有 onboarded 字段）：视为老用户', () => {
      const { onboarded: _, tipsSeen: __, ...old } = DEFAULT_SETTINGS;
      mem.set('earforge:v1', JSON.stringify({ version: 1, settings: old, exercises: {}, daily: {} }));
      expect(loadStore().settings.onboarded).toBe(true);
    });

    it('标记为未完成但已有练习记录：仍视为老用户', () => {
      const s = fresh();
      s.daily['2026-10-01'] = { n: 1, c: 1 };
      mem.set('earforge:v1', JSON.stringify(s));
      expect(loadStore().settings.onboarded).toBe(true);
    });

    it('完成引导后重新加载不再显示', () => {
      const s = loadStore();
      applyBackground(s, 'player', EXERCISES);
      s.settings.onboarded = true;
      saveStore(s);
      const t = loadStore();
      expect(t.settings.onboarded).toBe(true);
      expect(t.exercises.degrees.level).toBe(1);
    });

    it('写入失败（空间已满/隐私模式）不抛错，通知订阅者，仍可从内存导出', () => {
      const s = loadStore();
      s.settings.volume = 0.42;
      const seen: boolean[] = [];
      const off = onStorageStatus((ok) => seen.push(ok));
      vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError');
        },
      });
      expect(saveStore(s)).toBe(false);
      expect(storageOk()).toBe(false);
      expect(JSON.parse(backupJson()!).settings.volume).toBe(0.42);
      vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
      expect(saveStore(s)).toBe(true);
      expect(seen).toEqual([false, true]);
      off();
    });
  });
});
