import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStore, record, sanitizeDaily, today, type Store } from '../engine/progress';
import { DEFAULT_SETTINGS } from '../engine/types';
import {
  addDays,
  bestStreak,
  bucketWeeks,
  dateOf,
  dayList,
  diffDays,
  heatLevel,
  heatmapGrid,
  keyOf,
  niceMax,
  periodDelta,
  practiceDays,
  rangeStart,
  sumRange,
  tickIndices,
  trendSeries,
  weekStartOf,
  weekday,
  type Daily,
} from '../engine/trends';

// 测试运行在 Node 中：修改 TZ 会立即影响 Date 的本地时间
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const ORIG_TZ = env.TZ;
afterEach(() => {
  env.TZ = ORIG_TZ;
  vi.useRealTimers();
});

describe('日期运算', () => {
  it('跨月、跨年、闰年', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2025-12-25', '2026-01-05')).toBe(11);
    expect(dayList('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it.each(['America/New_York', 'Europe/Berlin', 'Australia/Sydney', 'America/Santiago', 'Asia/Shanghai'])(
    '夏令时切换不影响日期键（%s）',
    (tz) => {
      env.TZ = tz;
      // 美国 3/8、11/1，欧洲 3/29、10/25，南半球 4/5、10/4 前后
      for (const k of ['2026-03-08', '2026-03-29', '2026-04-05', '2026-10-04', '2026-10-25', '2026-11-01']) {
        expect(keyOf(dateOf(k))).toBe(k);
        expect(addDays(k, 1)).toBe(keyOf(new Date(dateOf(k).getFullYear(), dateOf(k).getMonth(), dateOf(k).getDate() + 1, 12)));
        expect(diffDays(addDays(k, -3), addDays(k, 3))).toBe(6);
      }
    },
  );

  it('today() 用本地日期：UTC 已是次日时仍取本地当天', () => {
    env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T03:00:00Z')); // 洛杉矶 10/15 20:00
    expect(today()).toBe('2026-10-15');
    env.TZ = 'Asia/Shanghai';
    vi.setSystemTime(new Date('2026-10-15T17:00:00Z')); // 上海 10/16 01:00
    expect(today()).toBe('2026-10-16');
  });

  it('星期与周起始', () => {
    expect(weekday('2026-10-15')).toBe(4); // 周四
    expect(weekday('1969-12-28')).toBe(0); // 纪元之前也正确
    expect(weekStartOf('2026-10-15', 1)).toBe('2026-10-12');
    expect(weekStartOf('2026-10-15', 0)).toBe('2026-10-11');
    expect(weekStartOf('2026-10-11', 1)).toBe('2026-10-05'); // 周日属于上一周（周一起）
    expect(weekStartOf('2026-10-11', 0)).toBe('2026-10-11');
    expect(weekStartOf('2026-03-01', 1)).toBe('2026-02-23'); // 跨月
  });
});

describe('序列与滑动平均', () => {
  const daily: Daily = {
    '2026-09-28': { n: 10, c: 5 },
    '2026-09-30': { n: 10, c: 10 },
    '2026-10-01': { n: 2, c: 0 },
    '2026-10-03': { n: 20, c: 18 },
  };

  it('空白天为 null，题量少的天标记 low，滑动窗口按题数加权并使用范围前的数据', () => {
    const s = trendSeries(daily, '2026-09-30', '2026-10-04');
    expect(s.map((p) => p.key)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(s[0].acc).toBe(1);
    expect(s[0].roll).toBeCloseTo(15 / 20); // 含 09-28
    expect(s[1].low).toBe(true);
    expect(s[1].acc).toBe(0);
    expect(s[2].acc).toBeNull();
    expect(s[2].roll).toBeCloseTo(15 / 22);
    expect(s[4].roll).toBeCloseTo(33 / 42);
    // 10-05 起 09-28 移出窗口
    expect(trendSeries(daily, '2026-10-05', '2026-10-05')[0].roll).toBeCloseTo(28 / 32);
  });

  it('可指定滑动窗口天数（28 日窗口包含更早的数据）', () => {
    const d: Daily = { '2026-09-10': { n: 20, c: 0 }, '2026-10-01': { n: 20, c: 20 } };
    expect(trendSeries(d, '2026-10-01', '2026-10-01')[0].roll).toBe(1);
    expect(trendSeries(d, '2026-10-01', '2026-10-01', undefined, 28)[0].roll).toBeCloseTo(0.5);
  });

  it('滑动窗口题量不足时为 null（不画成 0%）', () => {
    const s = trendSeries({ '2026-10-01': { n: 3, c: 0 } }, '2026-10-01', '2026-10-02');
    expect(s.every((p) => p.roll === null)).toBe(true);
  });

  it('分练习：旧数据（无 ex）视为未知，不计入', () => {
    const d: Daily = {
      '2026-10-01': { n: 30, c: 20 },
      '2026-10-02': { n: 12, c: 9, ex: { intervals: [10, 8], chords: [2, 1] } },
    };
    const s = trendSeries(d, '2026-10-01', '2026-10-02', 'intervals');
    expect(s[0].unknown).toBe(true);
    expect(s[0].n).toBe(0);
    expect(s[1]).toMatchObject({ n: 10, c: 8, unknown: false, roll: 0.8 });
    expect(sumRange(d, '2026-10-01', '2026-10-02', 'chords')).toEqual({ n: 2, c: 1 });
    expect(sumRange(d, '2026-10-01', '2026-10-02')).toEqual({ n: 42, c: 29 });
  });

  it('按周汇总：周一起与周日起，首尾不完整的周', () => {
    const rows = dayList('2026-10-01', '2026-10-13').map((key) => ({ key, n: 1, c: 1 }));
    const mon = bucketWeeks(rows, 1);
    expect(mon.map((b) => [b.key, b.end, b.n])).toEqual([
      ['2026-10-01', '2026-10-04', 4],
      ['2026-10-05', '2026-10-11', 7],
      ['2026-10-12', '2026-10-13', 2],
    ]);
    const sun = bucketWeeks(rows, 0);
    expect(sun.map((b) => [b.key, b.end])).toEqual([
      ['2026-10-01', '2026-10-03'],
      ['2026-10-04', '2026-10-10'],
      ['2026-10-11', '2026-10-13'],
    ]);
  });
});

describe('环比与汇总', () => {
  it('最近 N 天对比之前 N 天', () => {
    const d: Daily = {};
    for (const k of dayList('2026-09-16', '2026-09-30')) d[k] = { n: 10, c: 6 };
    for (const k of dayList('2026-10-01', '2026-10-15')) d[k] = { n: 10, c: 8 };
    const r = periodDelta(d, '2026-10-15', 15);
    expect(r.cur).toBeCloseTo(0.8);
    expect(r.prev).toBeCloseTo(0.6);
    expect(r.delta).toBeCloseTo(0.2);
  });

  it('上一周期题量不足则没有环比', () => {
    const d: Daily = { '2026-10-10': { n: 30, c: 27 }, '2026-09-01': { n: 3, c: 3 } };
    const r = periodDelta(d, '2026-10-15', 30);
    expect(r.cur).toBeCloseTo(0.9);
    expect(r.prev).toBeNull();
    expect(r.delta).toBeNull();
  });

  it('最长连续天数与练习天数（跨月、有空档）', () => {
    const d: Daily = {
      '2026-01-30': { n: 1, c: 1 },
      '2026-01-31': { n: 1, c: 1 },
      '2026-02-01': { n: 1, c: 1 },
      '2026-02-03': { n: 1, c: 0 },
      '2026-02-04': { n: 0, c: 0 },
    };
    expect(bestStreak(d)).toBe(3);
    expect(practiceDays(d)).toBe(4);
    expect(bestStreak({})).toBe(0);
  });

  it('范围起点：全部至少 30 天', () => {
    expect(rangeStart('30', {}, '2026-10-15')).toBe('2026-09-16');
    expect(rangeStart('all', {}, '2026-10-15')).toBe('2026-09-16');
    expect(rangeStart('all', { '2025-01-02': { n: 1, c: 1 } }, '2026-10-15')).toBe('2025-01-02');
  });
});

describe('日历热力图', () => {
  it('网格从周起始日开始，最后一列含今天，之后的格子标为 future', () => {
    const g = heatmapGrid({ '2026-10-14': { n: 40, c: 30 } }, '2026-10-15', 26, 1, 20);
    expect(g.weeks).toHaveLength(26);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(weekday(g.weeks[0][0].key)).toBe(1);
    const last = g.weeks[25];
    expect(last[0].key).toBe('2026-10-12');
    expect(last[2]).toMatchObject({ key: '2026-10-14', n: 40, level: 4 });
    expect(last[3].future).toBe(false);
    expect(last[4].future).toBe(true);
    const sun = heatmapGrid({}, '2026-10-15', 4, 0, 20);
    expect(sun.weeks[3][0].key).toBe('2026-10-11');
  });

  it('月份标签落在含 1 日的列，过近的首个标签被去掉', () => {
    const g = heatmapGrid({}, '2026-10-15', 26, 1, 20);
    for (const m of g.months.slice(1)) expect(g.weeks[m.col].some((c) => c.key === m.key && c.key.endsWith('-01'))).toBe(true);
    expect(g.months.map((m) => m.key.slice(5, 7))).toContain('10');
    for (let i = 1; i < g.months.length; i++) expect(g.months[i].col - g.months[i - 1].col).toBeGreaterThanOrEqual(3);
  });

  it('颜色等级按每日目标划分', () => {
    expect([0, 1, 9, 10, 19, 20, 39, 40].map((n) => heatLevel(n, 20))).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(heatLevel(1, 0)).toBe(3);
  });
});

describe('坐标工具', () => {
  it('刻度与整上限', () => {
    expect(tickIndices(30, 4)).toEqual([0, 10, 19, 29]);
    expect(tickIndices(1, 4)).toEqual([0]);
    expect(tickIndices(3, 5)).toEqual([0, 1, 2]);
    expect([0, 7, 10, 11, 37, 120].map(niceMax)).toEqual([10, 10, 10, 20, 50, 200]);
  });
});

describe('按练习的每日记录', () => {
  it('record 按练习 id 记入 daily.ex', () => {
    const s: Store = { version: 1, settings: { ...DEFAULT_SETTINGS }, exercises: {}, daily: {} };
    const p = (s.exercises.intervals = { level: 0, custom: null, items: {}, options: {} });
    const q = (s.exercises.chords = { level: 0, custom: null, items: {}, options: {} });
    record(s, p, 'P5', true);
    record(s, p, 'P5', false);
    record(s, q, 'maj', true);
    const d = s.daily[today()];
    expect(d).toEqual({ n: 3, c: 2, ex: { intervals: [2, 1], chords: [1, 1] } });
  });

  it('sanitizeDaily 保留旧格式、丢弃坏数据', () => {
    const d = sanitizeDaily({
      '2026-10-01': { n: 5, c: 4 },
      '2026-10-02': { n: 3, c: 9, ex: { a: [3, 2], b: 'x', c: [0, 0], d: [2, 5] } },
      bad: { n: 1, c: 1 },
      '2026-10-03': null,
      '2026-10-04': { n: -1, c: 'x' },
    });
    expect(d).toEqual({
      '2026-10-01': { n: 5, c: 4 },
      '2026-10-02': { n: 3, c: 3, ex: { a: [3, 2], d: [2, 2] } },
      '2026-10-04': { n: 0, c: 0 },
    });
    expect(sanitizeDaily(undefined)).toEqual({});
  });

  it('loadStore 读取旧格式数据不报错', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
    mem.set('earforge:v1', JSON.stringify({ version: 1, settings: {}, exercises: {}, daily: { '2026-10-01': { n: 4, c: 3 } } }));
    expect(loadStore().daily).toEqual({ '2026-10-01': { n: 4, c: 3 } });
    vi.unstubAllGlobals();
  });
});
