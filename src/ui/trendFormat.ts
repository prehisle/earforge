// 趋势图的本地化格式化（日期、数字、百分比）

import { useMemo } from 'react';
import { dateOf } from '../engine/trends';
import { useLocale } from '../i18n/react';

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 本地化日期与数字格式化；按语言缓存 Intl 实例 */
export function useFmt() {
  const locale = useLocale();
  return useMemo(() => {
    const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
    const mk = (o: Intl.DateTimeFormatOptions) => {
      const f = new Intl.DateTimeFormat(tag, o);
      return (key: string) => f.format(dateOf(key));
    };
    const nf = new Intl.NumberFormat(tag);
    return {
      locale,
      day: mk({ month: 'short', day: 'numeric' }),
      full: mk({ year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' }),
      month: mk({ month: 'short' }),
      monthYear: mk({ year: 'numeric', month: 'short' }),
      weekdayName: mk({ weekday: locale === 'zh' ? 'narrow' : 'short' }),
      num: (n: number) => nf.format(n),
    };
  }, [locale]);
}
