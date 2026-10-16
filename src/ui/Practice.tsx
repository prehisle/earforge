import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { audio, type NoteEvent, type Timbre } from '../audio/engine';
import { midi } from '../audio/midi';
import {
  activeItems,
  canLevelUp,
  currentLevel,
  getProgress,
  itemStat,
  levelsOf,
  pickItem,
  record,
  setOption as applyOption,
  today,
  type Store,
} from '../engine/progress';
import { optionsFor } from '../engine/planner';
import { withSeed } from '../engine/seeded';
import type { ExerciseDef, Question, Settings } from '../engine/types';
import { joinList } from '../i18n';
import { useT } from '../i18n/react';
import { ChoiceGrid } from './ChoiceGrid';
import { choiceIndexForKey, choiceKeyLabel, keyForFocusedButton } from './keys';
import { ModuleTip } from './ModuleTip';
import { NotatePanel } from './NotatePanel';
import { RhythmNotation } from './RhythmNotation';
import { SingPanel } from './SingPanel';
import { Staff } from './Staff';
import { useMidiStatus } from './useMidi';
import { TapPanel } from './TapPanel';

const GAP = 0.45; // 前奏与题目之间的间隔（秒）

function offset(events: NoteEvent[], by: number): NoteEvent[] {
  return events.map((e) => ({ ...e, time: e.time + by }));
}

function endOf(events: NoteEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.time + e.dur), 0);
}

// ───── 答题核心：单模块练习与今日训练共用 ─────

/** 未开始时的界面：intro 在子组件里调用，start 只会在点击时执行 */
function IntroSlot({ render, start }: { render(start: () => void): ReactNode; start(): void }) {
  return <>{render(start)}</>;
}

/** 下一题从哪里来：模块 + 考点 + 该模块的出题上下文 */
export interface Draw {
  ex: ExerciseDef;
  item: string;
  items: string[];
  options: Record<string, string>;
  /** 固定题目：出题时用这个 seed 代替 Math.random（见 engine/seeded.ts） */
  seed?: number;
}

export interface QuizSource {
  /** 返回下一题；null 表示本组结束 */
  next(): Draw | null;
  /** 是否还有下一题（决定按钮文字），缺省视为无限 */
  hasNext?(): boolean;
}

/** 一题的作答结果（多步题每步一条） */
export interface QuizResult {
  ex: ExerciseDef;
  item: string;
  steps: { item: string; ok: boolean }[];
  allRight: boolean;
}

interface QuizProps {
  store: Store;
  update(fn: (s: Store) => void): void;
  source: QuizSource;
  /** 未开始时显示的界面；不传则显示空白（配合 autoStart） */
  intro?(start: () => void): ReactNode;
  autoStart?: boolean;
  /** 题目上方显示所属模块（混合练习） */
  showModule?: boolean;
  onResult?(r: QuizResult): void;
  /** source 没有更多题目时调用 */
  onComplete?(): void;
  /** 只用于出题的设置覆盖（固定题目用，见 engine/seeded.ts 的 SEEDED_GEN_SETTINGS）；显示仍按用户设置 */
  genSettings?: Partial<Settings>;
}

export function Quiz({ store, update, source, intro, autoStart, showModule, onResult, onComplete, genSettings }: QuizProps) {
  const t = useT();
  const [cur, setCur] = useState<{ ex: ExerciseDef; q: Question } | null>(null);
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState<Set<string>>(new Set()); // 当前步骤点错的选项
  const [misses, setMisses] = useState<string[][]>([]); // 每一步点错过的选项（按先后），用于答完后对比
  const [cmpStep, setCmpStep] = useState<number | null>(null); // 多步题答完后选中对比的步骤
  const [stepResults, setStepResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [session, setSession] = useState({ n: 0, c: 0 });
  const [levelUp, setLevelUp] = useState<string | null>(null);
  const [goalHit, setGoalHit] = useState(false);
  const [listenAfter, setListenAfter] = useState(0); // 唱歌题：播放结束后才开始判断
  const [qid, setQid] = useState(0);
  const [inst, setInst] = useState<Timbre | null>(null); // 随机音色模式下本题的乐器
  const nextRef = useRef<() => void>(() => {});
  const timer = useRef<number | undefined>(undefined);
  const holdNext = useRef(false); // 答完后点了试听：取消本题的自动跳题
  const recorded = useRef(''); // 已记录的「题号:步骤」：同一任务里连到的两次作答（如 MIDI 和弦）只记一次
  const turn = useRef(0); // 每出一题（或卸载）加一：等待播放解决和弦期间已换题时不再安排自动跳题
  const midiStatus = useMidiStatus();
  const latest = useRef({ source, onResult, onComplete });
  const q = cur?.q ?? null;

  const play = async (question: Question, what: 'all' | 'target' | 'prelude' | 'resolution') => {
    if (question.tap) return 0; // 打节奏题由 TapPanel 自己播放（空格也交给它）
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
  };

  const next = () => {
    window.clearTimeout(timer.current);
    turn.current++;
    const d = latest.current.source.next();
    if (!d) {
      audio.stopAll();
      latest.current.onComplete?.();
      return;
    }
    const settings = genSettings ? { ...store.settings, ...genSettings } : store.settings;
    const gen = () => d.ex.generate(d.item, { settings, items: d.items, options: d.options });
    const question = d.seed === undefined ? gen() : withSeed(d.seed, gen);
    setCur({ ex: d.ex, q: question });
    // 随机音色：每道新题换一种乐器（本题的重听与选项试听沿用）
    setInst(audio.newQuestion());
    setStep(0);
    setWrong(new Set());
    setMisses([]);
    setCmpStep(null);
    holdNext.current = false;
    setStepResults([]);
    setDone(false);
    setLevelUp(null);
    setGoalHit(false);
    setQid((n) => n + 1);
    void play(question, 'all');
  };

  useEffect(() => {
    // 用定时器而不是直接调用：StrictMode 下重复挂载只会出一题
    const t = autoStart ? window.setTimeout(() => nextRef.current(), 0) : undefined;
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    turn.current++;
    audio.stopAll();
  }, []);

  /** 某一步作答完成（firstTry 表示首次即答对）。 */
  const finishStep = (question: Question, idx: number, firstTry: boolean) => {
    if (!cur) return;
    const key = `${qid}:${idx}`;
    if (recorded.current === key) return;
    recorded.current = key;
    const { ex } = cur;
    const results = [...stepResults, firstTry];
    setStepResults(results);
    const stepItem = question.stepItems?.[idx] ?? question.item;
    let leveled: string | null = null;
    let hit = false;
    update((s) => {
      const p = getProgress(s, ex);
      const before = s.daily[today()]?.n ?? 0;
      record(s, p, stepItem, firstTry);
      hit = before < s.settings.dailyGoal && before + 1 >= s.settings.dailyGoal;
      if (idx === question.answer.length - 1 && canLevelUp(ex, p)) {
        p.level++;
        leveled = currentLevel(ex, p).name;
      }
    });
    if (hit) setGoalHit(true);
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
    setLevelUp(leveled && showModule ? `${ex.title} · ${leveled}` : leveled);
    latest.current.onResult?.({
      ex,
      item: question.item,
      steps: results.map((ok, i) => ({ item: question.stepItems?.[i] ?? question.item, ok })),
      allRight,
    });
    const my = turn.current;
    void (async () => {
      let wait = 1.1;
      if (question.resolution && question.resolution.length > 1) wait += await play(question, 'resolution');
      // 等待播放期间已手动下一题或离开页面：不要给新题（或已卸载的组件）安排自动跳题
      if (my !== turn.current) return;
      if (allRight && store.settings.autoNext && !question.sing && !question.tap && !holdNext.current) {
        timer.current = window.setTimeout(() => nextRef.current(), wait * 1000);
      }
    })();
  };

  /** 对比试听：所选选项代入本题（多步题代入第 at 步）后的声音。 */
  const playChoice = (id: string, at: number) => {
    if (q?.choiceEvents) void audio.play(q.choiceEvents(id, at));
  };

  // 答完后对比的步骤：缺省为第一个答错的步骤，否则为最后一步
  const firstMiss = misses.findIndex((m) => m?.length);
  const cmpAt = cmpStep ?? (firstMiss >= 0 ? firstMiss : (q?.answer.length ?? 1) - 1);

  /** 答完后试听选项：不计分，并取消自动跳题。 */
  const preview = (id: string) => {
    window.clearTimeout(timer.current);
    holdNext.current = true;
    playChoice(id, cmpAt);
  };

  /** 是否可以试听该选项：答完后全部可以；作答中只能重听已点错的选项（避免靠试听找答案）。 */
  const canPreview = (id: string) => !!q?.choiceEvents && (done || wrong.has(id));

  const answer = (id: string) => {
    if (!q || done) return;
    if (id === q.answer[step]) {
      finishStep(q, step, wrong.size === 0);
    } else if (!wrong.has(id)) {
      setWrong(new Set([...wrong, id]));
      setMisses((m) => {
        const out = [...m];
        out[step] = [...(out[step] ?? []), id];
        return out;
      });
      // 答错：立刻听听所选答案是什么声音
      playChoice(id, step);
    }
  };

  /** 选项的简短名称（节奏谱选项按序号称呼） */
  const choiceName = (id: string) => {
    const i = q?.choices.findIndex((c) => c.id === id) ?? -1;
    const c = q?.choices[i];
    return c?.rhythm ? t('quiz.rhythmN', { n: i + 1 }) : (c?.label ?? id);
  };

  const onChoice = (id: string) => {
    if (done) preview(id);
    else if (wrong.has(id)) playChoice(id, step);
    else answer(id);
  };

  // MIDI 键盘作答（琴键发声由 useMidiInput 负责；记谱题由 NotatePanel 自己处理）
  const onMidi = useRef<(note: number) => void>(() => {});
  useEffect(() => midi.onNote((note) => onMidi.current(note)), []);

  // 渲染后同步「最新」的回调与 props（不在渲染中写 ref）；事件与定时器都在提交之后触发，行为不变
  useLayoutEffect(() => {
    latest.current = { source, onResult, onComplete };
    nextRef.current = next;
    onMidi.current = (note) => {
      if (!q?.midiAnswer || q.sing || q.notate || done) return;
      const id = q.midiAnswer(note);
      if (id && q.choices.some((c) => c.id === id)) answer(id);
    };
  });

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      // Ctrl/⌘/Alt + 数字是浏览器快捷键（切换标签页），不作答
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // 长按的自动重复：不连续跳题、作答或重播（也不让回车「点击」获得焦点的选项）
      if (e.repeat && (/^(Enter| |ArrowRight)$/.test(e.key) || choiceIndexForKey(e) >= 0)) {
        e.preventDefault();
        return;
      }
      if (keyForFocusedButton(e)) return;
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
        // 阻止回车同时「点击」获得焦点的选项按钮（答完后选项可点，否则会立刻答下一题）
        if (done) {
          e.preventDefault();
          next();
        }
      } else if (choiceIndexForKey(e) >= 0) {
        // 作答键（1–9、0、Q–P，见 keys.ts）；Shift + 作答键：试听该选项
        const c = q.choices[choiceIndexForKey(e)];
        if (c && e.shiftKey) {
          if (canPreview(c.id)) onChoice(c.id);
        } else if (c) answer(c.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!cur || !q) return intro ? <IntroSlot render={intro} start={next} /> : null;

  const accuracy = session.n ? Math.round((session.c / session.n) * 100) : null;
  const last = source.hasNext?.() === false;

  return (
    <section className="question">
      {showModule && (
        <p className="q-module">
          <span className="q-module-icon">{cur.ex.icon}</span>
          {cur.ex.title}
        </p>
      )}
      <p className="prompt">{q.prompt}</p>

      {!q.tap && (
        <div className="play-row">
          <button className="primary" onClick={() => play(q, 'all')}>
            {t('quiz.replay')} <kbd>{t('common.space')}</kbd>
          </button>
          {q.prelude && (
            <>
              <button onClick={() => play(q, 'target')}>{q.sing?.showDisplay ? t('quiz.hint') : t('quiz.targetOnly')}</button>
              <button onClick={() => play(q, 'prelude')}>{t('quiz.cadence')}</button>
            </>
          )}
          {inst && <span className="timbre-badge">{t('settings.timbre.badge', { name: t(`settings.timbre.${inst}`) })}</span>}
          {store.settings.midi && midiStatus.devices.length > 0 && !q.sing && (
            <span
              className={q.midiAnswer || q.notate ? 'midi-badge' : 'midi-badge off'}
              title={`${joinList(midiStatus.devices)}${q.midiAnswer || q.notate ? t('quiz.midiCan') : t('quiz.midiCannot')}`}
            >
              {t('quiz.midiConnected')}
            </span>
          )}
        </div>
      )}

      {q.answer.length > 1 && !q.sing && (
        <div className="slots">
          {q.answer.map((a, i) => {
            const label = q.choices.find((c) => c.id === a)?.label ?? a;
            const state = i < step || (done && i === step) ? (stepResults[i] ? 'ok' : 'fix') : i === step ? 'cur' : '';
            // 答完后点击某一步，选项按钮就试听这一步
            const pickable = done && !!q.choiceEvents;
            return (
              <span
                key={i}
                className={`slot ${state}${pickable ? ' pick' : ''}${pickable && i === cmpAt ? ' sel' : ''}`}
                onClick={pickable ? () => setCmpStep(i) : undefined}
                title={pickable ? t('quiz.slotPick') : undefined}
              >
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
          notation={store.settings.notation}
          listenAfter={listenAfter}
          onStep={(i, ok) => finishStep(q, i, ok)}
          done={done}
        />
      ) : q.tap ? (
        <TapPanel key={qid} question={q} onStep={(i, ok) => finishStep(q, i, ok)} done={done} />
      ) : q.notate ? (
        <NotatePanel key={qid} question={q} naming={store.settings.naming} onStep={(i, ok) => finishStep(q, i, ok)} done={done} />
      ) : (
        /* ───── 选项按钮 ───── */
        <ChoiceGrid
          choices={q.choices}
          render={(c, i) => {
            // 答完后按对比步骤标出正确与点错的选项（多步题可切换步骤）
            const isAnswer = done && c.id === q.answer[cmpAt] && (q.answer.length === 1 || !!q.choiceEvents);
            const isBad = done ? !!misses[cmpAt]?.includes(c.id) : wrong.has(c.id);
            const listen = canPreview(c.id);
            const cls = `choice${isBad ? ' bad' : isAnswer ? ' good' : ''}${done && listen ? ' listen' : ''}`;
            return (
              <button
                key={c.id}
                className={cls}
                onClick={() => onChoice(c.id)}
                title={listen ? t('quiz.listenTitle', { n: choiceKeyLabel(i) ?? i + 1 }) : undefined}
              >
                {c.rhythm ? (
                  <RhythmNotation rhythm={c.rhythm} label={c.label} />
                ) : (
                  <span className="choice-label">{c.label}</span>
                )}
                {c.sub && <span className="choice-sub">{c.sub}</span>}
                {choiceKeyLabel(i) && <kbd className="choice-key">{choiceKeyLabel(i)}</kbd>}
                {listen && <span className="choice-listen">{t('quiz.listen')}</span>}
              </button>
            );
          }}
        />
      )}

      {done && q.choiceEvents && misses[cmpAt]?.length ? (
        <div className="compare-row">
          {q.answer.length > 1 && <span className="muted">{t('quiz.step', { n: cmpAt + 1 })}</span>}
          <button onClick={() => preview(misses[cmpAt][0])}>
            {t('quiz.yours', { name: choiceName(misses[cmpAt][0]) })}
          </button>
          <button onClick={() => preview(q.answer[cmpAt])}>
            {t('quiz.correctAnswer', { name: choiceName(q.answer[cmpAt]) })}
          </button>
        </div>
      ) : null}

      {done && (
        <div className={stepResults.every(Boolean) ? 'feedback good' : 'feedback bad'}>
          <strong>{stepResults.every(Boolean) ? t('quiz.correct') : t('quiz.wrong')}</strong>
          {q.explain && <span>{q.explain}</span>}
          <button className="primary" onClick={next}>
            {last ? t('quiz.summary') : t('quiz.next')} <kbd>{t('common.enter')}</kbd>
          </button>
          {q.score && !q.sing && store.settings.notation !== 'jianpu' && (
            <div className="feedback-staff">
              {/* 多步题标出答错的步骤 */}
              <Staff score={q.score} marks={q.answer.length > 1 ? stepResults.map((ok) => (ok ? null : 'bad')) : undefined} />
            </div>
          )}
        </div>
      )}

      {levelUp && (
        <div className="levelup">
          {t('quiz.levelUp')}
          <strong>{levelUp}</strong>
        </div>
      )}

      {goalHit && (
        <div className="levelup">
          {t('quiz.goalHit', { n: store.settings.dailyGoal })}
        </div>
      )}

      <p className="session muted">
        {t('quiz.session', { n: session.n })}
        {accuracy !== null && t('quiz.sessionAcc', { pct: accuracy })}
      </p>
    </section>
  );
}

// ───── 单模块练习 ─────

interface Props {
  ex: ExerciseDef;
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
  /** 临时专练的考点（如薄弱点），不写入用户的自选设置 */
  focus?: string[];
}

export function Practice({ ex, store, update, onBack, focus }: Props) {
  const t = useT();
  // 在副本上规范化（补全选项、级别不越界），不写回
  const progress = useMemo(() => getProgress(structuredClone(store), ex), [store, ex]);
  const [temp, setTemp] = useState<string[] | null>(focus && focus.length > 0 ? focus : null);
  const items = temp ?? activeItems(ex, progress);
  // 临时专练的考点可能属于别的调式：用能覆盖它们的选项出题
  const opts = temp ? optionsFor(ex, progress, temp) : progress.options;
  const levels = levelsOf(ex, opts);
  const scopedLabel = (ex.options ?? [])
    .filter((o) => o.scoped && opts[o.id] !== progress.options[o.id])
    .map((o) => o.values.find((v) => v.id === opts[o.id])?.label)
    .join(' ');
  const [showPanel, setShowPanel] = useState(false);
  const [round, setRound] = useState(0); // 换一套考点时重置答题区
  const prevItem = useRef<string | undefined>(undefined);

  // 确保练习进度已初始化
  useEffect(() => {
    if (!store.exercises[ex.id]) update((s) => void getProgress(s, ex));
  }, [ex, store.exercises, update]);

  const source: QuizSource = {
    next: () => {
      const item = pickItem(progress, items, prevItem.current);
      prevItem.current = item;
      return { ex, item, items, options: opts };
    },
  };

  const setOption = (id: string, value: string) => {
    update((s) => {
      applyOption(ex, getProgress(s, ex), id, value);
    });
    // 切换调式等会换掉整套考点：退出临时专练，回到开始页
    if (ex.options?.find((o) => o.id === id)?.scoped && value !== opts[id]) {
      setTemp(null);
      setRound((r) => r + 1);
    }
  };

  const setLevel = (lv: number) => {
    setTemp(null);
    update((s) => {
      const p = getProgress(s, ex);
      // 级别按钮显示的是 opts 下的级别表，先切到对应调式
      for (const o of ex.options ?? []) if (o.scoped) applyOption(ex, p, o.id, opts[o.id]);
      p.level = lv;
      p.custom = null;
    });
  };

  const toggleCustom = (it: string) => {
    // 临时专练时只改本次的考点
    if (temp) {
      const cur = new Set(temp);
      if (cur.has(it)) cur.delete(it);
      else cur.add(it);
      if (cur.size >= 2) setTemp([...cur]);
      return;
    }
    update((s) => {
      const p = getProgress(s, ex);
      const cur = new Set(p.custom ?? activeItems(ex, p));
      if (cur.has(it)) cur.delete(it);
      else cur.add(it);
      p.custom = cur.size >= 2 ? [...cur] : p.custom;
    });
  };

  const allItems = [...new Set(levels.flatMap((l) => l.items))];

  return (
    <main className="page practice">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>
            {ex.icon} {ex.title}
          </h1>
          <p className="muted">
            {temp
              ? `${t('practice.focusWeak')}${scopedLabel && ` · ${scopedLabel}`}`
              : progress.custom
                ? t('practice.custom')
                : t('practice.levelMeta', { level: progress.level + 1, name: currentLevel(ex, progress).name })}
          </p>
        </div>
        <button className={showPanel ? 'ghost active' : 'ghost'} onClick={() => setShowPanel(!showPanel)}>
          {t('practice.options')}
        </button>
      </header>

      {showPanel && (
        <section className="panel">
          <div className="field">
            <label>{t('practice.level')}</label>
            <div className="seg wrap">
              {levels.map((l, i) => (
                <button
                  key={i}
                  className={!temp && !progress.custom && progress.level === i ? 'on' : ''}
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
                    className={opts[o.id] === v.id ? 'on' : ''}
                    onClick={() => setOption(o.id, v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="field">
            <label>{temp ? t('practice.focusLabel') : t('practice.customLabel')}</label>
            <div className="chips">
              {allItems.map((it) => {
                const st = itemStat(progress, it);
                return (
                  <button
                    key={it}
                    className={items.includes(it) ? 'chip on' : 'chip'}
                    onClick={() => toggleCustom(it)}
                    title={st.n ? t('practice.chipTitle', { pct: Math.round(st.acc * 100), n: st.n }) : t('practice.chipNew')}
                  >
                    {ex.itemLabel(it, store.settings)}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <Quiz
        key={round}
        store={store}
        update={update}
        source={source}
        intro={(start) => (
          <>
            {/* 玩法说明只放在开始页：开始答题后不再占屏，手机上题目与反馈不会被挤到首屏以外 */}
            <ModuleTip ex={ex} store={store} update={update} />
            <section className="start">
              <p>{ex.subtitle}</p>
              <p className="muted">
                {t('practice.introItems', {
                  label: temp ? t('practice.focusWeak') : t('practice.current'),
                  items: joinList(items.map((it) => ex.itemLabel(it, store.settings))),
                })}
              </p>
              <button className="primary big" onClick={start}>
                {t('practice.start')}
              </button>
            </section>
          </>
        )}
      />
    </main>
  );
}
