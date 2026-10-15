import { useRef, useState } from 'react';
import { EXERCISES, exerciseById } from '../exercises';
import { activeItems, itemStat, today, type Store } from '../engine/progress';
import { peekProgress, planSession } from '../engine/planner';
import { Quiz, type QuizResult, type QuizSource } from './Practice';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
  onAgain(): void;
}

const pct = (c: number, n: number) => (n ? Math.round((c / n) * 100) : 0);

/** 今日训练：按计划跨模块出题，每题仍由各模块自己生成和记录。 */
export function MixedPractice({ store, update, onBack, onAgain }: Props) {
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
        <button className="ghost" onClick={onBack} aria-label="返回">
          ← 返回
        </button>
        <div className="practice-title">
          <h1>🎯 今日训练</h1>
          <p className="muted">{finished ? '本组完成' : `第 ${Math.max(1, shown)}/${plan.length} 题 · 混合练习`}</p>
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
          <p>暂时没有可练的考点。</p>
          <button className="primary" onClick={onBack}>
            返回首页
          </button>
        </section>
      ) : finished ? (
        <Summary store={store} results={results} onAgain={onAgain} onBack={onBack} />
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

function Summary({
  store,
  results,
  onAgain,
  onBack,
}: {
  store: Store;
  results: QuizResult[];
  onAgain(): void;
  onBack(): void;
}) {
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

  const t = store.daily[today()]?.n ?? 0;
  const goal = store.settings.dailyGoal;

  return (
    <section className="summary">
      <div className="summary-hero">
        <span className="summary-big">{pct(c, n)}%</span>
        <span className="muted">
          正确率 · 答对 {c}/{n} 题
        </span>
        <span className={t >= goal ? 'summary-goal done' : 'summary-goal'}>
          {t >= goal ? `🎉 今日目标已达成（${t}/${goal}）` : `今日进度 ${t}/${goal}`}
        </span>
      </div>

      <div className="panel">
        <h2 className="chart-title">各模块表现</h2>
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
          <h2 className="chart-title">最需要加强的考点</h2>
          <ol className="weak-list">
            {weakest.map((w, i) => {
              const ex = exerciseById[w.exId];
              return (
                <li key={`${w.exId}:${w.item}`}>
                  <span className="weak-rank">{i + 1}</span>
                  <strong>{ex.itemLabel(w.item, store.settings)}</strong>
                  <span className="muted">{ex.title}</span>
                  <span className="weak-val">
                    本组 {w.c}/{w.n} · 掌握度 {Math.round(accOf(w.exId, w.item) * 100)}%
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="summary-actions">
        <button onClick={onBack}>返回首页</button>
        <button className="primary" onClick={onAgain}>
          再来一组
        </button>
      </div>
    </section>
  );
}
