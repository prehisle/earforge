// 英文词典按需加载：首次渲染前判断语言（storedLocale 与 parseStore 一致）、加载与通知。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStore, storedLocale } from '../engine/progress';
import { isLocaleLoaded, loadLocale, MESSAGES, onLocaleLoaded } from '../i18n';
import { en } from '../i18n/en';

afterEach(() => vi.unstubAllGlobals());

function stub(raw: string | null, language?: string) {
  vi.stubGlobal('localStorage', { getItem: () => raw, setItem: () => {} });
  vi.stubGlobal('navigator', { language });
}

describe('storedLocale', () => {
  const cases: [string | null, string | undefined][] = [
    [null, 'en-US'],
    [null, 'zh-CN'],
    [null, undefined],
    [JSON.stringify({ settings: { lang: 'en' } }), 'zh-CN'],
    [JSON.stringify({ settings: { lang: 'zh' } }), 'en-US'],
    [JSON.stringify({ settings: {} }), 'en-US'],
    [JSON.stringify({ settings: { lang: 'fr' } }), 'en-US'],
    [JSON.stringify({ version: 1 }), 'en-US'],
    ['{broken', 'en-US'],
    ['null', 'en-US'],
  ];
  it.each(cases)('与 parseStore 一致：%s / %s', (raw, language) => {
    stub(raw, language);
    expect(storedLocale()).toBe(parseStore(raw).settings.lang);
  });
});

describe('loadLocale', () => {
  it('加载后词典完整、重复调用直接完成并通知订阅者', async () => {
    // setup.ts 已加载过英文词典
    expect(isLocaleLoaded('en')).toBe(true);
    expect(MESSAGES.en).toBe(en);
    const f = vi.fn();
    const off = onLocaleLoaded(f);
    await loadLocale('en');
    await loadLocale('zh');
    off();
    expect(f).not.toHaveBeenCalled(); // 已加载：不再通知
  });
});
