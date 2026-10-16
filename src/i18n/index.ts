// 界面语言：无依赖的小型 i18n。zh 词典为准，en 必须有完全相同的键（由类型检查保证）。
// 练习生成器在 React 之外运行，读取模块级的当前语言；应用在加载与修改设置时同步调用 setLocale。
//
// 中文词典随首屏脚本加载；英文词典是单独的分块，按需加载（loadLocale）：
// - 启动时若界面语言为英文，main.tsx 先加载完英文词典再首次渲染，不会先闪一下中文；
// - 中文界面在首屏之后后台预取，切换语言时一般已就绪；万一尚未加载完，setLocale 会触发加载，
//   期间 translate 回退为中文，加载完成后通知订阅者（main.tsx 重新渲染整个应用）。
// 翻译接口（t / translate）保持同步。

import { zh, type MessageKey } from './zh';

export type Locale = 'zh' | 'en';
export type { MessageKey };
export type Params = Record<string, string | number>;
type Messages = Record<MessageKey, string>;

export const LOCALES: Locale[] = ['zh', 'en'];
/** 各语言的词典；尚未加载的语言为空对象（翻译时回退为中文） */
export const MESSAGES: Record<Locale, Messages> = { zh, en: {} as Messages };

const loaded = new Set<Locale>(['zh']);
const pending = new Map<Locale, Promise<void>>();
const listeners = new Set<() => void>();

/** 该语言的词典是否已加载 */
export function isLocaleLoaded(locale: Locale): boolean {
  return loaded.has(locale);
}

/** 加载语言的词典（已加载则立即完成；失败后可重试）。完成时通知 onLocaleLoaded 的订阅者。 */
export function loadLocale(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return Promise.resolve();
  let p = pending.get(locale);
  if (!p) {
    p = import('./en').then(
      (m) => {
        MESSAGES.en = m.en;
        loaded.add(locale);
        pending.delete(locale);
        for (const f of listeners) f();
      },
      (e: unknown) => {
        pending.delete(locale); // 失败（如离线且未缓存）后允许重试
        throw e;
      },
    );
    pending.set(locale, p);
  }
  return p;
}

/** 订阅「某个语言的词典加载完成」，返回取消订阅的函数 */
export function onLocaleLoaded(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

let current: Locale = 'zh';

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale === 'en' ? 'en' : 'zh';
  if (!loaded.has(current)) loadLocale(current).catch(() => {});
}

/** 新用户的默认语言：浏览器语言以 zh 开头用中文，否则英文。 */
export function detectLocale(lang: string | undefined = globalThis.navigator?.language): Locale {
  return !lang || /^zh\b/i.test(lang) ? 'zh' : 'en';
}

/**
 * 插值：{name} 替换为参数；{n:单数|复数} 按 n 是否为 1 选择（英文复数用，中文词典不需要）。
 */
export function format(template: string, params?: Params): string {
  if (!params || !template.includes('{')) return template;
  return template.replace(/\{(\w+)(?::([^|{}]*)\|([^{}]*))?\}/g, (m, key: string, one?: string, other?: string) => {
    const v = params[key];
    if (v === undefined) return m;
    if (one !== undefined) return Number(v) === 1 ? one : (other ?? '');
    return String(v);
  });
}

/** 按指定语言翻译。 */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return format(MESSAGES[locale][key] ?? MESSAGES.zh[key] ?? key, params);
}

/** 按当前语言翻译（练习生成器等非 React 代码用）。 */
export function t(key: MessageKey, params?: Params): string {
  return translate(current, key, params);
}

/** 列表连接：中文用顿号，英文用逗号。 */
export function joinList(items: string[]): string {
  return items.join(t('common.listSep'));
}
