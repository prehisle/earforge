import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { audio, type NoteEvent } from '../audio/engine';
import {
  EXAM_PRESETS,
  buildExam,
  canPlay,
  drillTargets,
  examGrade,
  initRun,
  playsLeft,
  presetCount,
  runReducer,
  scoreExam,
  secsLeft,
  sectionItems,
  sectionOptions,
  weakItems,
  type ExamPreset,
  type ExamQuestion,
  type ExamScore,
  type RunState,
} from '../engine/exam';
import { addExamRecord, presetHistory, type ExamRecord } from '../engine/examHistory';
import { getProgress, record, type Store } from '../engine/progress';
import type { Question } from '../engine/types';
import { exerciseById } from '../exercises';
import { eventsEnd, shiftEvents } from '../exercises/common';
import { joinList } from '../i18n';
import { useLocale, useT } from '../i18n/react';
import { RhythmNotation } from './RhythmNotation';
import { Staff } from './Staff';

const GAP = 0.45; // 前奏与题目之间的间隔（秒），同练习页

/** e2e 测试钩子：缩短时限（秒），并在 __EARFORGE_TEST__ 为真时公开本卷答案 */
interface TestHook {
  __EARFORGE_EXAM_SECONDS__?: number;
  __EARFORGE_TEST__?: boolean;
  __earforgeExam?: { answer: string[]; choices: string[] }[];
}
const hook = globalThis as TestHook;

/** 题目的完整声音：前奏 + 题目 */
function questionEvents(q: Question): NoteEvent[] {
  return q.prelude ? [...q.prelude, ...shiftEvents(q.events, eventsEnd(q.prelude) + GAP)] : q.events;
}

const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

type View =
  | { kind: 'list' }
  | { kind: 'intro'; preset: ExamPreset }
  | { kind: 'run'; preset: ExamPreset; questions: ExamQuestion[]; limit: number | null; round: number }
  | { kind: 'result'; preset: ExamPreset; questions: ExamQuestion[]; run: RunState; score: ExamScore };

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
  /** 专练指定考点（同统计页） */
  onFocus(id: string, items: string[]): void;
}

/** 模拟考试：试卷列表 → 说明 → 答题（无反馈）→ 成绩与回顾。 */
export function ExamPage({ store, update, onBack, onFocus }: Props) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const round = useRef(0);

  const start = (preset: ExamPreset, timed: boolean) => {
    const questions = buildExam(preset, store.settings);
    if (hook.__EARFORGE_TEST__)
      hook.__earforgeExam = questions.map((x) => ({ answer: x.q.answer, choices: x.q.choices.map((c) => c.id) }));
    const limit = timed ? (hook.__EARFORGE_EXAM_SECONDS__ ?? preset.minutes * 60) : null;
    setView({ kind: 'run', preset, questions, limit, round: ++round.current });
    window.scrollTo(0, 0);
  };

  /** 交卷：保存成绩；作答过的步骤计入考点统计与每日题数（未作答的不计） */
  const submit = (preset: ExamPreset, questions: ExamQuestion[], run: RunState) => {
    const score = scoreExam(preset, questions, run.answers);
    const rec: ExamRecord = {
      preset: preset.id,
      at: Date.now(),
      score: score.total,
      sections: score.sections.map((s) => s.pct),
      timed: run.deadline !== null,
      secs: Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1000),
    };
    if (run.timedOut) rec.timedOut = true;
    update((s) => {
      s.exams = addExamRecord(s.exams ?? [], rec);
      questions.forEach((x, i) => {
        const p = getProgress(s, x.ex);
        x.q.answer.forEach((a, k) => {
          const g = run.answers[i][k];
          if (g !== null) record(s, p, x.q.stepItems?.[k] ?? x.q.item, g === a);
        });
      });
    });
    audio.stopAll();
    setView({ kind: 'result', preset, questions, run, score });
    window.scrollTo(0, 0);
  };

  if (view.kind === 'run')
    return (
      <ExamRun
        key={view.round}
        preset={view.preset}
        questions={view.questions}
        limit={view.limit}
        onExit={() => setView({ kind: 'intro', preset: view.preset })}
        onDone={(run) => submit(view.preset, view.questions, run)}
      />
    );
  if (view.kind === 'result')
    return (
      <ExamResult
        store={store}
        preset={view.preset}
        questions={view.questions}
        run={view.run}
        score={view.score}
        onList={() => setView({ kind: 'list' })}
        onAgain={() => setView({ kind: 'intro', preset: view.preset })}
        onFocus={onFocus}
      />
    );
  if (view.kind === 'intro')
    return (
      <ExamIntro
        store={store}
        preset={view.preset}
        onBack={() => setView({ kind: 'list' })}
        onStart={(timed) => start(view.preset, timed)}
      />
    );
  return <ExamList store={store} onBack={onBack} onPick={(preset) => setView({ kind: 'intro', preset })} />;
}

// ───── 试卷列表 ─────

function ExamList({ store, onBack, onPick }: { store: Store; onBack(): void; onPick(p: ExamPreset): void }) {
  const t = useT();
  return (
    <main className="page exam">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{t('exam.title')}</h1>
          <p className="muted">{t('exam.listSub')}</p>
        </div>
        <span className="topbar-spacer" />
      </header>
      <div className="exam-presets">
        {EXAM_PRESETS.map((p) => {
          const h = presetHistory(store.exams, p.id);
          return (
            <button key={p.id} className="card exam-preset" onClick={() => onPick(p)}>
              <span className="card-icon">{p.icon}</span>
              <span className="card-body">
                <span className="card-title">{t(p.title)}</span>
                <span className="card-sub">{t(p.desc)}</span>
                <span className="card-meta">
                  {t('exam.meta', { n: presetCount(p), s: p.sections.length, m: p.minutes })}
                </span>
                <span className="card-meta">
                  {h.best === null ? t('exam.never') : t('exam.bestMeta', { best: h.best, n: h.attempts.length })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="foot muted">{t('exam.disclaimer')}</p>
    </main>
  );
}

/** 首页入口卡片 */
export function ExamCard({ store, onOpen }: { store: Store; onOpen(): void }) {
  const t = useT();
  const list = store.exams ?? [];
  const last = list[list.length - 1];
  return (
    <button className="card" onClick={onOpen}>
      <span className="card-icon">📝</span>
      <span className="card-body">
        <span className="card-title">{t('group.exam')}</span>
        <span className="card-sub">{t('exam.cardSub', { n: EXAM_PRESETS.length })}</span>
        <span className="card-meta">
          {last ? t('exam.cardLast', { name: t(EXAM_PRESETS.find((p) => p.id === last.preset)?.title ?? 'exam.title'), score: last.score }) : t('exam.never')}
        </span>
      </span>
    </button>
  );
}

// ───── 考前说明 ─────

function ExamIntro({
  store,
  preset,
  onBack,
  onStart,
}: {
  store: Store;
  preset: ExamPreset;
  onBack(): void;
  onStart(timed: boolean): void;
}) {
  const t = useT();
  const [timed, setTimed] = useState(true);
  const h = presetHistory(store.exams, preset.id);

  return (
    <main className="page exam">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>
            {preset.icon} {t(preset.title)}
          </h1>
          <p className="muted">{t('exam.meta', { n: presetCount(preset), s: preset.sections.length, m: preset.minutes })}</p>
        </div>
        <span className="topbar-spacer" />
      </header>

      <p className="exam-desc">{t(preset.desc)}</p>

      <section className="panel">
        <h2 className="chart-title">{t('exam.sections')}</h2>
        <ol className="exam-sections">
          {preset.sections.map((sec, i) => {
            const ex = exerciseById[sec.exId];
            const opts = sectionOptions(sec);
            const fixed = (ex.options ?? [])
              .filter((o) => o.id in sec.options)
              .map((o) => o.values.find((v) => v.id === opts[o.id])?.label)
              .filter(Boolean);
            return (
              <li key={i}>
                <div className="exam-sec-head">
                  <strong>
                    {ex.icon} {t(sec.title)}
                  </strong>
                  <span className="muted">{t('exam.secMeta', { n: sec.count, pts: sec.points })}</span>
                </div>
                <p className="muted exam-sec-items">
                  {joinList(sectionItems(sec).map((it) => ex.itemLabel(it, store.settings)))}
                  {fixed.length > 0 && ` · ${fixed.join(' · ')}`}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel">
        <h2 className="chart-title">{t('exam.rules')}</h2>
        <ul className="exam-rules">
          <li>{t('exam.rule.noFeedback')}</li>
          <li>{t('exam.rule.replays', { n: preset.replays })}</li>
          <li>{t('exam.rule.steps')}</li>
          <li>{t('exam.rule.score')}</li>
          <li>{t('exam.rule.stats')}</li>
        </ul>
        <label className="exam-timed">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
          {t('exam.timed', { m: preset.minutes })}
        </label>
      </section>

      <div className="start exam-start">
        <button className="primary big" onClick={() => onStart(timed)}>
          {t('exam.start')}
        </button>
      </div>

      <History preset={preset} attempts={h.attempts} best={h.best} />
    </main>
  );
}

function History({ preset, attempts, best }: { preset: ExamPreset; attempts: ExamRecord[]; best: number | null }) {
  const t = useT();
  const locale = useLocale();
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );
  if (!attempts.length) return null;
  const recent = attempts.slice(-8).reverse();
  return (
    <section className="panel exam-history">
      <div className="panel-head">
        <h2 className="chart-title">{t('exam.history')}</h2>
        <span className="muted">{t('exam.historyMeta', { n: attempts.length, best: best ?? 0 })}</span>
      </div>
      <ul className="mastery">
        {recent.map((r) => (
          <li key={r.at} title={preset.sections.map((s, i) => `${t(s.title)} ${r.sections[i] ?? 0}%`).join('\n')}>
            <span className="mastery-label">
              {fmt.format(r.at)}
              {r.score === best && <span className="exam-best">{t('exam.bestTag')}</span>}
            </span>
            <span className="meter">
              <span className="meter-fill" style={{ width: `${r.score}%` }} />
            </span>
            <span className="mastery-val">
              {r.score}
              {r.timedOut ? ' ⏱' : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───── 答题 ─────

function ExamRun({
  preset,
  questions,
  limit,
  onExit,
  onDone,
}: {
  preset: ExamPreset;
  questions: ExamQuestion[];
  limit: number | null;
  onExit(): void;
  onDone(run: RunState): void;
}) {
  const t = useT();
  const [run, dispatch] = useReducer(
    runReducer,
    null,
    () => initRun(questions.map((x) => x.q.answer.length), preset.replays, limit, Date.now()),
  );
  const [now, setNow] = useState(() => Date.now());
  const [confirmExit, setConfirmExit] = useState(false);
  const autoPlayed = useRef(-1);
  const reported = useRef(false);
  const cur = questions[run.idx];
  const q = cur.q;
  const sec = preset.sections[cur.section];
  const answers = run.answers[run.idx];

  // 计时
  useEffect(() => {
    if (run.deadline === null) return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      dispatch({ type: 'tick', now: n });
    };
    const id = window.setInterval(tick, 250);
    // 后台标签页的定时器会被大幅节流：切回来时立即按墙上时间检查一次，过了时限就先交卷，不能再作答
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [run.deadline]);

  // 交卷
  useEffect(() => {
    if (run.status === 'done' && !reported.current) {
      reported.current = true;
      onDone(run);
    }
  }, [run, onDone]);

  const play = () => {
    if (!canPlay(run)) return;
    dispatch({ type: 'play' });
    void audio.play(questionEvents(q));
  };

  // 每题出现时自动播放一次（计入播放次数）；真正播放时才记下题号：
  // StrictMode 的模拟卸载会清掉第一次的定时器，若先记题号，重新挂载时就不再自动播放
  useEffect(() => {
    if (autoPlayed.current === run.idx) return;
    const id = window.setTimeout(() => {
      autoPlayed.current = run.idx;
      dispatch({ type: 'play' });
      void audio.play(questionEvents(questions[run.idx].q));
    }, 150);
    return () => window.clearTimeout(id);
  }, [run.idx, questions]);

  useEffect(() => () => audio.stopAll(), []);

  const next = () => dispatch({ type: 'next', now: Date.now() });

  // 键盘：数字作答、空格重听、回车下一题
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      // Ctrl/⌘/Alt + 数字是浏览器快捷键（切换标签页），不作答
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // 长按的自动重复：回车会连续跳过多题直至交卷，空格会用光重听次数
      if (e.repeat && /^(Enter| |[1-9])$/.test(e.key)) {
        e.preventDefault();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        play();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
        const c = q.choices[Number(e.key) - 1];
        if (c) dispatch({ type: 'answer', id: c.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!confirmExit) return;
    const id = window.setTimeout(() => setConfirmExit(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirmExit]);

  const left = secsLeft(run, now);
  const secIdx = questions.filter((x, i) => x.section === cur.section && i <= run.idx).length;
  const last = run.idx === questions.length - 1;
  const missing = answers.filter((a) => a === null).length;
  const label = (id: string | null) => {
    if (id === null) return '?';
    const i = q.choices.findIndex((c) => c.id === id);
    return q.choices[i]?.rhythm ? t('quiz.rhythmN', { n: i + 1 }) : (q.choices[i]?.label ?? id);
  };

  return (
    <main className="page practice exam">
      <header className="topbar">
        <button
          className={confirmExit ? 'ghost danger' : 'ghost'}
          onClick={() => (confirmExit ? onExit() : setConfirmExit(true))}
          aria-label={t('common.backAria')}
        >
          {confirmExit ? t('exam.exitConfirm') : t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{t(preset.title)}</h1>
          <p className="muted">{t('exam.progress', { i: run.idx + 1, n: questions.length })}</p>
        </div>
        {left === null ? (
          <span className="topbar-spacer" />
        ) : (
          <span className={left <= 60 ? 'exam-timer low' : 'exam-timer'} role="timer" aria-label={t('exam.timeLeft')}>
            ⏱ {mmss(left)}
          </span>
        )}
      </header>

      <div className="meter mix-progress" aria-hidden>
        <span className="meter-fill" style={{ width: `${(run.idx / questions.length) * 100}%` }} />
      </div>

      <section className="question">
        <p className="q-module exam-sec-label">
          <span className="q-module-icon">{cur.ex.icon}</span>
          {t('exam.part', { i: cur.section + 1, name: t(sec.title) })}
          <span className="muted"> · {t('exam.partProgress', { i: secIdx, n: sec.count })}</span>
        </p>
        <p className="prompt">{q.prompt}</p>

        <div className="play-row">
          <button className="primary" onClick={play} disabled={!canPlay(run)}>
            {t('quiz.replay')} <kbd>{t('common.space')}</kbd>
          </button>
          <span className="muted exam-plays">{t('exam.playsLeft', { n: playsLeft(run) })}</span>
        </div>

        {q.answer.length > 1 && (
          <div className="slots">
            {answers.map((a, i) => (
              <button
                key={i}
                className={`slot exam-slot${i === run.cursor ? ' cur' : ''}${a !== null ? ' filled' : ''}`}
                onClick={() => dispatch({ type: 'cursor', step: i })}
                // 读屏也要读出这一步填了什么（aria-label 会覆盖按钮里的文字）
                aria-label={`${t('quiz.step', { n: i + 1 })}: ${a === null ? t('exam.blank') : label(a)}`}
                aria-current={i === run.cursor ? 'step' : undefined}
              >
                {label(a)}
              </button>
            ))}
          </div>
        )}

        <div className={`choices n${Math.min(q.choices.length, 8)} exam-choices`}>
          {q.choices.map((c, i) => (
            <button
              key={c.id}
              className={answers[run.cursor] === c.id ? 'choice picked' : 'choice'}
              aria-pressed={answers[run.cursor] === c.id}
              onClick={() => dispatch({ type: 'answer', id: c.id })}
            >
              {c.rhythm ? <RhythmNotation rhythm={c.rhythm} label={c.label} /> : <span className="choice-label">{c.label}</span>}
              {c.sub && <span className="choice-sub">{c.sub}</span>}
              {i < 9 && <kbd className="choice-key">{i + 1}</kbd>}
            </button>
          ))}
        </div>

        <div className="exam-next">
          {missing > 0 && <span className="muted">{t('exam.missing', { n: missing })}</span>}
          <button className="primary" onClick={next}>
            {last ? t('exam.submit') : t('quiz.next')} <kbd>{t('common.enter')}</kbd>
          </button>
        </div>
      </section>
    </main>
  );
}

// ───── 成绩 ─────

function ExamResult({
  store,
  preset,
  questions,
  run,
  score,
  onList,
  onAgain,
  onFocus,
}: {
  store: Store;
  preset: ExamPreset;
  questions: ExamQuestion[];
  run: RunState;
  score: ExamScore;
  onList(): void;
  onAgain(): void;
  onFocus(id: string, items: string[]): void;
}) {
  const t = useT();
  const grade = examGrade(score.total);
  const secs = Math.round(((run.endedAt ?? run.startedAt) - run.startedAt) / 1000);
  const weak = weakItems(score.items).slice(0, 6);
  const drills = drillTargets(preset, questions, run.answers, score);
  const h = presetHistory(store.exams, preset.id);

  return (
    <main className="page exam">
      <header className="topbar">
        <button className="ghost" onClick={onList} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{t(preset.title)}</h1>
          <p className="muted">{t('exam.resultSub')}</p>
        </div>
        <span className="topbar-spacer" />
      </header>

      <section className="summary">
        <div className="summary-hero">
          <span className="summary-big exam-total">
            {score.total}
            <span className="exam-of">/100</span>
          </span>
          <span className={`exam-grade ${grade}`}>{t(`exam.grade.${grade}`)}</span>
          <span className="muted">
            {t('exam.used', { time: mmss(secs) })}
            {run.deadline !== null && ` · ${t('exam.limit', { m: Math.max(1, Math.round((run.deadline - run.startedAt) / 60000)) })}`}
          </span>
          {run.timedOut && <span className="summary-goal exam-timeout">{t('exam.timedOut')}</span>}
          {h.best !== null && h.attempts.length > 1 && (
            <span className="muted">{t('exam.historyMeta', { n: h.attempts.length, best: h.best })}</span>
          )}
        </div>

        <div className="panel">
          <h2 className="chart-title">{t('exam.bySection')}</h2>
          <ul className="mastery exam-sec-scores">
            {preset.sections.map((sec, i) => {
              const s = score.sections[i];
              return (
                <li key={i}>
                  <span className="mastery-label">
                    {exerciseById[sec.exId].icon} {t(sec.title)}
                  </span>
                  <span className="meter">
                    <span className="meter-fill" style={{ width: `${s.pct}%` }} />
                  </span>
                  <span className="mastery-val">
                    {s.got}/{s.max}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {weak.length > 0 && (
          <div className="panel">
            <h2 className="chart-title">{t('exam.weak')}</h2>
            <ol className="weak-list">
              {weak.map((w, i) => {
                const ex = exerciseById[w.exId];
                return (
                  <li key={`${w.exId}:${w.item}`}>
                    <span className="weak-rank">{i + 1}</span>
                    <strong>{ex.itemLabel(w.item, store.settings)}</strong>
                    <span className="muted">{ex.title}</span>
                    <span className="weak-val">{t('exam.weakVal', { c: w.c, n: w.n })}</span>
                  </li>
                );
              })}
            </ol>
            <div className="exam-drills">
              {drills.map((d) => {
                const ex = exerciseById[d.exId];
                return (
                  <button
                    key={d.exId}
                    className="weak-btn"
                    onClick={() => onFocus(d.exId, d.items)}
                    title={t('stats.drillTitle', { items: joinList(d.items.map((it) => ex.itemLabel(it, store.settings))) })}
                  >
                    {t('exam.drill', { name: ex.title })}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="panel">
          <h2 className="chart-title">{t('exam.review')}</h2>
          <p className="muted exam-review-hint">{t('exam.reviewHint')}</p>
          <ol className="exam-review">
            {questions.map((x, i) => (
              <ReviewItem key={i} n={i + 1} store={store} x={x} given={run.answers[i]} graded={score.graded[i]} />
            ))}
          </ol>
        </div>

        <History preset={preset} attempts={h.attempts} best={h.best} />

        <div className="summary-actions">
          <button onClick={onList}>{t('exam.toList')}</button>
          <button className="primary" onClick={onAgain}>
            {t('exam.again')}
          </button>
        </div>
      </section>
    </main>
  );
}

function ReviewItem({
  n,
  store,
  x,
  given,
  graded,
}: {
  n: number;
  store: Store;
  x: ExamQuestion;
  given: (string | null)[];
  graded: { steps: boolean[]; score: number };
}) {
  const t = useT();
  const { q } = x;
  const firstBad = graded.steps.findIndex((ok) => !ok);
  const [step, setStep] = useState(firstBad >= 0 ? firstBad : 0);
  const multi = q.answer.length > 1;
  const choice = (id: string | null) => {
    const i = id === null ? -1 : q.choices.findIndex((c) => c.id === id);
    return { c: q.choices[i], i };
  };
  const name = (id: string | null) => {
    if (id === null) return t('exam.blank');
    const { c, i } = choice(id);
    return c?.rhythm ? t('quiz.rhythmN', { n: i + 1 }) : (c?.label ?? id);
  };
  const state = graded.score === 1 ? 'ok' : graded.score > 0 ? 'part' : 'bad';
  const mine = given[step];
  const right = q.answer[step];
  const playChoice = (id: string) => q.choiceEvents && void audio.play(q.choiceEvents(id, step));

  return (
    <li className={`exam-rv ${state}`}>
      <details>
        <summary>
          <span className="exam-rv-mark">{state === 'ok' ? '✓' : state === 'part' ? '◐' : '✗'}</span>
          <span className="exam-rv-n">{n}.</span>
          <span className="exam-rv-title">
            {x.ex.icon} {multi ? q.prompt : t('exam.rvLine', { yours: name(given[0]), right: name(q.answer[0]) })}
          </span>
          {multi && (
            <span className="exam-rv-score">
              {graded.steps.filter(Boolean).length}/{graded.steps.length}
            </span>
          )}
        </summary>
        <div className="exam-rv-body">
          {!multi && <p className="muted">{q.prompt}</p>}
          {multi && (
            <div className="exam-rv-grid">
              <span className="muted">{t('exam.yoursRow')}</span>
              <div className="slots">
                {given.map((g, i) => (
                  <button
                    key={i}
                    className={`slot pick ${graded.steps[i] ? 'ok' : 'fix'}${i === step ? ' sel' : ''}`}
                    onClick={() => setStep(i)}
                    title={t('quiz.slotPick')}
                  >
                    {g === null ? '—' : name(g)}
                  </button>
                ))}
              </div>
              <span className="muted">{t('exam.rightRow')}</span>
              <div className="slots">
                {q.answer.map((a, i) => (
                  <button key={i} className={`slot pick${i === step ? ' sel' : ''}`} onClick={() => setStep(i)}>
                    {name(a)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!multi && choice(right).c?.rhythm && (
            <div className="exam-rv-rhythms">
              {mine !== null && mine !== right && choice(mine).c?.rhythm && (
                <figure>
                  <figcaption className="muted">{t('exam.yoursRow')}</figcaption>
                  <RhythmNotation rhythm={choice(mine).c!.rhythm!} />
                </figure>
              )}
              <figure>
                <figcaption className="muted">{t('exam.rightRow')}</figcaption>
                <RhythmNotation rhythm={choice(right).c!.rhythm!} />
              </figure>
            </div>
          )}
          {q.explain && <p className="exam-rv-explain">{q.explain}</p>}
          <div className="compare-row">
            <button onClick={() => void audio.play(questionEvents(q))}>{t('exam.playQuestion')}</button>
            {q.choiceEvents && mine !== null && mine !== right && (
              <button onClick={() => playChoice(mine)}>{t('quiz.yours', { name: name(mine) })}</button>
            )}
            {q.choiceEvents && (
              <button onClick={() => playChoice(right)}>{t('quiz.correctAnswer', { name: name(right) })}</button>
            )}
          </div>
          {q.score && store.settings.notation !== 'jianpu' && (
            <div className="feedback-staff">
              <Staff score={q.score} marks={multi ? graded.steps.map((ok) => (ok ? null : 'bad')) : undefined} />
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
