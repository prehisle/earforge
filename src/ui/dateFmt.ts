// 成绩页与成绩单共用的日期时间格式（本地时区，按界面语言）
import { useMemo } from 'react';
import { useLocale } from '../i18n/react';

export function useDateFmt(): Intl.DateTimeFormat {
  const locale = useLocale();
  return useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );
}
