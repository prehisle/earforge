import { useState } from 'react';
import { EXERCISES } from '../exercises';
import { itemGroups, itemStat, streak, type Store } from '../engine/progress';
import { peekProgress, weakItems } from '../engine/planner';

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
  const days = lastDays(30);
  const rows = days.map((d) => ({ d, ...(store.daily[d] ?? { n: 0, c: 0 }) }));
  const max = Math.max(10, ...rows.map((r) => r.n));
  const total = Object.values(store.daily).reduce((a, r) => ({ n: a.n + r.n, c: a.c + r.c }), { n: 0, c: 0 });
  const [hover, setHover] = useState<number | null>(null);

  return (
    <main className="page">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← 返回
        </button>
        <h1>统计</h1>
        <span />
      </header>

      <section className="tiles">
        <div className="tile">
          <span className="tile-label">累计作答</span>
          <span className="tile-value">{total.n.toLocaleString()}</span>
        </div>
        <div className="tile">
          <span className="tile-label">总正确率</span>
          <span className="tile-value">{total.n ? `${Math.round((total.c / total.n) * 100)}%` : '—'}</span>
        </div>
        <div className="tile">
          <span className="tile-label">连续天数</span>
          <span className="tile-value">{streak(store)}</span>
        </div>
      </section>

      <section className="panel">
        <h2 className="chart-title">近 30 天每日作答数</h2>
        <div className="bars" role="img" aria-label="近 30 天每日作答数柱状图，数据见下方表格" onMouseLeave={() => setHover(null)}>
          {rows.map((r, i) => (
            <div key={r.d} className="bar-hit" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
              <div className={`bar ${hover === i ? 'hot' : ''}`} style={{ height: `${(r.n / max) * 100}%` }} />
            </div>
          ))}
          {hover !== null && (
            <div className="tooltip" style={{ left: `${((hover + 0.5) / rows.length) * 100}%` }}>
              <strong>{rows[hover].d.slice(5)}</strong>
              <span>{rows[hover].n} 题</span>
              {rows[hover].n > 0 && <span>正确率 {Math.round((rows[hover].c / rows[hover].n) * 100)}%</span>}
            </div>
          )}
        </div>
        <div className="bars-axis muted">
          <span>{days[0].slice(5)}</span>
          <span>今天</span>
        </div>
        <table className="sr-only">
          <thead>
            <tr>
              <th>日期</th>
              <th>作答</th>
              <th>答对</th>
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
            <section className="panel" key={`${ex.id}:${g.label}`}>
              <div className="panel-head">
                <h2 className="chart-title">
                  {ex.icon} {ex.title}
                  {g.label && ` · ${g.label}`} · 掌握度（由弱到强）
                </h2>
                {weak.length >= 2 && (
                  <button
                    className="weak-btn"
                    onClick={() => onFocus(ex.id, weak)}
                    title={`专练：${weak.map((it) => ex.itemLabel(it, store.settings)).join('、')}`}
                  >
                    专练薄弱点
                  </button>
                )}
              </div>
              <ul className="mastery">
                {items.map((it) => {
                  const st = itemStat(p, it);
                  return (
                    <li key={it} title={`答对 ${st.c}/${st.n}`}>
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
