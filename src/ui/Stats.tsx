import { useState } from 'react';
import { EXERCISES } from '../exercises';
import { itemGroups, itemStat, streak, today, type Store } from '../engine/progress';
import { peekProgress, weakItems } from '../engine/planner';
import {
  MIN_DAY_N,
  MIN_PERIOD_N,
  RANGES,
  accOf,
  bestStreak,
  bucketWeeks,
  diffDays,
  heatmapGrid,
  periodDelta,
  practiceDays,
  rangeStart,
  sparkWindow,
  sumRange,
  trendSeries,
  volumeByWeek,
  type RangeId,
} from '../engine/trends';
import { joinList, type MessageKey } from '../i18n';
import { useT } from '../i18n/react';
import { Seg } from './Seg';
import { AccuracyChart, AccuracyLegend, Delta, Heatmap, TrendTable, VolumeChart } from './TrendCharts';
import { pct, useFmt } from './trendFormat';

interface Props {
  store: Store;
  onBack(): void;
  /** 用指定考点临时专练 */
  onFocus(id: string, items: string[]): void;
}

const HEAT_WEEKS = 26;

const RANGE_LABEL: Record<RangeId, MessageKey> = { '30': 'stats.r30', '90': 'stats.r90', '365': 'stats.r365', all: 'stats.rall' };

export function StatsPage({ store, onBack, onFocus }: Props) {
  const t = useT();
  const f = useFmt();
  const [range, setRange] = useState<RangeId>('30');
  const daily = store.daily;
  const now = today();
  // 周起始：中文周一，英文周日（日历与按周汇总一致）
  const weekStart: 0 | 1 = f.locale === 'zh' ? 1 : 0;
  const total = Object.values(daily).reduce((a, r) => a + r.n, 0);
  const empty = total === 0;

  const from = rangeStart(range, daily, now);
  const span = diffDays(from, now) + 1;
  const rows = trendSeries(daily, from, now);
  const weekly = volumeByWeek(span);
  const sparkWin = sparkWindow(span);
  const vol = weekly ? bucketWeeks(rows, weekStart) : rows.map((r) => ({ key: r.key, end: r.key, n: r.n, c: r.c }));
  const hasAcc = rows.some((r) => r.roll !== null || (r.acc !== null && !r.low));
  const periodLen = range === 'all' ? span : Number(range);
  const head = range === 'all' ? null : periodDelta(daily, now, periodLen);
  const headAcc = head ? head.cur : accOf(sumRange(daily, from, now));
  const deltaTitle = (d: number | null) =>
    d === null ? undefined : t('stats.deltaTitle', { n: periodLen, d: `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))}` });

  // 有过练习的模块（按固定顺序）
  const modules = EXERCISES.filter(
    (ex) =>
      Object.keys(store.exercises[ex.id]?.items ?? {}).length > 0 || Object.values(daily).some((d) => d.ex?.[ex.id]),
  );
  const heat = heatmapGrid(daily, now, HEAT_WEEKS, weekStart, store.settings.dailyGoal);
  const heatDays = heat.weeks.flat().filter((c) => c.n > 0).length;

  return (
    <main className="page">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          {t('common.back')}
        </button>
        <h1>{t('stats.title')}</h1>
        <span />
      </header>

      <section className="tiles trend-tiles">
        <div className="tile">
          <span className="tile-label">{t('stats.total')}</span>
          <span className="tile-value">{f.num(total)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t('stats.days')}</span>
          <span className="tile-value">{f.num(practiceDays(daily))}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t('home.streak')}</span>
          <span className="tile-value">{streak(store)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t('stats.best')}</span>
          <span className="tile-value">{bestStreak(daily)}</span>
        </div>
      </section>

      {empty ? (
        <section className="panel trend-empty">
          <h2 className="chart-title">{t('stats.emptyTitle')}</h2>
          <p className="muted">{t('stats.emptyBody')}</p>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2 className="chart-title">{t('stats.heatTitle')}</h2>
              <span className="muted trend-sub">{t('stats.heatSub', { n: heatDays })}</span>
            </div>
            <Heatmap
              grid={heat}
              weekStart={weekStart}
              goal={store.settings.dailyGoal}
              label={t('stats.heatAria', { n: heatDays })}
            />
          </section>

          <div className="trend-filter">
            <span className="muted">{t('stats.range')}</span>
            <Seg<RangeId> value={range} options={RANGES.map((r): [RangeId, string] => [r, t(RANGE_LABEL[r])])} onChange={setRange} />
          </div>

          <section className="panel">
            <h2 className="chart-title">{t('stats.accTitle')}</h2>
            <div className="trend-hero">
              <span className="trend-hero-label">
                {range === 'all' ? t('stats.heroAll') : t('stats.heroLabel', { n: periodLen })}
              </span>
              <span className="trend-hero-row">
                <span className="trend-hero-value">{headAcc === null ? '—' : pct(headAcc)}</span>
                {head && <Delta d={head.delta} title={deltaTitle(head.delta)} />}
                {head && head.cur !== null && (
                  <span className="muted trend-sub">
                    {head.delta === null ? t('stats.noPrev') : t('stats.vsPrev', { n: periodLen })}
                  </span>
                )}
              </span>
            </div>
            {hasAcc ? (
              <>
                <AccuracyLegend />
                <AccuracyChart rows={rows} label={t('stats.accAria')} />
              </>
            ) : (
              <p className="trend-placeholder muted">{t('stats.accEmpty', { n: MIN_DAY_N })}</p>
            )}
          </section>

          <section className="panel">
            <h2 className="chart-title">{weekly ? t('stats.volTitleWeek') : t('stats.volTitle')}</h2>
            <VolumeChart rows={vol} weekly={weekly} label={t('stats.volAria')} />
            <TrendTable rows={rows} />
          </section>

          {modules.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="chart-title">{t('stats.modTitle')}</h2>
                <span className="muted trend-sub">{t('stats.modSub', { n: sparkWin })}</span>
              </div>
              <ul className="trend-modules">
                {modules.map((ex) => {
                  const series = trendSeries(daily, from, now, ex.id, sparkWin);
                  const known = series.some((r) => !r.unknown && r.n > 0);
                  const pd = range === 'all' ? null : periodDelta(daily, now, periodLen, ex.id);
                  const cur = pd ? pd.cur : accOf(sumRange(daily, from, now, ex.id), MIN_PERIOD_N);
                  const hasLine = series.some((r) => r.roll !== null);
                  return (
                    <li key={ex.id} className="trend-module">
                      <span className="trend-module-name">
                        {ex.icon} {ex.title}
                      </span>
                      <span className="trend-module-row">
                        <span className="trend-module-value">{cur === null ? '—' : pct(cur)}</span>
                        {pd && <Delta d={pd.delta} title={deltaTitle(pd.delta)} />}
                      </span>
                      {hasLine ? (
                        <AccuracyChart
                          rows={series}
                          compact
                          win={sparkWin}
                          label={t('stats.modAria', { name: ex.title, n: sparkWin })}
                        />
                      ) : (
                        <span className="trend-module-note muted">
                          {known ? t('stats.modFew') : t('stats.modNoHist')}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

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
