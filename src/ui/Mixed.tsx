import { useRef, useState, type ReactNode } from 'react';
import { EXERCISES, exerciseById } from '../exercises';
import { activeItems, itemGroups, itemStat, today, type Store } from '../engine/progress';
import { peekProgress, planSession, weakItems } from '../engine/planner';
import { joinList } from '../i18n';
import { useT } from '../i18n/react';
import { Quiz, type QuizResult, type QuizSource } from './Practice';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
  onAgain(): void;
  /** 小结里「专练这些」：用指定考点临时专练 */
  onFocus(id: string, items: string[]): void;
}

const pct = (c: number, n: number) => (n ? Math.round((c / n) * 100) : 0);

/** 今日训练：按计划跨模块出题，每题仍由各模块自己生成和记录。 */
export function MixedPractice({ store, update, onBack, onAgain, onFocus }: Props) {
  const t = useT();
  const [plan] = useState(() => planSession(store, EXERCISES, { size: store.settings.mixSize }));
  const idx = useRef(0);
  const [shown, setShown] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [finished, setFinished] = useState(false);

  const source: QuizSource = {
    next: () => {
      const e = plan[idx.current];
      if (!e) return null;
      idx.current++;
      setShown(idx.current);
      const ex = exerciseById[e.exId];
      const p = peekProgress(store, ex);
      const items = activeItems(ex, p);
      return { ex, item: e.item, items: items.includes(e.item) ? items : [...items, e.item], options: p.options };
    },
    hasNext: () => idx.current < plan.length,
  };

  return (
    <main className="page practice">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{t('mix.title')}</h1>
          <p className="muted">{finished ? t('mix.done') : t('mix.progress', { i: Math.max(1, shown), n: plan.length })}</p>
        </div>
        <span className="topbar-spacer" />
      </header>

      {!finished && plan.length > 0 && (
        <div className="meter mix-progress" aria-hidden>
          <span className="meter-fill" style={{ width: `${(Math.max(0, shown - 1) / plan.length) * 100}%` }} />
        </div>
      )}

      {plan.length === 0 ? (
        <section className="start">
          <p>{t('mix.empty')}</p>
          <button className="primary" onClick={onBack}>
            {t('mix.home')}
          </button>
        </section>
      ) : finished ? (
        <Summary store={store} results={results} onAgain={onAgain} onBack={onBack} onFocus={onFocus} coach />
      ) : (
        <Quiz
          store={store}
          update={update}
          source={source}
          autoStart
          showModule
          onResult={(r) => setResults((rs) => [...rs, r])}
          onComplete={() => setFinished(true)}
        />
      )}
    </main>
  );
}

/** 一组混合练习的小结（今日训练与练习组合共用） */
export function Summary({
  store,
  results,
  onAgain,
  onBack,
  backLabel,
  againLabel,
  coach,
  onFocus,
  children,
}: {
  store: Store;
  results: QuizResult[];
  onAgain(): void;
  onBack(): void;
  /** 给出时在「最需要加强的考点」下显示专练按钮 */
  onFocus?(id: string, items: string[]): void;
  /** 返回按钮的文字，缺省为「返回首页」 */
  backLabel?: string;
  /** 再练按钮的文字，缺省为「再来一组」 */
  againLabel?: string;
  /** 按正确率给一句建议（今日训练用：错题会更常出现、掌握后自动升级） */
  coach?: boolean;
  /** 放在按钮上方的附加内容（如固定题目组合的「分享成绩」） */
  children?: ReactNode;
}) {
  const t = useT();
  const n = results.length;
  const c = results.filter((r) => r.allRight).length;

  // 各模块表现（按题计）
  const mods = new Map<string, { n: number; c: number }>();
  for (const r of results) {
    const m = mods.get(r.ex.id) ?? { n: 0, c: 0 };
    m.n++;
    if (r.allRight) m.c++;
    mods.set(r.ex.id, m);
  }

  // 最需要加强：本组正确率低的在前，同分时看累计掌握度
  const items = new Map<string, { exId: string; item: string; n: number; c: number }>();
  for (const r of results)
    for (const s of r.steps) {
      const key = `${r.ex.id}:${s.item}`;
      const it = items.get(key) ?? { exId: r.ex.id, item: s.item, n: 0, c: 0 };
      it.n++;
      if (s.ok) it.c++;
      items.set(key, it);
    }
  const accOf = (exId: string, item: string) => {
    const p = store.exercises[exId];
    return p ? itemStat(p, item).acc : 0.5;
  };
  const weakest = [...items.values()]
    .sort((a, b) => a.c / a.n - b.c / b.n || accOf(a.exId, a.item) - accOf(b.exId, b.item))
    .slice(0, 3);
  // 专练：按练习分组（本组答错过的考点）；只有一个考点时补上该练习（同一调式里）其他的薄弱点，至少两个才好出选择题
  const missed = weakest.filter((w) => w.c < w.n);
  const drills = [...new Set(missed.map((w) => w.exId))].map((exId) => {
    const ex = exerciseById[exId];
    const own = missed.filter((w) => w.exId === exId).map((w) => w.item);
    const pool = itemGroups(ex).find((g) => g.items.includes(own[0]))?.items;
    const extra = weakItems(ex, peekProgress(store, ex), pool).filter((it) => !own.includes(it));
    return { ex, items: own.length >= 2 ? own : [...own, ...extra].slice(0, 2) };
  });

  const todayN = store.daily[today()]?.n ?? 0;
  const goal = store.settings.dailyGoal;
  const acc = pct(c, n);
  const tip = !coach ? null : acc < 50 ? t('mix.tipLow') : acc >= 90 ? t('mix.tipHigh') : null;

  return (
    <section className="summary">
      <div className="summary-hero">
        <span className="summary-big">{acc}%</span>
        <span className="muted">{t('mix.acc', { c, n })}</span>
        <span className={todayN >= goal ? 'summary-goal done' : 'summary-goal'}>
          {todayN >= goal ? t('mix.goalDone', { t: todayN, goal }) : t('mix.goalProgress', { t: todayN, goal })}
        </span>
        {tip && <p className="summary-tip muted">{tip}</p>}
      </div>

      <div className="panel">
        <h2 className="chart-title">{t('mix.byModule')}</h2>
        <ul className="mastery">
          {[...mods.entries()].map(([id, m]) => {
            const ex = exerciseById[id];
            return (
              <li key={id}>
                <span className="mastery-label">
                  {ex.icon} {ex.title}
                </span>
                <span className="meter">
                  <span className="meter-fill" style={{ width: `${pct(m.c, m.n)}%` }} />
                </span>
                <span className="mastery-val">
                  {m.c}/{m.n}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {weakest.length > 0 && (
        <div className="panel">
          <h2 className="chart-title">{t('mix.weakest')}</h2>
          <ol className="weak-list">
            {weakest.map((w, i) => {
              const ex = exerciseById[w.exId];
              return (
                <li key={`${w.exId}:${w.item}`}>
                  <span className="weak-rank">{i + 1}</span>
                  <strong>{ex.itemLabel(w.item, store.settings)}</strong>
                  <span className="muted">{ex.title}</span>
                  <span className="weak-val">
                    {t('mix.weakVal', { c: w.c, n: w.n, pct: Math.round(accOf(w.exId, w.item) * 100) })}
                  </span>
                </li>
              );
            })}
          </ol>
          {onFocus && drills.length > 0 && (
            <div className="weak-drills">
              {drills.map(({ ex, items }) => (
                <button
                  key={ex.id}
                  className="weak-btn"
                  onClick={() => onFocus(ex.id, items)}
                  title={t('stats.drillTitle', { items: joinList(items.map((it) => ex.itemLabel(it, store.settings))) })}
                >
                  {drills.length === 1 ? t('mix.drill') : t('mix.drillEx', { title: ex.title })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {children}

      <div className="summary-actions">
        <button onClick={onBack}>{backLabel ?? t('mix.home')}</button>
        <button className="primary" onClick={onAgain}>
          {againLabel ?? t('mix.again')}
        </button>
      </div>
    </section>
  );
}
