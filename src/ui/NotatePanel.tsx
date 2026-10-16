// 记谱作答面板（节奏旋律听写）：时值与音高按钮 + 键盘快捷键 + MIDI，实时显示带时值的五线谱与本小节拍数；
// 提交后与正确答案逐音对齐判定，显示两份谱（标出对错）、音高 / 节奏得分与对比试听。

import { useEffect, useReducer, useState } from 'react';
import { audio } from '../audio/engine';
import { midi } from '../audio/midi';
import type { NotateNote, Question } from '../engine/types';
import { gradeDictation, normalize, type Grade } from '../exercises/notateGrade';
import { meterBar, notateEvents } from '../exercises/rhythmDictation';
import { useT } from '../i18n/react';
import { keyFifths, spellInKey, type Mark, type Score } from '../music/notation';
import { DEGREES, mod, modeById, nameInSystem, type NamingSystem } from '../music/theory';
import { BASES, curDur, editorReducer, initialEditor, keyAction, totalTicks, type Base } from './notateEditor';
import { Staff } from './Staff';

interface Props {
  question: Question;
  naming: NamingSystem;
  /** 整题一步：是否完全正确 */
  onStep(index: number, firstTry: boolean): void;
  done: boolean;
}

const DUR_KEYS: Record<Base, string> = { 48: 'W', 24: 'H', 12: 'Q', 6: 'E', 3: 'S' };
const DUR_NAMES: Record<Base, 'notate.dur.w' | 'notate.dur.h' | 'notate.dur.q' | 'notate.dur.e' | 'notate.dur.s'> = {
  48: 'notate.dur.w',
  24: 'notate.dur.h',
  12: 'notate.dur.q',
  6: 'notate.dur.e',
  3: 'notate.dur.s',
};

/** 时值图标：符头（全、二分空心）、符干、符尾 */
function DurIcon({ base }: { base: Base }) {
  const hollow = base >= 24;
  const flags = base === 6 ? 1 : base === 3 ? 2 : 0;
  return (
    <svg className="notate-icon" viewBox="0 0 22 30" width={22} height={30} aria-hidden="true">
      <ellipse
        cx={8}
        cy={23}
        rx={5.4}
        ry={3.8}
        transform="rotate(-20 8 23)"
        fill={hollow ? 'none' : 'currentColor'}
        stroke="currentColor"
        strokeWidth={hollow ? 1.8 : 0}
      />
      {base < 48 && <line x1={12.6} x2={12.6} y1={22} y2={3} stroke="currentColor" strokeWidth={1.5} />}
      {Array.from({ length: flags }, (_, i) => (
        <path key={i} d={`M12.6 ${3 + i * 6} c1 4 7 5 5 11`} fill="none" stroke="currentColor" strokeWidth={1.6} />
      ))}
    </svg>
  );
}

function RestIcon() {
  return (
    <svg className="notate-icon" viewBox="0 0 22 30" width={22} height={30} aria-hidden="true">
      <path d="M8 3 l6 7 l-5 6 l6 7 c-4 -2 -8 0 -4 5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function TieIcon() {
  return (
    <svg className="notate-icon" viewBox="0 0 22 30" width={22} height={30} aria-hidden="true">
      <path d="M2 14 q9 10 18 0 q-9 6 -18 0" fill="currentColor" stroke="currentColor" strokeWidth={0.8} />
    </svg>
  );
}

const fmt = (x: number) => String(Math.round(x * 100) / 100);

export function NotatePanel({ question, naming, onStep, done }: Props) {
  const t = useT();
  const spec = question.notate!;
  const mode = modeById(spec.mode);
  const tonicPc = mod(spec.tonic, 12);
  const [ed, dispatch] = useReducer(editorReducer, undefined, initialEditor);
  const [grade, setGrade] = useState<{ g: Grade; user: NotateNote[] } | null>(null);
  const locked = done || !!grade;

  const bar = meterBar(spec.meter);
  const total = totalTicks(spec.notes);
  const nBars = Math.round(total / bar);
  const unit = (4 * 12) / spec.meter[1]; // 拍号分母音符的 tick 数
  const sum = totalTicks(ed.notes);

  const nameOf = (rel: number) => nameInSystem(spec.tonic + rel, tonicPc, naming, mode);
  const toScore = (notes: NotateNote[], marks?: Mark[]): Score => ({
    notes: notes.map((n) => (n.rel === null ? [] : [spellInKey(spec.tonic + n.rel, tonicPc, mode)])),
    fifths: keyFifths(tonicPc, mode),
    stems: true,
    durs: notes.map((n) => n.dur / 12),
    meter: spec.meter,
    lyrics: notes.map((n) => (n.rel === null ? '' : nameOf(n.rel))),
    marks,
  });

  const submit = () => {
    if (locked || !ed.notes.length) return;
    const user = normalize(ed.notes);
    const g = gradeDictation(spec.notes, user);
    setGrade({ g, user });
    onStep(0, g.allRight);
  };

  // 键盘：数字键写音，字母键选时值（见 ModuleTip），回车提交；空格重听由 Quiz 处理
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
        return;
      }
      const a = keyAction(e, mode.scale);
      if (!a) return;
      if ((a.type === 'acc' && !spec.chromatic) || (a.type === 'octave' && e.shiftKey)) return;
      e.preventDefault();
      dispatch(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // MIDI 键盘写音（按当前选中的时值）；琴键发声由 useMidiInput 负责
  useEffect(() => {
    if (locked) return;
    return midi.onNote((note) => dispatch({ type: 'note', rel: note - spec.tonic }));
  }, [locked, spec.tonic]);

  // 本小节的拍数（刚好写满一小节时显示满的这一小节）
  const barIdx = sum === 0 ? 0 : Math.floor((sum - 1) / bar);
  const inBar = sum - barIdx * bar;
  const over = sum - total;

  if (grade) {
    const { g, user } = grade;
    const refMarks: Mark[] = g.ref.map((r) => (r.rhythm && r.pitch !== false ? 'ok' : 'bad'));
    const userMarks: Mark[] = g.user.map((ok) => (ok ? 'ok' : 'bad'));
    return (
      <div className="notate notate-result">
        <p className="notate-summary">
          <strong>{t('notate.summary', { p: g.pitch.ok, pn: g.pitch.n, r: g.rhythm.ok, rn: g.rhythm.n })}</strong>
          {g.extras > 0 && <span className="muted">{t('notate.extras', { n: g.extras })}</span>}
        </p>
        <div className="notate-staff">
          <span className="notate-staff-label">{t('notate.correct')}</span>
          <Staff score={toScore(spec.notes, refMarks)} autoScroll={false} />
        </div>
        <div className="notate-staff">
          <span className="notate-staff-label">{t('notate.yours')}</span>
          <Staff score={toScore(user, userMarks)} autoScroll={false} />
        </div>
        <div className="compare-row">
          <button onClick={() => void audio.play(notateEvents(user, spec.tonic, spec.bpm))}>{t('notate.playYours')}</button>
          <button onClick={() => void audio.play(notateEvents(spec.notes, spec.tonic, spec.bpm))}>{t('notate.playCorrect')}</button>
        </div>
      </div>
    );
  }

  const dur = curDur(ed);
  const octLabel = ed.octave < 0 ? t('notate.oct.low') : ed.octave > 0 ? t('notate.oct.high') : t('notate.oct.mid');
  const dotMark = ed.octave < 0 ? '̣' : ed.octave > 0 ? '̇' : '';

  return (
    <div className="notate">
      <div className={`notate-status${over > 0 ? ' over' : sum === total ? ' full' : ''}`}>
        <span>
          {over > 0
            ? t('notate.over', { n: fmt(over / unit) })
            : t('notate.barSum', { i: Math.min(barIdx + 1, nBars), n: nBars, x: fmt(inBar / unit), y: spec.meter[0] })}
        </span>
        <span className="notate-fill" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (inBar / bar) * 100)}%` }} />
        </span>
        <span className="muted">{t('notate.count', { n: ed.notes.length })}</span>
      </div>

      <div className="notate-staff notate-live">
        {ed.notes.length ? (
          <Staff score={toScore(ed.notes)} current={ed.notes.length - 1} />
        ) : (
          <p className="muted notate-empty">{t('notate.empty')}</p>
        )}
      </div>

      <div className="notate-row notate-durs" role="group" aria-label={t('notate.durAria')}>
        {BASES.map((b) => (
          <button
            key={b}
            className={ed.base === b ? 'notate-btn on' : 'notate-btn'}
            onClick={() => dispatch({ type: 'base', base: b })}
            title={t(DUR_NAMES[b])}
            aria-label={t(DUR_NAMES[b])}
            aria-pressed={ed.base === b}
          >
            <DurIcon base={b} />
            <kbd>{DUR_KEYS[b]}</kbd>
          </button>
        ))}
        <button
          className={ed.dot && ed.base > 3 ? 'notate-btn on' : 'notate-btn'}
          onClick={() => dispatch({ type: 'dot' })}
          disabled={ed.base === 3}
          title={t('notate.dot')}
          aria-label={t('notate.dot')}
          aria-pressed={ed.dot && ed.base > 3}
        >
          <span className="notate-glyph">•</span>
          <kbd>.</kbd>
        </button>
        <button className="notate-btn" onClick={() => dispatch({ type: 'tie' })} disabled={!ed.notes.length} title={t('notate.tie')} aria-label={t('notate.tie')}>
          <TieIcon />
          <kbd>T</kbd>
        </button>
        <button className="notate-btn" onClick={() => dispatch({ type: 'rest' })} title={t('notate.rest')} aria-label={t('notate.rest')}>
          <RestIcon />
          <kbd>0</kbd>
        </button>
      </div>

      <div className="notate-row notate-pitches" role="group" aria-label={t('notate.pitchAria')}>
        {mode.scale.map((semis, k) => {
          const rel = semis + 12 * ed.octave + ed.acc;
          const sub = naming === 'jianpu' ? DEGREES[semis].movableDo : `${DEGREES[semis].jianpu}${dotMark}`;
          return (
            <button key={k} className="notate-btn notate-pitch" onClick={() => dispatch({ type: 'degree', semis })}>
              <span className="notate-pitch-label">{nameOf(rel)}</span>
              <span className="notate-pitch-sub">{sub}</span>
              <kbd>{k + 1}</kbd>
            </button>
          );
        })}
      </div>

      <div className="notate-row notate-tools">
        <span className="notate-oct">
          <button className="notate-btn" onClick={() => dispatch({ type: 'octave', delta: -1 })} disabled={ed.octave <= -1} aria-label={t('notate.octDown')} title={t('notate.octDown')}>
            ▼<kbd>↓</kbd>
          </button>
          <span className="notate-oct-label">{octLabel}</span>
          <button className="notate-btn" onClick={() => dispatch({ type: 'octave', delta: 1 })} disabled={ed.octave >= 1} aria-label={t('notate.octUp')} title={t('notate.octUp')}>
            ▲<kbd>↑</kbd>
          </button>
        </span>
        {spec.chromatic && (
          <span className="notate-acc">
            <button className={ed.acc === 1 ? 'notate-btn on' : 'notate-btn'} onClick={() => dispatch({ type: 'acc', acc: 1 })} title={t('notate.sharp')} aria-label={t('notate.sharp')}>
              ♯<kbd>=</kbd>
            </button>
            <button className={ed.acc === -1 ? 'notate-btn on' : 'notate-btn'} onClick={() => dispatch({ type: 'acc', acc: -1 })} title={t('notate.flat')} aria-label={t('notate.flat')}>
              ♭<kbd>-</kbd>
            </button>
          </span>
        )}
        <span className="notate-edit">
          <button onClick={() => dispatch({ type: 'back' })} disabled={!ed.notes.length} title={t('notate.back')}>
            ⌫ <span className="notate-hide-sm">{t('notate.back')}</span>
          </button>
          <button onClick={() => dispatch({ type: 'undo' })} disabled={!ed.history.length} title={t('notate.undoKey')}>
            ↶ <span className="notate-hide-sm">{t('notate.undo')}</span>
          </button>
          <button onClick={() => dispatch({ type: 'clear' })} disabled={!ed.notes.length}>
            {t('notate.clear')}
          </button>
        </span>
      </div>

      <div className="notate-submit">
        <span className="muted">{t('notate.current', { dur: t(DUR_NAMES[ed.base]) + (dur !== ed.base ? t('notate.dotted') : '') })}</span>
        <button className="primary" onClick={submit} disabled={!ed.notes.length}>
          {t('notate.submit')} <kbd>{t('common.enter')}</kbd>
        </button>
      </div>
    </div>
  );
}
