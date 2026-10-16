import { useState } from 'react';
import { EXERCISES } from '../exercises';
import { itemGroups, itemStat, streak, type Store } from '../engine/progress';
import { peekProgress, weakItems } from '../engine/planner';
import { joinList } from '../i18n';
import { useT } from '../i18n/react';

interface Props {
  store: Store;
  onBack(): void;
  /** 用指定考点临时专练 */
  onFocus(id: string, items: string[]): void;
}

function lastDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
  }
  return out;
}

export function StatsPage({ store, onBack, onFocus }: Props) {
  const t = useT();
  const days = lastDays(30);
  const rows = days.map((d) => ({ d, ...(store.daily[d] ?? { n: 0, c: 0 }) }));
  const max = Math.max(10, ...rows.map((r) => r.n));
  const total = Object.values(store.daily).reduce((a, r) => ({ n: a.n + r.n, c: a.c + r.c }), { n: 0, c: 0 });
  const [hover, setHover] = useState<number | null>(null);

  return (
    <main className="page">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          {t('common.back')}
        </button>
        <h1>{t('stats.title')}</h1>
        <span />
      </header>

      <section className="tiles">
        <div className="tile">
          <span className="tile-label">{t('stats.total')}</span>
          <span className="tile-value">{total.n.toLocaleString()}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t('stats.acc')}</span>
          <span className="tile-value">{total.n ? `${Math.round((total.c / total.n) * 100)}%` : '—'}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t('home.streak')}</span>
          <span className="tile-value">{streak(store)}</span>
        </div>
      </section>

      <section className="panel">
        <h2 className="chart-title">{t('stats.chart')}</h2>
        <div className="bars" role="img" aria-label={t('stats.chartAria')} onMouseLeave={() => setHover(null)}>
          {rows.map((r, i) => (
            <div key={r.d} className="bar-hit" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
              <div className={`bar ${hover === i ? 'hot' : ''}`} style={{ height: `${(r.n / max) * 100}%` }} />
            </div>
          ))}
          {hover !== null && (
            <div className="tooltip" style={{ left: `${((hover + 0.5) / rows.length) * 100}%` }}>
              <strong>{rows[hover].d.slice(5)}</strong>
              <span>{t('stats.nQ', { n: rows[hover].n })}</span>
              {rows[hover].n > 0 && (
                <span>{t('stats.dayAcc', { pct: Math.round((rows[hover].c / rows[hover].n) * 100) })}</span>
              )}
            </div>
          )}
        </div>
        <div className="bars-axis muted">
          <span>{days[0].slice(5)}</span>
          <span>{t('stats.today')}</span>
        </div>
        <table className="sr-only">
          <thead>
            <tr>
              <th>{t('stats.date')}</th>
              <th>{t('stats.answered')}</th>
              <th>{t('stats.right')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.d}>
                <td>{r.d}</td>
                <td>{r.n}</td>
                <td>{r.c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {EXERCISES.flatMap((ex) => {
        const raw = store.exercises[ex.id];
        if (!raw || Object.keys(raw.items).length === 0) return [];
        const p = peekProgress(store, ex);
        // 有调式等 scoped 选项的练习按取值分组显示
        return itemGroups(ex).map((g) => {
          const items = g.items.filter((it) => p.items[it]);
          if (items.length === 0) return null;
          // 最弱的排前面，方便针对性练习
          items.sort((a, b) => itemStat(p, a).acc - itemStat(p, b).acc);
          const weak = weakItems(ex, p, g.items);
          return (
            <section className="panel" key={`${ex.id}:${g.id}`}>
              <div className="panel-head">
                <h2 className="chart-title">
                  {ex.icon} {ex.title}
                  {g.label && ` · ${g.label}`} · {t('stats.mastery')}
                </h2>
                {weak.length >= 2 && (
                  <button
                    className="weak-btn"
                    onClick={() => onFocus(ex.id, weak)}
                    title={t('stats.drillTitle', { items: joinList(weak.map((it) => ex.itemLabel(it, store.settings))) })}
                  >
                    {t('stats.drill')}
                  </button>
                )}
              </div>
              <ul className="mastery">
                {items.map((it) => {
                  const st = itemStat(p, it);
                  return (
                    <li key={it} title={t('stats.itemTitle', { c: st.c, n: st.n })}>
                      <span className="mastery-label">{ex.itemLabel(it, store.settings)}</span>
                      <span className="meter">
                        <span className="meter-fill" style={{ width: `${st.acc * 100}%` }} />
                      </span>
                      <span className="mastery-val">{Math.round(st.acc * 100)}%</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        });
      })}
    </main>
  );
}
