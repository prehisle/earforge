import { useMemo, useState } from 'react';
import type { Store } from '../engine/progress';
import { useLocale, useT } from '../i18n/react';
import { SONGS, type SongDef, type SongTag } from '../songs/library';
import { TAG_ORDER, songTags } from '../songs/realize';
import { hasSung } from '../songs/results';
import { Seg } from './Seg';

interface Props {
  store: Store;
  onBack(): void;
  onOpen(id: string): void;
}

interface Filter {
  level: string; // 'all' | '1'..'5'
  kind: 'all' | SongDef['kind'];
  meter: string; // 'all' | '4/4' …
  tags: SongTag[];
}

const EMPTY: Filter = { level: 'all', kind: 'all', meter: 'all', tags: [] };
// 返回曲库时保留上次的筛选
let lastFilter: Filter = EMPTY;

const METERS = [...new Set(SONGS.map((s) => s.meter.join('/')))].sort((a, b) => Number(a.split('/')[1]) - Number(b.split('/')[1]) || a.localeCompare(b));
const ALL_TAGS = TAG_ORDER.filter((t) => SONGS.some((s) => songTags(s).includes(t)));

export function SongLibrary({ store, onBack, onOpen }: Props) {
  const t = useT();
  const lang = useLocale();
  const [f, setF] = useState<Filter>(lastFilter);
  const set = (patch: Partial<Filter>) => {
    const next = { ...f, ...patch };
    lastFilter = next;
    setF(next);
  };

  const list = useMemo(
    () =>
      SONGS.filter((s) => {
        if (f.level !== 'all' && String(s.level) !== f.level) return false;
        if (f.kind !== 'all' && s.kind !== f.kind) return false;
        if (f.meter !== 'all' && s.meter.join('/') !== f.meter) return false;
        const tags = songTags(s);
        return f.tags.every((tg) => tags.includes(tg));
      }),
    [f],
  );
  const levels = [...new Set(list.map((s) => s.level))].sort();
  const filtered = f.level !== 'all' || f.kind !== 'all' || f.meter !== 'all' || f.tags.length > 0;

  return (
    <main className="page">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          {t('common.back')}
        </button>
        <h1>{t('songs.title')}</h1>
        <span className="topbar-spacer" />
      </header>

      <p className="muted songs-intro">{t('songs.intro')}</p>

      <section className="panel songs-filter">
        <div className="field">
          <label>{t('songs.filterLevel')}</label>
          <Seg
            value={f.level}
            options={[['all', t('songs.all')], ...[1, 2, 3, 4, 5].map((n): [string, string] => [String(n), String(n)])]}
            onChange={(level) => set({ level })}
          />
        </div>
        <div className="songs-filter-row">
          <div className="field">
            <label>{t('songs.filterKind')}</label>
            <Seg
              value={f.kind}
              options={[
                ['all', t('songs.all')],
                ['drill', t('songs.kind.drill')],
                ['song', t('songs.kind.song')],
              ]}
              onChange={(kind) => set({ kind })}
            />
          </div>
          <div className="field">
            <label>{t('songs.filterMeter')}</label>
            <Seg value={f.meter} options={[['all', t('songs.all')], ...METERS.map((m): [string, string] => [m, m])]} onChange={(meter) => set({ meter })} />
          </div>
        </div>
        <div className="field">
          <label>{t('songs.filterTags')}</label>
          <div className="chips">
            {ALL_TAGS.map((tg) => {
              const on = f.tags.includes(tg);
              return (
                <button
                  key={tg}
                  className={on ? 'chip on' : 'chip'}
                  aria-pressed={on}
                  onClick={() => set({ tags: on ? f.tags.filter((x) => x !== tg) : [...f.tags, tg] })}
                >
                  {t(`songs.tag.${tg}`)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="songs-count">
          <span className="muted">{t('songs.count', { n: list.length })}</span>
          {filtered && (
            <button className="ghost" onClick={() => set(EMPTY)}>
              {t('songs.clear')}
            </button>
          )}
        </div>
      </section>

      {list.length === 0 && <p className="muted songs-empty">{t('songs.empty')}</p>}

      {levels.map((lv) => (
        <section key={lv}>
          <h2 className="group-title">{t('songs.levelN', { n: lv })}</h2>
          <div className="cards">
            {list
              .filter((s) => s.level === lv)
              .map((s) => {
                const r = store.songs?.[s.id];
                const sung = hasSung(r);
                return (
                  <button key={s.id} className={`card song-card ${sung ? 'sung' : ''}`} onClick={() => onOpen(s.id)}>
                    <span className="card-icon">{s.kind === 'drill' ? '♪' : '♫'}</span>
                    <span className="card-body">
                      <span className="card-title">{s.title[lang]}</span>
                      <span className="card-sub">{s.source[lang]}</span>
                      <span className="song-tags">
                        <span className="song-tag song-tag-meter">{s.meter.join('/')}</span>
                        {songTags(s)
                          .filter((tg) => tg !== 'compound')
                          .map((tg) => (
                            <span key={tg} className="song-tag">
                              {t(`songs.tag.${tg}`)}
                            </span>
                          ))}
                      </span>
                    </span>
                    <span className={`song-badge ${sung ? 'on' : ''}`}>
                      {sung ? (r!.attempts > 0 ? t('songs.best', { pct: r!.best }) : t('songs.sung')) : t('songs.notYet')}
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </main>
  );
}
