import {
  activeItems,
  currentLevel,
  getProgress,
  levelsOf,
  mastery,
  streak,
  today,
  type Store,
} from '../engine/progress';
import { NEWBIE_QUESTIONS, totalAnswered } from '../engine/onboarding';
import { STARTER_IDS, peekProgress, planModules, rankItems } from '../engine/planner';
import { EXERCISES as ALL, exerciseById } from '../exercises';
import { joinList } from '../i18n';
import { useT } from '../i18n/react';
import type { ExerciseDef } from '../engine/types';
import { SONG_COUNT } from '../songs/count';
import { hasSung } from '../songs/results';

interface Props {
  store: Store;
  onOpen(id: string): void;
  onMix(): void;
  onStats(): void;
  onSettings(): void;
  onSongs(): void;
}

const GROUPS: ExerciseDef['group'][] = ['tonal', 'basics', 'sing'];

export function Home({ store, onOpen, onMix, onStats, onSettings, onSongs }: Props) {
  const t = useT();
  const day = store.daily[today()];
  const days = streak(store);
  // 只读取，不写回：getProgress 对新练习会创建默认值
  const snapshot = structuredClone(store);
  const n = day?.n ?? 0;
  const goal = store.settings.dailyGoal;
  const reached = n >= goal;
  // 今日训练预览：涉及的模块与最需要练的考点
  const mods = planModules(store, ALL);
  const fresh = mods.every((ex) => STARTER_IDS.includes(ex.id) && !Object.keys(store.exercises[ex.id]?.items ?? {}).length);
  const focus = rankItems(store, ALL)
    .filter((c) => c.strength > 0)
    .slice(0, 3)
    .map((c) => exerciseById[c.exId].itemLabel(c.item, store.settings));
  // 新手：突出「今日训练」入口，直到累计答满几道题
  const newbie = totalAnswered(store) < NEWBIE_QUESTIONS;
  // 起始级别可能由新手引导按基础调高过
  const starters = STARTER_IDS.map((id) => {
    const ex = exerciseById[id];
    return t('home.starter', { title: ex.title, level: peekProgress(store, ex).level + 1 });
  }).join(t('home.starterJoin'));

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo">耳</span>
          <div>
            <h1>{t('app.brand')}</h1>
            <p className="muted">{t('app.tagline')}</p>
          </div>
        </div>
        <nav className="topnav">
          <button className="ghost" onClick={onStats}>
            {t('home.stats')}
          </button>
          <button className="ghost" onClick={onSettings}>
            {t('home.settings')}
          </button>
        </nav>
      </header>

      <section className={newbie ? 'today spotlight' : 'today'}>
        <div className="today-body">
          {newbie && <span className="start-here">{t('home.startHere')}</span>}
          <h2>{t('home.today')}</h2>
          <p className="today-sub">
            {t('home.todaySub', { n: store.settings.mixSize, mods: mods.map((ex) => ex.title).join(' · ') })}
          </p>
          <p className="muted today-focus">
            {fresh
              ? t('home.focusFresh', { starters })
              : focus.length > 0
                ? t('home.focusWeak', { items: joinList(focus) })
                : t('home.focusAuto')}
          </p>
        </div>
        <button className="primary big" onClick={onMix}>
          {t('home.startToday')}
        </button>
      </section>

      <section className="tiles">
        <div className={reached ? 'tile goal done' : 'tile goal'}>
          <span className="tile-label">{t('home.todayCount')}</span>
          <span className="tile-value">
            {n}
            <span className="tile-of">/{goal}</span>
          </span>
          <span className="meter" title={t('home.goalTitle', { n: goal })}>
            <span className="meter-fill" style={{ width: `${Math.min(1, n / goal) * 100}%` }} />
          </span>
          {reached && <span className="goal-cheer">{t('home.goalReached')}</span>}
        </div>
        <div className="tile">
          <span className="tile-label">{t('home.todayAcc')}</span>
          <span className="tile-value">{day && day.n ? `${Math.round((day.c / day.n) * 100)}%` : '—'}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t('home.streak')}</span>
          <span className="tile-value">{days}</span>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g}>
          <h2 className="group-title">{t(`group.${g}`)}</h2>
          <div className="cards">
            {ALL.filter((e) => e.group === g).map((ex) => {
              const p = getProgress(snapshot, ex);
              const m = mastery(p, activeItems(ex, p));
              return (
                <button key={ex.id} className="card" onClick={() => onOpen(ex.id)}>
                  <span className="card-icon">{ex.icon}</span>
                  <span className="card-body">
                    <span className="card-title">{ex.title}</span>
                    <span className="card-sub">{ex.subtitle}</span>
                    <span className="card-meta">
                      {p.custom
                        ? t('home.custom')
                        : t('home.levelMeta', {
                            level: p.level + 1,
                            total: levelsOf(ex, p.options).length,
                            name: currentLevel(ex, p).name,
                          })}
                    </span>
                    <span className="meter" title={t('home.masteryTitle', { pct: Math.round(m * 100) })}>
                      <span className="meter-fill" style={{ width: `${m * 100}%` }} />
                    </span>
                  </span>
                </button>
              );
            })}
            {g === 'sing' && <SongsCard store={store} onOpen={onSongs} />}
          </div>
        </section>
      ))}

      <footer className="foot muted">
        {t('home.foot')}
        <br />
        {t('home.keys')}
      </footer>
    </main>
  );
}

/** 视唱曲库入口卡片（放在「视唱练耳」分组里）。 */
function SongsCard({ store, onOpen }: { store: Store; onOpen(): void }) {
  const t = useT();
  // 只数记录里唱过的曲目（不加载曲库数据）；曲目若被移除，最多算满
  const done = Math.min(SONG_COUNT, Object.values(store.songs ?? {}).filter(hasSung).length);
  return (
    <button className="card" onClick={onOpen}>
      <span className="card-icon">🎼</span>
      <span className="card-body">
        <span className="card-title">{t('songs.title')}</span>
        <span className="card-sub">{t('songs.cardSub', { n: SONG_COUNT })}</span>
        <span className="card-meta">{t('songs.cardMeta', { done, n: SONG_COUNT })}</span>
        <span className="meter">
          <span className="meter-fill" style={{ width: `${(done / SONG_COUNT) * 100}%` }} />
        </span>
      </span>
    </button>
  );
}
