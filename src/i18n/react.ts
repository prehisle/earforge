import { createContext, useCallback, useContext } from 'react';
import { joinList, translate, type Locale, type MessageKey, type Params } from './index';

/** 当前界面语言（App 顶层按设置提供） */
export const LocaleContext = createContext<Locale>('zh');

export type TFunc = (key: MessageKey, params?: Params) => string;

/** 组件内翻译：语言变化时随 context 重新渲染。 */
export function useT(): TFunc {
  const locale = useContext(LocaleContext);
  return useCallback<TFunc>((key, params) => translate(locale, key, params), [locale]);
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export { joinList };
