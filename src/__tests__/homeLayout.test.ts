import { describe, expect, it } from 'vitest';
import { CORE_IDS, EXTRA_CORE, SONGS_ID, UNLOCK_TIERS, coreIds, homeLayout, practiced } from '../engine/homeLayout';
import { START_LEVELS, applyBackground, type Background } from '../engine/onboarding';
import { mergeSettings, parseStore, type Store } from '../engine/progress';
import { DEFAULT_SETTINGS } from '../engine/types';
import { EXERCISES, exerciseById } from '../exercises';

/** 首页全部卡片（与 Home.tsx 一致：按分组排列，视唱曲库排在视唱组末尾） */
const GROUPS = ['tonal', 'basics', 'sing'] as const;
const IDS = GROUPS.flatMap((g) => [...EXERCISES.filter((e) => e.group === g).map((e) => e.id), ...(g === 'sing' ? [SONGS_ID] : [])]);

function fresh(): Store {
  return { version: 1, settings: { ...DEFAULT_SETTINGS, onboarded: false }, exercises: {}, daily: {}, songs: {} };
}

/** 在某练习上记 n 道作答（同时计入每日题数） */
function answer(s: Store, id: string, n: number, day = '2026-10-01') {
  const p = (s.exercises[id] ??= { level: 0, custom: null, items: {}, options: {} });
  const st = (p.items.x ??= { n: 0, c: 0, acc: 0.5, last: 0 });
  st.n += n;
  st.c += n;
  const d = (s.daily[day] ??= { n: 0, c: 0 });
  d.n += n;
  d.c += n;
}

const BGS: Background[] = ['beginner', 'player', 'exam'];

describe('首页可见性：新用户', () => {
  it('没选背景：只突出调内音级、音程识别、和弦性质，其余全部收进「更多练习」', () => {
    const l = homeLayout(fresh(), IDS);
    expect(l.front).toEqual(['degrees', 'intervals', 'chords'].sort((a, b) => IDS.indexOf(a) - IDS.indexOf(b)));
    expect(l.more.length).toBe(IDS.length - 3);
    expect([...l.front, ...l.more].sort()).toEqual([...IDS].sort());
  });

  it('按引导所选背景追加 0～1 个入门练习，总数 3～4 个', () => {
    for (const bg of BGS) {
      const s = fresh();
      applyBackground(s, bg, EXERCISES);
      expect(s.settings.background).toBe(bg);
      const l = homeLayout(s, IDS);
      expect(l.front.length).toBeGreaterThanOrEqual(3);
      expect(l.front.length).toBeLessThanOrEqual(4);
      expect(new Set(l.front)).toEqual(new Set([...CORE_IDS, ...EXTRA_CORE[bg]]));
    }
  });

  it('入门练习都是真实的模块；追加的模块在该背景下调高了起点', () => {
    for (const id of CORE_IDS) expect(exerciseById[id]).toBeDefined();
    for (const bg of BGS)
      for (const id of EXTRA_CORE[bg]) {
        expect(exerciseById[id]).toBeDefined();
        expect(START_LEVELS[bg][id]).toBeGreaterThan(0);
      }
  });

  it('解锁批次覆盖除入门练习外的全部卡片，且不重复', () => {
    const tiered = UNLOCK_TIERS.flatMap((t) => t.ids);
    expect(new Set(tiered).size).toBe(tiered.length);
    expect(new Set([...CORE_IDS, ...tiered])).toEqual(new Set(IDS));
    for (let i = 1; i < UNLOCK_TIERS.length; i++) expect(UNLOCK_TIERS[i].at).toBeGreaterThan(UNLOCK_TIERS[i - 1].at);
  });

  it('提示下一批：还差几题、会移到前面的是哪些', () => {
    const s = fresh();
    answer(s, 'degrees', 12);
    const l = homeLayout(s, IDS);
    expect(l.next).toEqual({ left: UNLOCK_TIERS[0].at - 12, ids: UNLOCK_TIERS[0].ids });
  });

  it('选了「学过乐器」：下一批提示里不再列出已在前面的级数和弦', () => {
    const s = fresh();
    applyBackground(s, 'player', EXERCISES);
    const l = homeLayout(s, IDS);
    expect(l.front).toContain('progressions');
    expect(l.next?.ids).not.toContain('progressions');
  });
});

describe('首页可见性：随进度解锁', () => {
  it('练过的练习（哪怕只答一题）移到前面', () => {
    const s = fresh();
    answer(s, 'harmony', 1);
    const l = homeLayout(s, IDS);
    expect(l.front).toContain('harmony');
    expect(l.more).not.toContain('harmony');
  });

  it('自选过考点但还没作答，也算练过', () => {
    const s = fresh();
    s.exercises.scales = { level: 0, custom: ['major'], items: {}, options: {} };
    expect(practiced(s, 'scales')).toBe(true);
    expect(homeLayout(s, IDS).front).toContain('scales');
  });

  it('只是被引导调高了起始级别，不算练过', () => {
    const s = fresh();
    applyBackground(s, 'exam', EXERCISES);
    expect(practiced(s, 'harmony')).toBe(false);
    expect(homeLayout(s, IDS).more).toContain('harmony');
  });

  it('唱过曲库里的歌：视唱曲库移到前面', () => {
    const s = fresh();
    s.songs = { 'twinkle': { best: 60, attempts: 1, practiced: 0, last: 1, lastScore: 60 } };
    expect(homeLayout(s, IDS).front).toContain(SONGS_ID);
  });

  it('累计答满第一批的题数：第一批移到前面，差一题时不移', () => {
    const at = UNLOCK_TIERS[0].at;
    const s = fresh();
    answer(s, 'degrees', at - 1);
    expect(homeLayout(s, IDS).front).not.toContain('scales');
    answer(s, 'intervals', 1, '2026-10-02');
    const l = homeLayout(s, IDS);
    for (const id of UNLOCK_TIERS[0].ids) expect(l.front).toContain(id);
    expect(l.next?.ids).toEqual(UNLOCK_TIERS[1].ids);
  });

  it('答满最后一批：全部卡片显示在前面，没有「更多练习」', () => {
    const s = fresh();
    answer(s, 'degrees', UNLOCK_TIERS[UNLOCK_TIERS.length - 1].at);
    const l = homeLayout(s, IDS);
    expect(l.front).toEqual(IDS);
    expect(l.more).toEqual([]);
    expect(l.next).toBeNull();
  });

  it('前面的卡片保持原有顺序', () => {
    const s = fresh();
    answer(s, 'singing', 1);
    answer(s, 'bassLine', 1);
    const l = homeLayout(s, IDS);
    expect(l.front).toEqual(IDS.filter((id) => l.front.includes(id)));
  });
});

describe('首页可见性：老用户', () => {
  it('旧数据（没有 background 字段）读出来按没选背景处理，练过的全部在前面', () => {
    const raw = JSON.stringify({
      version: 1,
      settings: { naming: 'movable' },
      exercises: {
        rhythmTap: { level: 2, custom: null, items: { a: { n: 3, c: 2, acc: 0.6, last: 1 } }, options: {} },
        dictation: { level: 0, custom: null, items: { b: { n: 1, c: 1, acc: 0.8, last: 1 } }, options: {} },
      },
      daily: { '2026-09-01': { n: 4, c: 3 } },
    });
    const s = parseStore(raw);
    expect(s.settings.background).toBe('');
    expect(s.settings.homeMore).toBe(false);
    expect(coreIds(s)).toEqual(CORE_IDS);
    const l = homeLayout(s, IDS);
    expect(l.front).toContain('rhythmTap');
    expect(l.front).toContain('dictation');
  });

  it('不认识的背景取值回到默认（没选）', () => {
    expect(mergeSettings({ background: 'pro' }).background).toBe('');
    expect(mergeSettings({ background: 'exam', homeMore: true })).toMatchObject({ background: 'exam', homeMore: true });
  });

  it('不修改传入的 store', () => {
    const s = fresh();
    answer(s, 'chords', 3);
    const before = JSON.stringify(s);
    homeLayout(s, IDS);
    expect(JSON.stringify(s)).toBe(before);
  });
});
