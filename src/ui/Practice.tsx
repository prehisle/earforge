import { useCallback, useEffect, useRef, useState } from 'react';
import { audio, type NoteEvent } from '../audio/engine';
import { activeItems, canLevelUp, getProgress, itemStat, pickItem, record, type Store } from '../engine/progress';
import type { ExerciseDef, Question } from '../engine/types';
import { RhythmNotation } from './RhythmNotation';
import { SingPanel } from './SingPanel';

interface Props {
  ex: ExerciseDef;
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
}

const GAP = 0.45; // 前奏与题目之间的间隔（秒）

function offset(events: NoteEvent[], by: number): NoteEvent[] {
  return events.map((e) => ({ ...e, time: e.time + by }));
}

function endOf(events: NoteEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.time + e.dur), 0);
}

export function Practice({ ex, store, update, onBack }: Props) {
  const progress = store.exercises[ex.id] ?? getProgress(structuredClone(store), ex);
  const items = activeItems(ex, progress);

  const [q, setQ] = useState<Question | null>(null);
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState<Set<string>>(new Set()); // 当前步骤点错的选项
  const [stepResults, setStepResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [session, setSession] = useState({ n: 0, c: 0 });
  const [showPanel, setShowPanel] = useState(false);
  const [levelUp, setLevelUp] = useState<string | null>(null);
  const [listenAfter, setListenAfter] = useState(0); // 唱歌题：播放结束后才开始判断
  const [qid, setQid] = useState(0);
  const prevItem = useRef<string | undefined>(undefined);
  const nextRef = useRef<() => void>(() => {});
  const timer = useRef<number | undefined>(undefined);

  // 确保练习进度已初始化
  useEffect(() => {
    if (!store.exercises[ex.id]) update((s) => void getProgress(s, ex));
  }, [ex, store.exercises, update]);

  const play = useCallback(async (question: Question, what: 'all' | 'target' | 'prelude' | 'resolution') => {
    let events: NoteEvent[];
    if (what === 'prelude') events = question.prelude ?? [];
    else if (what === 'resolution') events = question.resolution ?? [];
    else if (what === 'target' || !question.prelude) events = question.events;
    else events = [...question.prelude, ...offset(question.events, endOf(question.prelude) + GAP)];
    // 视唱模式不自动播放目标旋律
    if (what === 'all' && question.sing?.showDisplay && question.prelude) events = question.prelude;
    const dur = await audio.play(events);
    setListenAfter(performance.now() + dur * 1000);
    return dur;
  }, []);

  const next = useCallback(() => {
    window.clearTimeout(timer.current);
    const item = pickItem(progress, items, prevItem.current);
    prevItem.current = item;
    const question = ex.generate(item, { settings: store.settings, items, options: progress.options });
    setQ(question);
    setStep(0);
    setWrong(new Set());
    setStepResults([]);
    setDone(false);
    setLevelUp(null);
    setQid((n) => n + 1);
    void play(question, 'all');
  }, [ex, items.join(','), store.settings, progress.options, play]); // eslint-disable-line react-hooks/exhaustive-deps

  nextRef.current = next;

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    audio.stopAll();
  }, []);

  /** 某一步作答完成（firstTry 表示首次即答对）。 */
  const finishStep = useCallback(
    (question: Question, idx: number, firstTry: boolean) => {
      const results = [...stepResults, firstTry];
      setStepResults(results);
      const stepItem = question.stepItems?.[idx] ?? question.item;
      let leveled: string | null = null;
      update((s) => {
        const p = getProgress(s, ex);
        record(s, p, stepItem, firstTry);
        if (idx === question.answer.length - 1 && canLevelUp(ex, p)) {
          p.level++;
          leveled = ex.levels[p.level].name;
        }
      });
      if (idx < question.answer.length - 1) {
        setStep(idx + 1);
        setWrong(new Set());
        return;
      }
      // 整题完成
      const allRight = results.every(Boolean);
      if (question.answer.length > 1) setWrong(new Set());
      setDone(true);
      setSession((s) => ({ n: s.n + 1, c: s.c + (allRight ? 1 : 0) }));
      setLevelUp(leveled);
      void (async () => {
        let wait = 1.1;
        if (question.resolution && question.resolution.length > 1) wait += await play(question, 'resolution');
        if (allRight && store.settings.autoNext && !question.sing) {
          timer.current = window.setTimeout(() => nextRef.current(), wait * 1000);
        }
      })();
    },
    [stepResults, update, ex, play, store.settings.autoNext],
  );

  const answer = useCallback(
    (id: string) => {
      if (!q || done) return;
      if (id === q.answer[step]) {
        finishStep(q, step, wrong.size === 0);
      } else if (!wrong.has(id)) {
        setWrong(new Set([...wrong, id]));
      }
    },
    [q, done, step, wrong, finishStep],
  );

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (!q) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          next();
        }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        void play(q, 'all');
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        if (done) next();
      } else if (/^[1-9]$/.test(e.key)) {
        const c = q.choices[Number(e.key) - 1];
        if (c) answer(c.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, done, next, play, answer]);

  const setOption = (id: string, value: string) =>
    update((s) => {
      getProgress(s, ex).options[id] = value;
    });

  const setLevel = (lv: number) =>
    update((s) => {
      const p = getProgress(s, ex);
      p.level = lv;
      p.custom = null;
    });

  const toggleCustom = (it: string) =>
    update((s) => {
      const p = getProgress(s, ex);
      const cur = new Set(p.custom ?? activeItems(ex, p));
      if (cur.has(it)) cur.delete(it);
      else cur.add(it);
      p.custom = cur.size >= 2 ? [...cur] : p.custom;
    });

  const allItems = [...new Set(ex.levels.flatMap((l) => l.items))];
  const accuracy = session.n ? Math.round((session.c / session.n) * 100) : null;

  return (
    <main className="page practice">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label="返回">
          ← 返回
        </button>
        <div className="practice-title">
          <h1>
            {ex.icon} {ex.title}
          </h1>
          <p className="muted">
            {progress.custom ? '自选考点' : `第 ${progress.level + 1} 级 · ${ex.levels[progress.level].name}`}
          </p>
        </div>
        <button className={showPanel ? 'ghost active' : 'ghost'} onClick={() => setShowPanel(!showPanel)}>
          选项
        </button>
      </header>

      {showPanel && (
        <section className="panel">
          <div className="field">
            <label>级别</label>
            <div className="seg wrap">
              {ex.levels.map((l, i) => (
                <button
                  key={i}
                  className={!progress.custom && progress.level === i ? 'on' : ''}
                  onClick={() => setLevel(i)}
                >
                  {i + 1}. {l.name}
                </button>
              ))}
            </div>
          </div>
          {ex.options?.map((o) => (
            <div className="field" key={o.id}>
              <label>{o.label}</label>
              <div className="seg">
                {o.values.map((v) => (
                  <button
                    key={v.id}
                    className={progress.options[o.id] === v.id ? 'on' : ''}
                    onClick={() => setOption(o.id, v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="field">
            <label>自选考点（至少 2 个）</label>
            <div className="chips">
              {allItems.map((it) => {
                const st = itemStat(progress, it);
                return (
                  <button
                    key={it}
                    className={items.includes(it) ? 'chip on' : 'chip'}
                    onClick={() => toggleCustom(it)}
                    title={st.n ? `掌握度 ${Math.round(st.acc * 100)}% · 练习 ${st.n} 次` : '尚未练习'}
                  >
                    {ex.itemLabel(it, store.settings)}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {!q ? (
        <section className="start">
          <p>{ex.subtitle}</p>
          <p className="muted">
            当前考点：{items.map((it) => ex.itemLabel(it, store.settings)).join('、')}
          </p>
          <button className="primary big" onClick={next}>
            开始练习
          </button>
        </section>
      ) : (
        <section className="question">
          <p className="prompt">{q.prompt}</p>

          <div className="play-row">
            <button className="primary" onClick={() => play(q, 'all')}>
              ▶ 重听 <kbd>空格</kbd>
            </button>
            {q.prelude && (
              <>
                <button onClick={() => play(q, 'target')}>{q.sing?.showDisplay ? '提示' : '只听题目'}</button>
                <button onClick={() => play(q, 'prelude')}>终止式</button>
              </>
            )}
          </div>

          {q.answer.length > 1 && !q.sing && (
            <div className="slots">
              {q.answer.map((a, i) => {
                const label = q.choices.find((c) => c.id === a)?.label ?? a;
                const state = i < step || (done && i === step) ? (stepResults[i] ? 'ok' : 'fix') : i === step ? 'cur' : '';
                return (
                  <span key={i} className={`slot ${state}`}>
                    {i < step || done ? label : '?'}
                  </span>
                );
              })}
            </div>
          )}

          {q.sing ? (
            <SingPanel
              key={qid}
              question={q}
              naming={store.settings.naming}
              listenAfter={listenAfter}
              onStep={(i, ok) => finishStep(q, i, ok)}
              done={done}
            />
          ) : (
            <div className={`choices n${Math.min(q.choices.length, 8)}`}>
              {q.choices.map((c, i) => {
                const isAnswer = done && c.id === q.answer[q.answer.length - 1] && q.answer.length === 1;
                const cls = wrong.has(c.id) ? 'choice bad' : isAnswer ? 'choice good' : 'choice';
                return (
                  <button key={c.id} className={cls} onClick={() => answer(c.id)} disabled={done}>
                    {c.rhythm ? (
                      <RhythmNotation rhythm={c.rhythm} label={c.label} />
                    ) : (
                      <span className="choice-label">{c.label}</span>
                    )}
                    {c.sub && <span className="choice-sub">{c.sub}</span>}
                    {i < 9 && <kbd className="choice-key">{i + 1}</kbd>}
                  </button>
                );
              })}
            </div>
          )}

          {done && (
            <div className={stepResults.every(Boolean) ? 'feedback good' : 'feedback bad'}>
              <strong>{stepResults.every(Boolean) ? '✓ 正确' : '✗ 再接再厉'}</strong>
              {q.explain && <span>{q.explain}</span>}
              <button className="primary" onClick={next}>
                下一题 <kbd>回车</kbd>
              </button>
            </div>
          )}

          {levelUp && (
            <div className="levelup">
              🎉 当前级别已掌握，已解锁：<strong>{levelUp}</strong>
            </div>
          )}

          <p className="session muted">
            本次：{session.n} 题{accuracy !== null && ` · 正确率 ${accuracy}%`}
          </p>
        </section>
      )}
    </main>
  );
}
