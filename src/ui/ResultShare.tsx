// 练完固定题目的组合后「分享成绩」：填名字（可不填，记在本机），生成成绩链接（#r=，见 engine/resultLink.ts）并复制。
import { useId, useState } from 'react';
import type { PracticeSet } from '../engine/practiceSet';
import { MAX_STUDENT, resultUrl } from '../engine/resultLink';
import { useT } from '../i18n/react';
import type { QuizResult } from './Practice';

/** 上次填的名字（只在本机，下次分享时自动填上） */
const NAME_KEY = 'earforge:resultName';

declare const __APP_VERSION__: string;
const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* 隐私模式等：不记住即可 */
  }
}

interface Props {
  set: PracticeSet;
  results: QuizResult[];
  /** 开始与完成时间戳 */
  started: number;
  finished: number;
}

export function ResultShare({ set, results, started, finished }: Props) {
  const t = useT();
  const id = useId();
  const [name, setName] = useState(loadName);
  const [shared, setShared] = useState<{ url: string; manual: boolean } | null>(null);

  const make = async () => {
    const clean = name.trim();
    saveName(clean);
    let url: string;
    try {
      url = resultUrl({
        set: { name: set.name, parts: set.parts, count: set.count, seed: set.seed },
        results,
        at: finished,
        minutes: (finished - started) / 60000,
        version: APP_VERSION,
        name: clean,
      });
    } catch {
      return; // 题数与组合不符（理论上不会发生）
    }
    // 手机上用系统分享面板
    if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: t('rshare.title'), url });
        setShared({ url, manual: false });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared({ url, manual: false });
    } catch {
      setShared({ url, manual: true });
    }
  };

  return (
    <div className="panel result-share">
      <h2 className="chart-title">{t('rshare.title')}</h2>
      <p className="muted">{t('rshare.intro')}</p>
      <label className="field-label" htmlFor={`${id}-name`}>
        {t('rshare.name')}
      </label>
      <div className="result-share-row">
        <input
          id={`${id}-name`}
          className="text-input"
          type="text"
          value={name}
          maxLength={MAX_STUDENT}
          autoComplete="name"
          placeholder={t('rshare.namePlaceholder')}
          onChange={(e) => {
            setName(e.target.value);
            setShared(null);
          }}
        />
        <button className="primary" onClick={() => void make()}>
          {t('rshare.make')}
        </button>
      </div>
      {shared && (
        <div className="result-share-done" role="status">
          <span>{shared.manual ? t('rshare.manual') : t('rshare.copied')}</span>
          <input
            className="text-input"
            readOnly
            value={shared.url}
            aria-label={t('rshare.linkAria')}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
