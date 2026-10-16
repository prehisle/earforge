import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { BACKGROUNDS, DAILY_GOALS, applyBackground, startLevel, type Background } from '../engine/onboarding';
import { peekProgress } from '../engine/planner';
import { levelsOf, type Store } from '../engine/progress';
import type { Settings } from '../engine/types';
import { EXERCISES } from '../exercises';
import type { NamingSystem } from '../music/theory';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  /** 完成或跳过引导 */
  onDone(): void;
}

const STEPS = ['欢迎', '试音', '你的基础', '偏好', '完成'] as const;

/** 各命名体系的简短说明 */
const NAMINGS: { id: NamingSystem; label: string; desc: string }[] = [
  { id: 'movable', label: '首调唱名', desc: 'do 永远是主音，换调不换唱名。练调性听觉最推荐' },
  { id: 'jianpu', label: '简谱', desc: '1 2 3 4 5 6 7，和首调唱名一样随调移动' },
  { id: 'fixed', label: '固定调唱名', desc: 'C 永远唱 do，适合习惯固定唱名的器乐学生' },
  { id: 'letter', label: '音名', desc: 'C D E F G A B，显示实际的音高' },
];

/** 引导中展示起始级别的模块 */
const SHOWN = ['degrees', 'intervals', 'chords'];

export function Onboarding({ store, update, onDone }: Props) {
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
        <ol className="onboard-dots" aria-label={`第 ${step + 1} 步，共 ${STEPS.length} 步`}>
          {STEPS.map((name, i) => (
            <li key={name} className={i === step ? 'on' : i < step ? 'done' : ''} title={name} />
          ))}
        </ol>
        {last ? (
          <span className="onboard-spacer" />
        ) : (
          <button className="ghost" onClick={finish}>
            跳过 <kbd>Esc</kbd>
          </button>
        )}
      </header>

      <section className="panel onboard-body">
        {step === 0 && (
          <>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              欢迎来到 EarForge 耳锻
            </h1>
            <p>
              这是一个<strong>功能性练耳</strong>工具：先听终止式建立调性，再判断每个音、和弦在调里的「功能」，
              用<strong>首调唱名</strong>（do re mi）来记。练的是扒歌、视唱、即兴真正用得上的相对音感。
            </p>
            <p className="muted">接下来用不到一分钟做几项设置，随时可以跳过，之后也能在「设置」里修改。</p>
          </>
        )}

        {step === 1 && (
          <>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              试一下声音
            </h1>
            <p>点下面的按钮，应该能听到一个大三和弦。</p>
            <button className="primary big onboard-play" onClick={testSound}>
              ▶ 播放和弦
            </button>
            <div className="field">
              <label htmlFor="onboard-vol">音量 {Math.round(s.volume * 100)}%</label>
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
              <summary>听不到？</summary>
              <ul>
                <li>iPhone / iPad：检查侧面的静音开关是否打开，静音模式下网页没有声音。</li>
                <li>调高系统音量和上面的音量滑块，确认耳机或蓝牙音箱已连接。</li>
                <li>浏览器标签页没有被设成静音；仍然不行可以刷新页面再试。</li>
              </ul>
            </details>
          </>
        )}

        {step === 2 && (
          <>
            <h1 id={titleId} ref={heading} tabIndex={-1}>
              你的音乐基础？
            </h1>
            <p className="muted">据此设定各练习的起始级别和每日目标。之后会根据你的正确率自动升级。</p>
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
              偏好设置
            </h1>
            <div className="field">
              <label id="onboard-naming">唱名 / 音名显示</label>
              <div className="onboard-options" role="radiogroup" aria-labelledby="onboard-naming">
                {NAMINGS.map((n) => (
                  <button
                    key={n.id}
                    role="radio"
                    aria-checked={s.naming === n.id}
                    className={s.naming === n.id ? 'onboard-option on' : 'onboard-option'}
                    onClick={() => set('naming', n.id)}
                  >
                    <strong>{n.label}</strong>
                    <span className="muted">{n.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label id="onboard-voice">演唱音区（视唱练习用）</label>
              <div className="seg wrap" role="radiogroup" aria-labelledby="onboard-voice">
                {(
                  [
                    ['low', '低音区（男声）'],
                    ['high', '高音区（女声/童声）'],
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
              准备好了 🎉
            </h1>
            {bg ? (
              <ul className="onboard-summary">
                {EXERCISES.filter((ex) => SHOWN.includes(ex.id)).map((ex) => {
                  // 与 applyBackground 一致：只升不降（重新查看引导时保留已解锁的级别）
                  const p = peekProgress(store, ex);
                  const lv = Math.max(p.level, startLevel(bg, ex, p.options));
                  return (
                    <li key={ex.id}>
                      {ex.icon} {ex.title}：第 {lv + 1}/{levelsOf(ex, p.options).length} 级起步
                      {lv > 0 && <span className="muted">（含前 {lv} 级）</span>}
                    </li>
                  );
                })}
                <li>🎯 每日目标：{DAILY_GOALS[bg]} 题</li>
              </ul>
            ) : (
              <p>所有练习从第 1 级开始，每日目标 {s.dailyGoal} 题。</p>
            )}
            <p>
              建议从首页的<strong>「今日训练」</strong>开始：它会自动混合几个练习，挑出最需要练的考点。
            </p>
            <p className="muted">快捷键：数字键作答 · 空格重听 · 回车下一题</p>
          </>
        )}
      </section>

      <nav className="onboard-nav">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)}>← 上一步</button>
        ) : (
          <span />
        )}
        {last ? (
          <button className="primary big" onClick={finish}>
            去首页 · 开始今日训练
          </button>
        ) : (
          <button className="primary" onClick={() => setStep(step + 1)}>
            {step === 2 && !bg ? '先不选，下一步' : '下一步 →'}
          </button>
        )}
      </nav>
    </main>
  );
}
