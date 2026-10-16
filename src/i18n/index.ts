// 界面语言：无依赖的小型 i18n。zh 词典为准，en 必须有完全相同的键（由类型检查保证）。
// 练习生成器在 React 之外运行，读取模块级的当前语言；应用在加载与修改设置时同步调用 setLocale。

import { en } from './en';
import { zh, type MessageKey } from './zh';

export type Locale = 'zh' | 'en';
export type { MessageKey };
export type Params = Record<string, string | number>;

export const LOCALES: Locale[] = ['zh', 'en'];
export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { zh, en };

let current: Locale = 'zh';

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale === 'en' ? 'en' : 'zh';
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
