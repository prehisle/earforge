// 本地存储的健壮性：设置枚举校验、多标签页同时练习不丢记录。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeSettings, SETTING_ENUMS } from '../engine/progress';
import { SAMPLED_TIMBRES, SYNTH_TIMBRES, TIMBRE_SETTINGS } from '../audio/timbres';
import { DEFAULT_SETTINGS, type Settings } from '../engine/types';
import { exerciseById } from '../exercises';

type ProgressModule = typeof import('../engine/progress');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('设置校验', () => {
  it('未知的枚举取值回到默认值', () => {
    const s = mergeSettings({
      lang: 'fr',
      naming: 'solfege',
      timbre: 'harpsichord',
      keyMode: 'G',
      voice: 'mid',
      notation: 'tab',
    });
    for (const k of Object.keys(SETTING_ENUMS) as (keyof typeof SETTING_ENUMS)[]) expect(s[k]).toBe(DEFAULT_SETTINGS[k]);
  });

  it('合法的枚举取值保留', () => {
    const raw: Partial<Settings> = { lang: 'en', naming: 'letter', timbre: 'sampled', keyMode: 'C', voice: 'high', notation: 'staff' };
    expect(mergeSettings(raw)).toMatchObject(raw);
  });

  it('音色：旧版保存的取值照常读取，新增的乐器与随机模式都合法', () => {
    for (const timbre of ['piano', 'epiano', 'sine', 'sampled'] as const) expect(mergeSettings({ timbre }).timbre).toBe(timbre);
    for (const timbre of TIMBRE_SETTINGS) expect(mergeSettings({ timbre }).timbre).toBe(timbre);
    expect(SETTING_ENUMS.timbre).toEqual(expect.arrayContaining([...SYNTH_TIMBRES, ...SAMPLED_TIMBRES, 'random']));
    expect(mergeSettings({ timbre: 'banjo' as never }).timbre).toBe(DEFAULT_SETTINGS.timbre);
  });

  it('回退到 base（导入备份时 base 带当前语言）', () => {
    expect(mergeSettings({ lang: 'de' }, { ...DEFAULT_SETTINGS, lang: 'en' }).lang).toBe('en');
  });

  it('数值越界回到默认值', () => {
    const s = mergeSettings({ volume: 7, dailyGoal: -3, mixSize: 1e9 });
    expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(s.dailyGoal).toBe(DEFAULT_SETTINGS.dailyGoal);
    expect(s.mixSize).toBe(DEFAULT_SETTINGS.mixSize);
    expect(mergeSettings({ volume: 0.3, dailyGoal: 50, mixSize: 40 })).toMatchObject({ volume: 0.3, dailyGoal: 50, mixSize: 40 });
  });

  it('loadStore 读取被改坏的设置也回到默认值', async () => {
    const raw = JSON.stringify({ version: 1, settings: { naming: 42, timbre: 'kazoo', notation: null }, exercises: {}, daily: {} });
    vi.stubGlobal('localStorage', { getItem: () => raw, setItem: () => {} });
    const { loadStore } = await import('../engine/progress');
    const s = loadStore().settings;
    expect([s.naming, s.timbre, s.notation]).toEqual([DEFAULT_SETTINGS.naming, DEFAULT_SETTINGS.timbre, DEFAULT_SETTINGS.notation]);
  });
});

describe('多标签页', () => {
  /** 两个标签页共用一份 localStorage，各自有独立的模块状态（相当于两个页面） */
  async function twoTabs(): Promise<[ProgressModule, ProgressModule, Map<string, string>]> {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
    const a = await import('../engine/progress');
    vi.resetModules();
    const b = await import('../engine/progress');
    expect(a).not.toBe(b);
    return [a, b, mem];
  }

  const answer = (m: ProgressModule, item: string, correct: boolean) => (s: import('../engine/progress').Store) =>
    m.record(s, m.getProgress(s, exerciseById.intervals), item, correct);

  it('交替作答：两边的每日题数与考点统计都累加，不互相覆盖', async () => {
    const [A, B] = await twoTabs();
    let a = A.loadStore();
    let b = B.loadStore();
    a = A.updateStore(a, answer(A, 'M3', true));
    a = A.updateStore(a, answer(A, 'M3', true));
    // B 打开时还没看到 A 的作答（内存是旧的），修改前会先读到 A 写入的数据
    b = B.updateStore(b, answer(B, 'M3', false));
    b = B.updateStore(b, answer(B, 'P5', true));
    a = A.updateStore(a, answer(A, 'P5', true));
    const final = A.parseStore(localStorage.getItem(A.STORE_KEY));
    const day = final.daily[A.today()];
    expect(day.n).toBe(5);
    expect(day.c).toBe(4);
    expect(day.ex?.intervals).toEqual([5, 4]);
    expect(final.exercises.intervals.items.M3).toMatchObject({ n: 3, c: 2 });
    expect(final.exercises.intervals.items.P5).toMatchObject({ n: 2, c: 2 });
    expect(a).toEqual(final);
  });

  it('refreshStore：自己写入的不算变化，其他标签页写入后返回最新数据', async () => {
    const [A, B] = await twoTabs();
    let a = A.loadStore();
    const b = B.loadStore();
    expect(A.refreshStore()).toBeNull();
    a = A.updateStore(a, (s) => void (s.settings.naming = 'fixed'));
    expect(A.refreshStore()).toBeNull();
    const seen = B.refreshStore();
    expect(seen?.settings.naming).toBe('fixed');
    expect(B.refreshStore()).toBeNull();
    expect(b.settings.naming).toBe(DEFAULT_SETTINGS.naming);
    expect(a.settings.naming).toBe('fixed');
  });

  it('其他标签页改设置不会被本标签页之后的作答改回去', async () => {
    const [A, B] = await twoTabs();
    const a = A.loadStore();
    let b = B.loadStore();
    A.updateStore(a, (s) => void (s.settings.lang = 'en'));
    b = B.updateStore(b, answer(B, 'M3', true));
    expect(b.settings.lang).toBe('en');
    expect(A.parseStore(localStorage.getItem(A.STORE_KEY)).settings.lang).toBe('en');
  });

  it('写入失败（空间已满）时保留内存中的数据，不被旧数据替换', async () => {
    const [A] = await twoTabs();
    let a = A.loadStore();
    a = A.updateStore(a, answer(A, 'M3', true));
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    a = A.updateStore(a, answer(A, 'M3', true));
    expect(a.exercises.intervals.items.M3.n).toBe(2);
    expect(A.storageOk()).toBe(false);
  });
});
