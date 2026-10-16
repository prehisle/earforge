import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { BACKGROUNDS, DAILY_GOALS, applyBackground, startLevel, type Background } from '../engine/onboarding';
import { peekProgress } from '../engine/planner';
import { levelsOf, type Store } from '../engine/progress';
import type { Settings } from '../engine/types';
import { EXERCISES } from '../exercises';
import type { MessageKey } from '../i18n';
import { useT } from '../i18n/react';
import type { NamingSystem } from '../music/theory';
import { LangSwitch } from './Seg';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  /** 完成或跳过引导 */
  onDone(): void;
}

const STEPS: MessageKey[] = [
  'onboard.step.welcome',
  'onboard.step.sound',
  'onboard.step.background',
  'onboard.step.prefs',
  'onboard.step.done',
];

/** 引导中列出的命名体系（名称与简短说明见词典 naming.<id>.short / .desc） */
const NAMINGS: NamingSystem[] = ['movable', 'jianpu', 'fixed', 'letter'];

/** 引导中展示起始级别的模块 */
const SHOWN = ['degrees', 'intervals', 'chords'];

export function Onboarding({ store, update, onDone }: Props) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [bg, setBg] = useState<Background | null>(null);
  const [played, setPlayed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const s = store.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((st) => void (st.settings[k] = v));

  /** 结束引导：应用所选背景（没选则保持默认），标记已完成 */
  const finish = () => {
    update((st) => {
      if (bg) applyBackground(st, bg, EXERCISES);
      st.settings.onboarded = true;
    });
    onDone();
  };

  // 换步时把焦点移到标题，读屏软件会读出新内容
  useEffect(() => heading.current?.focus(), [step]);

  // Esc：跳过引导（每次渲染重新绑定，拿到最新的所选背景）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 试音：C 大三和弦先分解再柱式；这次点击同时解锁浏览器的音频
  const testSound = () => {
    setPlayed(true);
    void audio.play([
      { notes: [60], time: 0, dur: 0.4 },
      { notes: [64], time: 0.3, dur: 0.4 },
      { notes: [67], time: 0.6, dur: 0.4 },
      { notes: [48, 60, 64, 67], time: 0.95, dur: 1.4 },
    ]);
  };

  const last = step === STEPS.length - 1;
  const titleId = 'onboard-title';

  return (
    <main className="page onboard" aria-labelledby={titleId}>
      <header className="onboard-head">
        <span className="logo">耳</span>
        <ol className="onboard-dots" aria-label={t('onboard.dots', { i: step + 1, n: STEPS.length })}>
          {STEPS.map((name, i) => (
            <li key={name} className={i === step ? 'on' : i < step ? 'done' : ''} title={t(name)} />
          ))}
        </ol>
        {last ? (
          <span className="onboard-spacer" />
        ) : (
          <button className="ghost" onClick={finish}>
            {t('onboard.skip')} <kbd>Esc</kbd>
          </button>
        )}
      </header>

      <section className="panel onboard-body">
        {step === 0 && (
          <>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              {t('onboard.welcome')}
            </h1>
            <div className="field onboard-lang">
              <label>{t('lang.label')}</label>
              <LangSwitch value={s.lang} onChange={(v) => set('lang', v)} />
            </div>
            <p>
              {t('onboard.intro1')}
              <strong>{t('onboard.introFunctional')}</strong>
              {t('onboard.intro2')}
              <strong>{t('onboard.introMovable')}</strong>
              {t('onboard.intro3')}
            </p>
            <p className="muted">{t('onboard.introNote')}</p>
          </>
        )}

        {step === 1 && (
          <>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              {t('onboard.soundTitle')}
            </h1>
            <p>{t('onboard.soundText')}</p>
            <button className="primary big onboard-play" onClick={testSound}>
              {t('onboard.play')}
            </button>
            <div className="field">
              <label htmlFor="onboard-vol">{t('settings.volume', { pct: Math.round(s.volume * 100) })}</label>
              <input
                id="onboard-vol"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.volume}
                onChange={(e) => set('volume', Number(e.target.value))}
              />
            </div>
            <details className="onboard-help" open={played || undefined}>
              <summary>{t('onboard.cantHear')}</summary>
              <ul>
                <li>{t('onboard.help1')}</li>
                <li>{t('onboard.help2')}</li>
                <li>{t('onboard.help3')}</li>
              </ul>
            </details>
          </>
        )}

        {step === 2 && (
          <>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              {t('onboard.bgTitle')}
            </h1>
            <p className="muted">{t('onboard.bgText')}</p>
            <div className="onboard-options" role="radiogroup" aria-labelledby={titleId}>
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  role="radio"
                  aria-checked={bg === b.id}
                  className={bg === b.id ? 'onboard-option on' : 'onboard-option'}
                  onClick={() => setBg(b.id)}
                >
                  <strong>{b.label}</strong>
                  <span className="muted">{b.desc}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              {t('onboard.prefsTitle')}
            </h1>
            <div className="field">
              <label id="onboard-naming">{t('onboard.naming')}</label>
              <div className="onboard-options" role="radiogroup" aria-labelledby="onboard-naming">
                {NAMINGS.map((n) => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={s.naming === n}
                    className={s.naming === n ? 'onboard-option on' : 'onboard-option'}
                    onClick={() => set('naming', n)}
                  >
                    <strong>{t(`naming.${n}.short`)}</strong>
                    <span className="muted">{t(`naming.${n}.desc`)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label id="onboard-voice">{t('onboard.voice')}</label>
              <div className="seg wrap" role="radiogroup" aria-labelledby="onboard-voice">
                {(
                  [
                    ['low', t('settings.voice.low')],
                    ['high', t('settings.voice.high')],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={s.voice === v}
                    className={s.voice === v ? 'on' : ''}
                    onClick={() => set('voice', v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              {t('onboard.doneTitle')}
            </h1>
            {bg ? (
              <ul className="onboard-summary">
                {EXERCISES.filter((ex) => SHOWN.includes(ex.id)).map((ex) => {
                  // 与 applyBackground 一致：只升不降（重新查看引导时保留已解锁的级别）
                  const p = peekProgress(store, ex);
                  const lv = Math.max(p.level, startLevel(bg, ex, p.options));
                  return (
                    <li key={ex.id}>
                      {t('onboard.startLevel', {
                        icon: ex.icon,
                        title: ex.title,
                        level: lv + 1,
                        total: levelsOf(ex, p.options).length,
                      })}
                      {lv > 0 && <span className="muted">{lv === 1 ? t('onboard.includesOne') : t('onboard.includes', { n: lv })}</span>}
                    </li>
                  );
                })}
                <li>{t('onboard.goal', { n: DAILY_GOALS[bg] })}</li>
              </ul>
            ) : (
              <p>{t('onboard.allFromOne', { n: s.dailyGoal })}</p>
            )}
            <p>
              {t('onboard.suggest1')}
              <strong>{t('onboard.suggestToday')}</strong>
              {t('onboard.suggest2')}
            </p>
            <p className="muted">{t('home.keys')}</p>
          </>
        )}
      </section>

      <nav className="onboard-nav">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)}>{t('onboard.prev')}</button>
        ) : (
          <span />
        )}
        {last ? (
          <button className="primary big" onClick={finish}>
            {t('onboard.finish')}
          </button>
        ) : (
          <button className="primary" onClick={() => setStep(step + 1)}>
            {step === 2 && !bg ? t('onboard.skipStep') : t('onboard.next')}
          </button>
        )}
      </nav>
    </main>
  );
}
