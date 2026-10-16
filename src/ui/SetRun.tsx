import { useState } from 'react';
import type { Store } from '../engine/progress';
import type { PracticeSet } from '../engine/practiceSet';
import { mulberry32, seededSource } from '../engine/seeded';
import { setSource } from '../engine/setRunner';
import { useT } from '../i18n/react';
import { Summary } from './Mixed';
import { Quiz, type QuizResult } from './Practice';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  /** 要练的组合（已保存的或分享链接里的）；找不到时为 null */
  set: PracticeSet | null;
  /** 本组出题顺序用的随机数（固定题目时传入带种子的），缺省 Math.random */
  rng?: () => number;
  onBack(): void;
  /** 返回按钮的文字（缺省「返回组合列表」） */
  backLabel?: string;
  onAgain(): void;
}

/** 练一组自定义组合：有限题数，题目上方显示所属练习，结束后显示小结。作答照常记入各练习的统计。 */
export function SetRun({ store, update, set, rng, onBack, backLabel, onAgain }: Props) {
  const t = useT();
  // 固定题目：选题顺序与每题的出题都由组合的 seed 决定（打开同一链接的人题目相同）
  const [source] = useState(() => {
    if (!set) return null;
    if (set.seed === undefined) return setSource(set, rng);
    const base = setSource(set, mulberry32(set.seed));
    const seeded = seededSource(base, set.seed);
    return { ...base, next: () => seeded.next() };
  });
  const [shown, setShown] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [finished, setFinished] = useState(false);
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
            <p className="muted">{finished ? t('mix.done') : t('sets.progress', { i: Math.max(1, shown), n: source.total })}</p>
          )}
        </div>
        <span className="topbar-spacer" />
      </header>

      {source && !finished && (
        <div className="meter mix-progress" aria-hidden>
          <span className="meter-fill" style={{ width: `${(Math.max(0, shown - 1) / source.total) * 100}%` }} />
        </div>
      )}

      {!quizSource ? (
        <section className="start">
          <p>{t('sets.notFound')}</p>
          <button className="primary" onClick={onBack}>
            {back}
          </button>
        </section>
      ) : finished ? (
        <Summary store={store} results={results} onAgain={onAgain} onBack={onBack} backLabel={back} />
      ) : (
        <Quiz
          store={store}
          update={update}
          source={quizSource}
          autoStart
          showModule
          onResult={(r) => setResults((rs) => [...rs, r])}
          onComplete={() => setFinished(true)}
        />
      )}
    </main>
  );
}
