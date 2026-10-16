import type { Locale } from '../i18n';

/** 分段按钮组 */
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange(v: T): void;
}) {
  return (
    <div className="seg wrap">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const LANG_NAMES: [Locale, string, string][] = [
  ['zh', '中文', 'zh-CN'],
  ['en', 'English', 'en'],
];

/** 语言切换（设置页顶部与新手引导欢迎页共用）。语言名称固定用各自的文字，并标注 lang 供读屏软件发音。 */
export function LangSwitch({ value, onChange }: { value: Locale; onChange(v: Locale): void }) {
  return (
    <div className="seg wrap lang-switch">
      {LANG_NAMES.map(([v, label, tag]) => (
        <button key={v} lang={tag} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
