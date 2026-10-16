// 成绩页：打开带 #r=<code> 的网址时显示别人分享的成绩（见 engine/resultLink.ts）。
// 只读：不计入自己的练习记录；只有点「添加到成绩单」才保存（只存链接参数）。姓名与组合名称只作为文本渲染（React 转义）。
import { useMemo } from 'react';
import { addToGradebook } from '../engine/gradebook';
import type { PracticeSet } from '../engine/practiceSet';
import type { Store } from '../engine/progress';
import { APP_VERSION, resultDraws, versionDiffers, type ResultData } from '../engine/resultLink';
import { toPracticeSet } from '../engine/shareLink';
import { exerciseById } from '../exercises';
import { useT } from '../i18n/react';
import { useDateFmt } from './dateFmt';

interface Props {
  /** 解析出的成绩；null 表示链接无效 */
  result: ResultData | null;
  /** 成绩链接参数（添加到成绩单时保存） */
  code: string;
  store: Store;
  update(fn: (s: Store) => void): void;
  onHome(): void;
  /** 从成绩单打开时：返回成绩单（缺省返回首页） */
  onBack?(): void;
  backLabel?: string;
  onPractice(set: PracticeSet): void;
  onGradebook(fingerprint: string): void;
}

const pct = (c: number, n: number) => (n ? Math.round((c / n) * 100) : 0);

export function ResultView({ result, code, store, update, onHome, onBack, backLabel, onPractice, onGradebook }: Props) {
  const t = useT();
  const fmt = useDateFmt();
  const draws = useMemo(() => (result ? resultDraws(result.set) : []), [result]);

  if (!result)
    return (
      <main className="page shared result-view">
        <header className="topbar">
          <h1>{t('result.invalidTitle')}</h1>
        </header>
        <section className="panel">
          <p>{t('result.invalidBody')}</p>
          <div className="shared-actions">
            <button className="primary" onClick={onHome}>
              {t('result.home')}
            </button>
          </div>
        </section>
      </main>
    );

  const { marks, score, set } = result;
  const n = marks.length;
  const added = !!store.gradebook?.some((r) => r.code === code);
  const setName = set.name || t('share.untitled');

  // 各练习表现（按题计）
  const mods = new Map<string, { n: number; c: number }>();
  marks.forEach((m, i) => {
    const ex = draws[i]?.ex;
    if (!ex) return;
    const s = mods.get(ex) ?? { n: 0, c: 0 };
    s.n++;
    if (m.ok) s.c++;
    mods.set(ex, s);
  });

  return (
    <main className="page shared result-view">
      <header className="topbar">
        <button className="ghost" onClick={onBack ?? onHome} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{t('result.title')}</h1>
        </div>
        <span className="topbar-spacer" />
      </header>

      <section className="panel result-head" aria-labelledby="result-name">
        <h2 id="result-name" className="shared-name">
          {result.name || t('result.anon')}
        </h2>
        <p className="muted result-set">{t('result.set', { name: setName })}</p>
        <div className="summary-hero">
          <span className="summary-big">{pct(score, n)}%</span>
          <span className="result-score">{t('result.score', { c: score, n })}</span>
          <span className="muted">
            {t('result.meta', { date: fmt.format(result.at), m: result.minutes })}
            {result.version && ` · ${t('result.version', { v: result.version })}`}
          </span>
        </div>
        <p className="muted result-note">{t('result.notMine')}</p>
        <p className="muted result-note">{t('result.selfReported')}</p>
      </section>

      <section className="panel">
        <h2 className="chart-title">{t('result.grid')}</h2>
        {versionDiffers(result.version) && (
          <p className="muted result-note">{t('result.versionNote', { v: result.version, cur: APP_VERSION })}</p>
        )}
        <ol className="result-grid">
          {marks.map((m, i) => {
            const d = draws[i];
            const ex = d ? exerciseById[d.ex] : undefined;
            return (
              <li key={i} className={m.ok ? 'result-q ok' : 'result-q bad'} data-ex={d?.ex} data-item={d?.item}>
                <span className="result-q-head">
                  <span className="result-q-n">{t('result.q', { i: i + 1 })}</span>
                  <span className="result-q-mark" aria-hidden>
                    {m.ok ? '✓' : '✗'}
                  </span>
                  <span className="sr-only">{m.ok ? t('result.ok') : t('result.bad')}</span>
                  {m.n > 1 && <span className="result-q-steps">{t('result.steps', { c: m.c, n: m.n })}</span>}
                </span>
                {ex && d && (
                  <span className="result-q-item">
                    <span aria-hidden>{ex.icon} </span>
                    {ex.itemLabel(d.item, store.settings)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {mods.size > 0 && (
        <section className="panel">
          <h2 className="chart-title">{t('result.byModule')}</h2>
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
        </section>
      )}

      <div className="shared-actions result-actions">
        <button
          className="primary"
          disabled={added}
          onClick={() =>
            update((s) => {
              s.gradebook ??= [];
              addToGradebook(s.gradebook, code);
            })
          }
        >
          {added ? t('result.added') : t('result.add')}
        </button>
        {added && <button onClick={() => onGradebook(result.fingerprint)}>{t('result.openBook')}</button>}
        <button onClick={() => onPractice(toPracticeSet(set, t('share.untitled')))}>{t('result.practice')}</button>
        <button className="ghost" onClick={onBack ?? onHome}>
          {backLabel ?? t('result.home')}
        </button>
      </div>
    </main>
  );
}
