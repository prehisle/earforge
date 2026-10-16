import { useEffect, useMemo, useRef, useState } from 'react';
import { audio, type NoteEvent } from '../audio/engine';
import { PitchListener } from '../audio/pitch';
import type { Store } from '../engine/progress';
import type { Question } from '../engine/types';
import { useLocale, useT } from '../i18n/react';
import type { Mark } from '../music/notation';
import { keyLabel } from '../music/theory';
import { beatLength } from '../songs/format';
import { songById, type SongDef } from '../songs/library';
import {
  accompanimentEvents,
  countIn,
  keyHintEvents,
  melodyEvents,
  modeOfSong,
  noteTimes,
  randomKey,
  realize,
  solfege,
  songClicks,
  songScore,
  type Realized,
  type Voice,
} from '../songs/realize';
import { recordPractice, recordSing } from '../songs/results';
import { TOLERANCE, centsOff, scoreSinging, type PitchFrame, type SingResult } from '../songs/scoring';
import { Seg } from './Seg';
import { SingPanel } from './SingPanel';
import { Staff } from './Staff';

interface Props {
  song: SongDef;
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
}

// 五线谱渲染器已支持歌词（唱名）：「唱名 + 五线谱」模式不再另外显示简谱行
const STAFF_RENDERS_LYRICS = true;

const LEAD = 0.05; // audio.play 在 currentTime 之后这么久开始
const MIC_LAG = 0.03; // 一帧分析窗（2048 点）的中心约比回调时刻早这么久
const CLARITY = 0.85;

type Phase = 'idle' | 'prep' | 'hint' | 'count' | 'sing' | 'result';
type Mode = 'sing' | 'practice';

/** 按曲目 id 打开（App 按需加载本模块时用）；id 不在曲库里则不渲染。 */
export function SongPracticeById({ id, ...rest }: Omit<Props, 'song'> & { id: string }) {
  const song = songById[id];
  return song ? <SongPractice key={id} song={song} {...rest} /> : null;
}

export function SongPractice({ song, store, update, onBack }: Props) {
  const t = useT();
  const lang = useLocale();
  const { naming, notation } = store.settings;
  const voice: Voice = store.settings.voice;
  const mode = modeOfSong(song);

  // ───── 调与速度 ─────
  const [keyChoice, setKeyChoice] = useState<'random' | number>('random');
  const [tonicPc, setTonicPc] = useState(() => randomKey(song, voice));
  const [bpm, setBpm] = useState(song.bpm);
  const [metronome, setMetronome] = useState(true);
  const [accomp, setAccomp] = useState(false);
  const [loop, setLoop] = useState(false);
  const [giveKey, setGiveKey] = useState(true);
  const [tab, setTab] = useState<Mode>('sing');

  const r: Realized = useMemo(() => realize(song, tonicPc, voice), [song, tonicPc, voice]);
  const names = useMemo(() => solfege(r, naming), [r, naming]);
  const pitchedIdx = useMemo(() => r.midis.flatMap((m, i) => (m === null ? [] : [i])), [r]);

  const showStaff = notation !== 'jianpu';
  const showLine = notation === 'jianpu' || (notation === 'both' && !STAFF_RENDERS_LYRICS);
  const score = useMemo(() => songScore(r, naming, voice, notation !== 'staff'), [r, naming, voice, notation]);

  // ───── 播放与跟唱的共同状态 ─────
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null); // 当前音的下标（含休止）
  const [phase, setPhase] = useState<Phase>('idle');
  const [countN, setCountN] = useState(0);
  const [result, setResult] = useState<SingResult | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [live, setLive] = useState<number | null>(null); // 当前音的实时音分偏差
  const [micError, setMicError] = useState<string | null>(null);
  // 逐音练习
  const [practice, setPractice] = useState<{ run: number; listenAfter: number; firstTry: boolean[] } | null>(null);

  const run = useRef(0);
  const raf = useRef(0);
  const listener = useRef<PitchListener | null>(null);
  const frames = useRef<PitchFrame[]>([]);
  const timing = useRef({ perfStart: 0, collecting: false, cursor: -1 });

  const stopMic = () => {
    listener.current?.stop();
    listener.current = null;
  };
  const halt = () => {
    run.current++;
    cancelAnimationFrame(raf.current);
    audio.stopAll();
    timing.current.collecting = false;
    setPlaying(false);
    setCursor(null);
  };

  useEffect(
    () => () => {
      run.current++;
      cancelAnimationFrame(raf.current);
      audio.stopAll();
      stopMic();
    },
    [],
  );

  /** 换调、音区、速度或模式时停下正在进行的播放或跟唱，清掉上次的结果 */
  const reset = () => {
    halt();
    stopMic();
    setPhase('idle');
    setResult(null);
    setPractice(null);
  };

  const times = useMemo(() => noteTimes(r, bpm), [r, bpm]);
  const total = times[times.length - 1].end;
  const noteAt = (sec: number) => times.findIndex((w) => sec >= w.start && sec < w.end);

  /**
   * 安排一段音频并逐帧回调「相对旋律开始的秒数」（按 AudioContext 时钟）。
   * songAt：旋律在这段音频中的开始时间（秒）。
   */
  const schedule = async (events: NoteEvent[], songAt: number, onFrame: (rel: number) => boolean) => {
    const id = ++run.current;
    cancelAnimationFrame(raf.current);
    await audio.resume();
    if (id !== run.current) return;
    const ctx = audio.context;
    const t0 = ctx.currentTime + LEAD;
    void audio.play(events);
    const lat = ctx.outputLatency || ctx.baseLatency || 0;
    // 旋律开始对应的 performance.now()（扬声器真正发声的时刻）
    timing.current.perfStart = performance.now() + (t0 + songAt - ctx.currentTime + lat) * 1000;
    const loopFn = () => {
      if (id !== run.current) return;
      const rel = ctx.currentTime - lat - t0 - songAt;
      if (!onFrame(rel)) return;
      raf.current = requestAnimationFrame(loopFn);
    };
    raf.current = requestAnimationFrame(loopFn);
  };

  const extras = (offset: number) => [
    ...(metronome ? songClicks(r, bpm, offset) : []),
    ...(accomp ? accompanimentEvents(r, bpm, offset) : []),
  ];

  // ───── 播放 ─────
  const play = () => {
    setResult(null);
    setPhase('idle');
    const ci = metronome ? countIn(song.meter, bpm) : { events: [], dur: 0 };
    const events = [...ci.events, ...melodyEvents(r, bpm, ci.dur), ...extras(ci.dur)];
    setPlaying(true);
    void schedule(events, ci.dur, (rel) => {
      if (rel >= total + 0.25) {
        if (loop) {
          play();
          return false;
        }
        setPlaying(false);
        setCursor(null);
        return false;
      }
      const i = rel >= 0 ? noteAt(rel) : -1;
      setCursor(i >= 0 ? i : null);
      return true;
    });
  };

  const playKey = () => {
    halt();
    void audio.play(keyHintEvents(r).events);
  };

  // ───── 跟唱（带节拍，麦克风评分） ─────
  const startSing = async () => {
    halt();
    setResult(null);
    setNewBest(false);
    setMicError(null);
    setPhase('prep');
    const id = run.current;
    if (!listener.current) {
      const l = new PitchListener();
      try {
        await l.start((p) => {
          const tm = timing.current;
          if (!tm.collecting) return;
          const now = performance.now();
          const sec = (now - tm.perfStart) / 1000 - MIC_LAG;
          const midi = p && p.clarity >= CLARITY ? p.midi : null;
          frames.current.push({ t: sec, midi });
          const i = tm.cursor;
          const target = i >= 0 ? r.midis[i] : null;
          setLive(midi !== null && target != null ? centsOff(midi, target) : null);
        });
      } catch {
        setMicError(t('sing.micError'));
        setPhase('idle');
        return;
      }
      if (id !== run.current) {
        l.stop();
        return;
      }
      listener.current = l;
    }
    const hint = giveKey ? keyHintEvents(r) : { events: [], dur: 0 };
    const ci = countIn(song.meter, bpm, hint.dur);
    const songAt = hint.dur + ci.dur;
    frames.current = [];
    timing.current.cursor = -1;
    const beat = 60 / bpm;
    void schedule([...hint.events, ...ci.events, ...extras(songAt)], songAt, (rel) => {
      const tm = timing.current;
      tm.collecting = rel > -ci.dur;
      if (rel < -ci.dur) {
        setPhase('hint');
        return true;
      }
      if (rel < 0) {
        setPhase('count');
        setCountN(Math.min(ci.events.length, Math.floor((rel + ci.dur) / beat) + 1));
        return true;
      }
      if (rel >= total + 0.2) {
        finishSing();
        return false;
      }
      setPhase('sing');
      const i = noteAt(rel);
      tm.cursor = i;
      setCursor(i >= 0 ? i : null);
      return true;
    });
  };

  const finishSing = () => {
    timing.current.collecting = false;
    stopMic();
    audio.stopAll();
    setCursor(null);
    setLive(null);
    const res = scoreSinging(
      r.notes.map((_, i) => ({ ...times[i], midi: r.midis[i] })),
      frames.current,
    );
    const prev = store.songs?.[song.id];
    setNewBest(!!prev && prev.attempts > 0 && res.accuracy > prev.best);
    update((s) => recordSing(s, song.id, res.accuracy));
    setResult(res);
    setPhase('result');
  };

  const stopSing = () => {
    halt();
    stopMic();
    setLive(null);
    setPhase('idle');
  };

  // ───── 逐音练习（复用视唱练习的唱准判定） ─────
  const startPractice = async () => {
    halt();
    const hint = keyHintEvents(r);
    void audio.play(hint.events);
    setPractice((p) => ({ run: (p?.run ?? 0) + 1, listenAfter: performance.now() + hint.dur * 1000, firstTry: [] }));
  };
  const practiceQ: Question = useMemo(
    () => ({
      item: song.id,
      events: [],
      choices: [],
      answer: [],
      prompt: '',
      sing: { targets: pitchedIdx.map((i) => r.midis[i]!), display: pitchedIdx.map((i) => names[i]), showDisplay: true },
    }),
    [song.id, pitchedIdx, r, names],
  );
  const practiceDone = !!practice && practice.firstTry.length >= pitchedIdx.length;
  const onPracticeStep = (i: number, firstTry: boolean) =>
    setPractice((p) => {
      if (!p) return p;
      const ft = [...p.firstTry];
      ft[i] = firstTry;
      return { ...p, firstTry: ft };
    });
  // 唱完一遍记一次（每轮只记一次）
  const recorded = useRef(0);
  useEffect(() => {
    if (practiceDone && practice && recorded.current !== practice.run) {
      recorded.current = practice.run;
      update((s) => recordPractice(s, song.id));
    }
  }, [practiceDone, practice, update, song.id]);

  // ───── 谱面高亮 ─────
  const marks: Mark[] = r.notes.map((_, i) => {
    if (tab === 'practice' && practice) {
      const k = pitchedIdx.indexOf(i);
      if (k < 0) return null;
      if (k < practice.firstTry.length) return practice.firstTry[k] ? 'ok' : 'bad';
      return k === practice.firstTry.length ? 'cur' : null;
    }
    if (result) {
      const ok = result.notes[i].ok;
      return ok === null ? null : ok ? 'ok' : 'bad';
    }
    return i === cursor ? 'cur' : null;
  });

  // 五线谱上加底色并滚动到可见处的音
  const current =
    tab === 'practice' && practice
      ? pitchedIdx[practice.firstTry.length]
      : result
        ? undefined
        : (cursor ?? undefined);

  const best = store.songs?.[song.id];
  const busy = phase === 'prep' || phase === 'hint' || phase === 'count' || phase === 'sing';
  const keyName = keyLabel(tonicPc, mode);
  const outOfRange = r.overflow;
  const beatSym = beatLength(song.meter) === 1.5 ? '♩.' : song.meter[1] === 2 ? '𝅗𝅥' : '♩';
  const singingIdx = cursor ?? -1;
  const needle = live === null ? 0 : Math.max(-100, Math.min(100, live));

  return (
    <main className="page song-page">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{song.title[lang]}</h1>
          <p className="muted">{t('song.levelSource', { level: song.level, source: song.source[lang] })}</p>
        </div>
        <span className="topbar-spacer" />
      </header>

      <section className="panel song-controls">
        <div className="song-control-row">
          <div className="field">
            <label htmlFor="song-key">{t('song.key')}</label>
            <div className="song-key">
              <select
                id="song-key"
                value={keyChoice === 'random' ? 'random' : String(keyChoice)}
                disabled={busy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'random') {
                    setKeyChoice('random');
                    reset();
                    setTonicPc(randomKey(song, voice));
                  } else {
                    setKeyChoice(Number(v));
                    reset();
                    setTonicPc(Number(v));
                  }
                }}
              >
                <option value="random">
                  {t('song.keyRandom')}
                  {keyChoice === 'random' ? ` (${keyName})` : ''}
                </option>
                {[...Array(12).keys()].map((pc) => (
                  <option key={pc} value={pc}>
                    {keyLabel(pc, mode)}
                  </option>
                ))}
              </select>
              {keyChoice === 'random' && (
                <button className="ghost" disabled={busy} onClick={() => {
                    reset();
                    setTonicPc(randomKey(song, voice));
                  }}>
                  {t('song.reroll')}
                </button>
              )}
            </div>
          </div>
          <div className="field">
            <label>{t('song.voice')}</label>
            <Seg
              value={voice}
              options={[
                ['low', t('settings.voice.low')],
                ['high', t('settings.voice.high')],
              ]}
              onChange={(v) => {
                if (busy) return;
                reset();
                update((s) => (s.settings.voice = v));
                if (keyChoice === 'random') setTonicPc(randomKey(song, v));
              }}
            />
          </div>
        </div>
        {outOfRange > 0 && <p className="song-warn">{t('song.outOfRange', { n: outOfRange })}</p>}
        <div className="field">
          <label htmlFor="song-tempo">
            {t('song.tempo')} <span className="muted">{t('song.bpm', { beat: beatSym, bpm })}</span>
          </label>
          <input
            id="song-tempo"
            type="range"
            min={30}
            max={160}
            step={2}
            value={bpm}
            disabled={busy}
            onChange={(e) => {
              reset();
              setBpm(Number(e.target.value));
            }}
          />
        </div>
        <div className="song-toggles">
          <label>
            <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} /> {t('song.metronome')}
          </label>
          <label>
            <input type="checkbox" checked={accomp} onChange={(e) => setAccomp(e.target.checked)} /> {t('song.accomp')}
          </label>
          <label>
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> {t('song.loop')}
          </label>
        </div>
      </section>

      <section className="song-sheet">
        {showStaff && (
          <div className="song-staff">
            <Staff score={score} marks={marks} current={current} />
          </div>
        )}
        {showLine && <JianpuLine r={r} names={names} marks={marks} label={t('song.notation')} />}
      </section>

      <div className="play-row">
        {playing ? (
          <button onClick={halt}>{t('song.stop')}</button>
        ) : (
          <button onClick={play} disabled={busy}>
            {t('song.play')}
          </button>
        )}
        <button onClick={playKey} disabled={busy}>
          {t('song.keyHint')}
        </button>
      </div>

      <section className="panel song-sing">
        <Seg
          value={tab}
          options={[
            ['sing', t('song.modeSing')],
            ['practice', t('song.modePractice')],
          ]}
          onChange={(v) => {
            if (busy) return;
            reset();
            setTab(v);
          }}
        />

        {tab === 'sing' && (
          <>
            {phase === 'idle' && (
              <>
                <p className="muted">{t('song.singIntro')}</p>
                <label className="song-inline">
                  <input type="checkbox" checked={giveKey} onChange={(e) => setGiveKey(e.target.checked)} /> {t('song.giveKey')}
                </label>
                {best && best.attempts > 0 && (
                  <p className="muted">{t('song.history', { n: best.attempts, best: best.best })}</p>
                )}
                {micError && <p className="error">{micError}</p>}
                <button className="primary big" onClick={() => void startSing()} disabled={playing}>
                  {t('song.startSing')}
                </button>
              </>
            )}
            {busy && (
              <>
                <p className="song-phase" aria-live="polite">
                  {phase === 'prep'
                    ? t('song.phase.prep')
                    : phase === 'hint'
                      ? t('song.phase.hint')
                      : phase === 'count'
                        ? t('song.phase.count', { n: countN })
                        : t('song.phase.sing', {
                            i: Math.max(1, pitchedIdx.filter((i) => i <= singingIdx).length),
                            n: pitchedIdx.length,
                          })}
                </p>
                {phase === 'sing' && (
                  <>
                    <div className="tuner" title={t('sing.tunerTitle')}>
                      <div className="tuner-zone" />
                      <div
                        className={`tuner-needle ${live !== null && Math.abs(live) <= TOLERANCE ? 'in' : ''}`}
                        style={{ left: `${50 + needle / 2}%`, opacity: live === null ? 0.25 : 1 }}
                      />
                    </div>
                    <div className="tuner-read">
                      <span>{singingIdx >= 0 && r.midis[singingIdx] !== null ? names[singingIdx] : '…'}</span>
                    </div>
                  </>
                )}
                <button onClick={stopSing}>{t('song.stop')}</button>
              </>
            )}
            {phase === 'result' && result && (
              <div className="song-result">
                <div className="summary-hero">
                  <span className="song-result-label">{t('song.accuracy')}</span>
                  <span className="summary-big">{result.accuracy}%</span>
                  <span className="muted">
                    {t('song.resultSub', { ok: result.correct, n: result.total, best: store.songs?.[song.id]?.best ?? result.accuracy })}
                  </span>
                  {newBest && <span className="goal-cheer">{t('song.newBest')}</span>}
                </div>
                <div className="song-cents" title={t('song.centsTitle')}>
                  <p className="muted">{t('song.centsTitle')}</p>
                  <ol>
                    {pitchedIdx.map((i) => {
                      const n = result.notes[i];
                      return (
                        <li key={i} className={n.ok ? 'ok' : 'bad'}>
                          <span className="song-cents-name">{names[i]}</span>
                          <span className="song-cents-val">
                            {n.cents === null ? t('song.silent') : `${n.cents > 0 ? '+' : ''}${n.cents}`}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <button className="primary big" onClick={() => void startSing()}>
                  {t('song.again')}
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'practice' && (
          <>
            {!practice && (
              <>
                <p className="muted">{t('song.practiceIntro')}</p>
                <button className="primary big" onClick={() => void startPractice()} disabled={playing}>
                  {t('song.startPractice')}
                </button>
              </>
            )}
            {practice && (
              <SingPanel
                key={`${practice.run}:${tonicPc}`}
                question={practiceQ}
                naming={naming}
                notation={notation}
                listenAfter={practice.listenAfter}
                onStep={onPracticeStep}
                done={practiceDone}
              />
            )}
            {practiceDone && (
              <div className="song-result">
                <p className="song-practice-done">
                  {t('song.practiceDone', { ok: practice!.firstTry.filter(Boolean).length, n: pitchedIdx.length })}
                </p>
                <button className="primary big" onClick={() => void startPractice()}>
                  {t('song.practiceAgain')}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

/** 简谱 / 唱名行：按小节排列，短于一拍的音加下划线，延长的拍写「–」，附点写「·」。 */
function JianpuLine({ r, names, marks, label }: { r: Realized; names: string[]; marks: Mark[]; label: string }) {
  const bars: number[][] = [];
  r.notes.forEach((n, i) => (bars[n.bar] ??= []).push(i));
  return (
    <div className="jianpu" role="group" aria-label={label}>
      {bars.map((idx, b) => (
        <span key={b} className="jp-bar">
          {idx.map((i) => {
            const n = r.notes[i];
            const lines = n.dur < 0.5 - 1e-9 ? 2 : n.dur < 1 - 1e-9 ? 1 : 0;
            const dotted = [0.75, 1.5].includes(n.dur) || (n.dur > 1 && n.dur % 1 === 0.5);
            const dashes = n.dur >= 2 ? Math.floor(n.dur) - 1 : 0;
            const m = marks[i];
            return (
              <span key={i} className={`jp-note ${m ? `jp-${m}` : ''}`}>
                <span className={`jp-name u${lines}`}>{r.midis[i] === null ? '0' : names[i]}</span>
                {dotted && <span className="jp-dot">·</span>}
                {dashes > 0 && <span className="jp-dash">{' –'.repeat(dashes)}</span>}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
