import { useEffect, useState } from 'react';
import { activeClock } from '../engine/activeClock';
import type { Store } from '../engine/progress';
import type { PracticeSet } from '../engine/practiceSet';
import { mulberry32, SEEDED_GEN_SETTINGS, seededSource } from '../engine/seeded';
import { setSource } from '../engine/setRunner';
import { useT } from '../i18n/react';
import { Summary } from './Mixed';
import { Quiz, type QuizResult } from './Practice';
import { ResultShare } from './ResultShare';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  /** 要练的组合（已保存的或分享链接里的）；找不到时为 null */
  set: PracticeSet | null;
  onBack(): void;
  /** 返回按钮的文字（缺省「返回组合列表」） */
  backLabel?: string;
  onAgain(): void;
  /** 小结里「专练这些」：用指定考点临时专练 */
  onFocus?(id: string, items: string[]): void;
}

/** 练一组自定义组合：有限题数，题目上方显示所属练习，结束后显示小结。作答照常记入各练习的统计。 */
export function SetRun({ store, update, set, onBack, backLabel, onAgain, onFocus }: Props) {
  const t = useT();
  // 固定题目：选题顺序与每题的出题都由组合的 seed 决定（打开同一链接的人题目相同）
  // （不能用 { ...base } 包装：会把 shown 这个 getter 固定成 0）
  const [source] = useState(() => {
    if (!set) return null;
    if (set.seed === undefined) return setSource(set);
    const base = setSource(set, mulberry32(set.seed));
    const seeded = seededSource(base, set.seed);
    return {
      next: () => seeded.next(),
      hasNext: () => base.hasNext(),
      get total() {
        return base.total;
      },
      get shown() {
        return base.shown;
      },
    };
  });
  const fixed = set?.seed !== undefined;
  const [shown, setShown] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [finished, setFinished] = useState(false);
  // 成绩链接的用时（不计页面在后台的时间）与完成时间
  const [clock] = useState(() => activeClock());
  const [timing, setTiming] = useState({ at: 0, ms: 0 });
  useEffect(() => {
    const h = () => clock.update();
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [clock]);
  const back = backLabel ?? t('sets.backList');

  const quizSource = source && {
    next: () => {
      const d = source.next();
      setShown(source.shown);
      return d;
    },
    hasNext: () => source.hasNext(),
  };

  return (
    <main className="page practice">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>🧩 {set?.name || t('sets.untitled')}</h1>
          {source && (
            <p className="muted">
              {finished ? t('mix.done') : t('sets.progress', { i: Math.max(1, shown), n: source.total })}
              {fixed && ` · ${t('sets.seeded')}`}
            </p>
          )}
        </div>
        <span className="topbar-spacer" />
      </header>

      {source && !finished && (
        <div className="meter mix-progress" aria-hidden>
          <span className="meter-fill" style={{ width: `${(Math.max(0, shown - 1) / source.total) * 100}%` }} />
        </div>
      )}

      {/* 固定题目统一用随机调出题；用户设了固定 C 调时说明一下为什么不是 C 调 */}
      {fixed && !finished && store.settings.keyMode === 'C' && <p className="muted set-fixed-note">{t('sets.fixedKeyNote')}</p>}

      {!quizSource ? (
        <section className="start">
          <p>{t('sets.notFound')}</p>
          <button className="primary" onClick={onBack}>
            {back}
          </button>
        </section>
      ) : finished ? (
        <Summary
          store={store}
          results={results}
          onAgain={onAgain}
          onBack={onBack}
          onFocus={onFocus}
          backLabel={back}
          againLabel={fixed ? t('sets.againSame') : undefined}
        >
          {/* 固定题目：可把成绩发给老师（每个人题目相同，老师能对照每一题） */}
          {fixed && set && results.length === source?.total && (
            <ResultShare set={set} results={results} finished={timing.at} activeMs={timing.ms} />
          )}
        </Summary>
      ) : (
        <Quiz
          store={store}
          update={update}
          source={quizSource}
          autoStart
          showModule
          genSettings={fixed ? SEEDED_GEN_SETTINGS : undefined}
          onResult={(r) => setResults((rs) => [...rs, r])}
          onComplete={() => {
            setTiming({ at: Date.now(), ms: clock.activeMs() });
            setFinished(true);
          }}
        />
      )}
    </main>
  );
}
