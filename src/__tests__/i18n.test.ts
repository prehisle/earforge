import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUNDS } from '../engine/onboarding';
import { itemGroups, levelsOf, loadStore } from '../engine/progress';
import { DEFAULT_SETTINGS, type ExerciseDef, type Settings } from '../engine/types';
import { EXERCISES } from '../exercises';
import { MESSAGES, detectLocale, format, getLocale, setLocale, t, translate } from '../i18n';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import { CHORDS, INTERVALS, INTERVAL_SONGS, MODES, NAMING_SYSTEMS, diatonicTriads, namingLabel } from '../music/theory';

// 中日韩文字与全角标点（不含 ♩ ♭ Ⅰ 等音乐符号）
const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿＀-￯]/;

describe('词典', () => {
  it('中英文键完全一致', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('英文词典不含中文字符或全角标点', () => {
    const bad = Object.entries(en).filter(([, v]) => CJK.test(v));
    expect(bad).toEqual([]);
  });

  it('英文词典的值都不为空', () => {
    expect(Object.entries(en).filter(([, v]) => v.trim() === '')).toEqual([]);
  });

  it('两种语言的插值参数一致', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
    const diff = (Object.keys(zh) as (keyof typeof zh)[]).filter(
      (k) => [...new Set(params(zh[k]))].join() !== [...new Set(params(en[k]))].join(),
    );
    expect(diff).toEqual([]);
  });

  it('英文音程记忆歌曲不含中文', () => {
    for (const v of Object.values(INTERVAL_SONGS.en)) expect(v).not.toMatch(CJK);
  });
});

describe('插值与语言检测', () => {
  it('替换参数与单复数', () => {
    expect(format('{n} {n:question|questions}', { n: 1 })).toBe('1 question');
    expect(format('{n} {n:question|questions}', { n: 3 })).toBe('3 questions');
    expect(format('{a} → {b}', { a: 'C4', b: 'G4' })).toBe('C4 → G4');
    expect(format('缺少 {x}', {})).toBe('缺少 {x}');
    expect(translate('en', 'quiz.session', { n: 1 })).toBe('This session: 1 question');
    expect(translate('zh', 'quiz.session', { n: 1 })).toBe('本次：1 题');
  });

  it('浏览器语言：zh* 为中文，其他为英文', () => {
    expect(detectLocale('zh-CN')).toBe('zh');
    expect(detectLocale('zh-TW')).toBe('zh');
    expect(detectLocale('zh')).toBe('zh');
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('ja')).toBe('en');
    expect(detectLocale('')).toBe('zh');
  });
});

describe('设置中的语言', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('全新用户跟随浏览器语言', () => {
    vi.stubGlobal('navigator', { language: 'en-GB' });
    expect(loadStore().settings.lang).toBe('en');
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    expect(loadStore().settings.lang).toBe('zh');
  });

  it('旧版数据（没有 lang 字段）默认中文', () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    const { lang: _, ...old } = DEFAULT_SETTINGS;
    mem.set('earforge:v1', JSON.stringify({ version: 1, settings: old, exercises: {}, daily: {} }));
    expect(loadStore().settings.lang).toBe('zh');
  });
});

describe('当前语言', () => {
  afterEach(() => setLocale('zh'));

  it('乐理名称随语言切换', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(INTERVALS.find((i) => i.id === 'P5')!.name).toBe('Perfect 5th');
    expect(CHORDS.find((c) => c.id === 'dom7')!.name).toBe('Dominant 7th');
    expect(MODES.find((m) => m.id === 'dorian')!.name).toBe('Dorian');
    expect(namingLabel('jianpu')).toBe('Scale degrees (1 2 3)');
    expect(t('key.name', { tonic: 'E♭', mode: MODES[0].label })).toBe('E♭ major');
    setLocale('zh');
    expect(INTERVALS.find((i) => i.id === 'P5')!.name).toBe('纯五度');
    expect(MODES.find((m) => m.id === 'dorian')!.name).toBe('多利亚');
  });

  it('词典的每个键都能取到英文', () => {
    setLocale('en');
    for (const k of Object.keys(MESSAGES.zh) as (keyof typeof zh)[]) expect(t(k)).toBe(en[k]);
  });
});

/** 所有选项组合（每个选项单独变化，其余取默认），含每个 scoped 取值 */
function optionVariants(ex: ExerciseDef): Record<string, string>[] {
  const defaults = Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default]));
  const scoped = ex.options?.find((o) => o.scoped);
  const bases = scoped ? scoped.values.map((v) => ({ ...defaults, [scoped.id]: v.id })) : [defaults];
  const out: Record<string, string>[] = [];
  for (const base of bases) {
    out.push(base);
    for (const o of ex.options ?? []) {
      if (o.scoped) continue;
      for (const v of o.values) if (v.id !== base[o.id]) out.push({ ...base, [o.id]: v.id });
    }
  }
  return out;
}

describe('英文界面下的练习内容', () => {
  beforeEach(() => setLocale('en'));
  afterEach(() => setLocale('zh'));

  const check = (where: string, s: string | undefined) => {
    if (s !== undefined && CJK.test(s)) throw new Error(`${where} 含中文：${s}`);
  };

  it('标题、选项、级别、考点名称不含中文', () => {
    for (const b of BACKGROUNDS) {
      check('背景', b.label);
      check('背景说明', b.desc);
    }
    for (const n of NAMING_SYSTEMS) check('命名体系', namingLabel(n));
    for (const m of MODES) for (const tr of diatonicTriads(m)) check('功能名', tr.name);
    for (const ex of EXERCISES) {
      check(`${ex.id} 标题`, ex.title);
      check(`${ex.id} 副标题`, ex.subtitle);
      for (const o of ex.options ?? []) {
        check(`${ex.id} 选项`, o.label);
        for (const v of o.values) check(`${ex.id} 选项值`, v.label);
      }
      for (const g of itemGroups(ex)) check(`${ex.id} 分组`, g.label);
      for (const options of optionVariants(ex))
        for (const lv of levelsOf(ex, options)) {
          check(`${ex.id} 级别`, lv.name);
          for (const naming of NAMING_SYSTEMS)
            for (const it of lv.items) check(`${ex.id} 考点`, ex.itemLabel(it, { ...DEFAULT_SETTINGS, naming }));
        }
    }
  });

  it('每个练习、每个级别、每种选项生成的题目不含中文', () => {
    let count = 0;
    for (const ex of EXERCISES)
      for (const options of optionVariants(ex)) {
        const levels = levelsOf(ex, options);
        levels.forEach((_, lv) => {
          const items = [...new Set(levels.slice(0, lv + 1).flatMap((l) => l.items))];
          for (const naming of NAMING_SYSTEMS) {
            const settings: Settings = { ...DEFAULT_SETTINGS, lang: 'en', naming };
            for (const item of items) {
              const q = ex.generate(item, { settings, items, options });
              const where = `${ex.id} ${JSON.stringify(options)} ${item}`;
              check(`${where} 题干`, q.prompt);
              check(`${where} 解析`, q.explain);
              for (const c of q.choices) {
                check(`${where} 选项`, c.label);
                check(`${where} 选项副标题`, c.sub);
              }
              for (const d of q.sing?.display ?? []) check(`${where} 唱名`, d);
              count++;
            }
          }
        });
      }
    expect(count).toBeGreaterThan(500);
  }, 20000);

  it('切回中文后题目是中文', () => {
    setLocale('zh');
    const ex = EXERCISES.find((e) => e.id === 'intervals')!;
    const q = ex.generate('P5', { settings: DEFAULT_SETTINGS, items: ['P5', 'P8'], options: { dir: 'up' } });
    expect(q.prompt).toMatch(CJK);
    expect(q.choices[0].label).toBe('纯五度');
  });
});
