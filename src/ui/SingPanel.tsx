import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PitchListener } from '../audio/pitch';
import type { Notation, Question } from '../engine/types';
import { mod, noteName, type NamingSystem } from '../music/theory';
import { useT } from '../i18n/react';
import { Staff } from './Staff';

interface Props {
  question: Question;
  naming: NamingSystem;
  notation: Notation;
  listenAfter: number; // performance.now() 时间戳，之前的输入忽略（避免录到扬声器）
  onStep(index: number, firstTry: boolean): void;
  done: boolean;
}

const HOLD_MS = 450; // 唱准并保持这么久算通过
const WRONG_MS = 900; // 稳定唱错这么久算首次失败
const TOLERANCE = 50; // 音分

/** 不计八度的音分差（-600..600），男女声唱差八度都算对。 */
function centsOff(sung: number, target: number): number {
  return (mod(sung - target + 6, 12) - 6) * 100;
}

export function SingPanel({ question, notation, listenAfter, onStep, done }: Props) {
  const t = useT();
  const sing = question.sing!;
  const [idx, setIdx] = useState(0);
  const [live, setLive] = useState<{ midi: number; cents: number } | null>(null);
  const [hold, setHold] = useState(0);
  const [failed, setFailed] = useState<boolean[]>([]);
  const [micError, setMicError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const state = useRef({ idx: 0, okSince: 0, badSince: 0, failed: false, finished: false });
  const props = useRef({ listenAfter, onStep });
  // 回调里读最新 props：提交后同步，避免在渲染期间写 ref
  useLayoutEffect(() => {
    props.current = { listenAfter, onStep };
  });
  const listener = useRef<PitchListener | null>(null);

  const start = async (cancelled: () => boolean = () => false) => {
    const l = new PitchListener();
    try {
      await l.start((p) => {
        const st = state.current;
        const now = performance.now();
        if (st.finished || now < props.current.listenAfter) return;
        if (!p || p.clarity < 0.85) {
          setLive(null);
          st.okSince = 0;
          st.badSince = 0;
          setHold(0);
          return;
        }
        const target = sing.targets[st.idx];
        const cents = centsOff(p.midi, target);
        setLive({ midi: p.midi, cents });
        if (Math.abs(cents) <= TOLERANCE) {
          st.badSince = 0;
          st.okSince ||= now;
          const h = now - st.okSince;
          setHold(Math.min(1, h / HOLD_MS));
          if (h >= HOLD_MS) advance(!st.failed);
        } else {
          st.okSince = 0;
          setHold(0);
          st.badSince ||= now;
          if (!st.failed && Math.abs(cents) > 80 && now - st.badSince >= WRONG_MS) {
            st.failed = true;
            setFailed((f) => {
              const c = [...f];
              c[st.idx] = true;
              return c;
            });
          }
        }
      });
      if (cancelled()) {
        l.stop();
        return;
      }
      listener.current = l;
      setRunning(true);
    } catch {
      setMicError(t('sing.micError'));
    }
  };

  const advance = (firstTry: boolean) => {
    const st = state.current;
    const i = st.idx;
    props.current.onStep(i, firstTry);
    st.okSince = 0;
    st.badSince = 0;
    st.failed = false;
    setHold(0);
    if (i + 1 >= sing.targets.length) {
      st.finished = true;
      setIdx(i + 1);
    } else {
      st.idx = i + 1;
      setIdx(i + 1);
    }
  };

  const skip = () => {
    if (state.current.finished) return;
    setFailed((f) => {
      const c = [...f];
      c[state.current.idx] = true;
      return c;
    });
    advance(false);
  };

  useEffect(() => {
    // 自动尝试开启（若已授权则无感）
    // 放到微任务里启动：不在 effect 中同步 setState；StrictMode 的首次挂载被取消时也不会白白请求麦克风
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : start(() => cancelled)));
    return () => {
      cancelled = true;
      listener.current?.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 视唱看谱：五线谱为主时不显示唱名（唱过的音再揭晓）；模唱答完后才显示谱
  const staff = question.score && notation !== 'jianpu' && (sing.showDisplay || done);
  const showNames = (sing.showDisplay && notation !== 'staff') || done;
  const needle = live ? Math.max(-100, Math.min(100, live.cents)) : 0;

  return (
    <div className="sing">
      {staff && (
        <Staff
          score={question.score!}
          marks={sing.targets.map((_, i) => (i < idx ? (failed[i] ? 'bad' : 'ok') : i === idx && !done ? 'cur' : null))}
        />
      )}
      <div className="sing-targets">
        {sing.targets.map((_, i) => (
          <span
            key={i}
            className={`slot ${i < idx ? (failed[i] ? 'fix' : 'ok') : i === idx && !done ? 'cur' : ''}`}
          >
            {showNames || i < idx ? sing.display[i] : '?'}
          </span>
        ))}
      </div>

      {micError && <p className="error">{micError}</p>}
      {!running && !micError && <p className="muted">{t('sing.requesting')}</p>}
      {!running && micError && (
        <button
          className="primary"
          onClick={() => {
            setMicError(null);
            void start();
          }}
        >
          {t('sing.enableMic')}
        </button>
      )}

      {running && !done && (
        <>
          <div className="tuner" title={t('sing.tunerTitle')}>
            <div className="tuner-zone" />
            <div
              className={`tuner-needle ${live && Math.abs(live.cents) <= TOLERANCE ? 'in' : ''}`}
              style={{ left: `${50 + needle / 2}%`, opacity: live ? 1 : 0.25 }}
            />
          </div>
          <div className="tuner-read">
            {live ? (
              <>
                <span>{noteName(Math.round(live.midi))}</span>
                <span className="muted">
                  {live.cents > 0 ? t('sing.sharp') : live.cents < 0 ? t('sing.flat') : ''}{' '}
                  {t('sing.cents', { n: Math.abs(Math.round(live.cents)) })}
                </span>
              </>
            ) : (
              <span className="muted">
                {t('sing.prompt', { name: showNames ? sing.display[idx] : t('sing.noteN', { n: idx + 1 }) })}
              </span>
            )}
          </div>
          <div className="meter hold">
            <span className="meter-fill" style={{ width: `${hold * 100}%` }} />
          </div>
          <button className="ghost" onClick={skip}>
            {t('sing.skip')}
          </button>
        </>
      )}
    </div>
  );
}
