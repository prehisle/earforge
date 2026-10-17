// 关于与帮助：使用指南（每日练习、各练习练什么、首调唱名）、键盘快捷键、隐私、版本、许可与致谢。
// 从设置页与首页的「?」进入；按需加载（见 lazyPages.tsx）。

import { EXERCISES } from '../exercises';
import { MESSAGES, type MessageKey } from '../i18n';
import { useT } from '../i18n/react';

/** 构建时由 vite.config.ts 的 define 注入（package.json 的 version） */
declare const __APP_VERSION__: string;
const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

interface Props {
  onBack(): void;
}

/** [键（词典键或原样显示）, 说明] */
type Keys = [string | MessageKey, MessageKey][];

/** 各场景的快捷键，与 Practice / NotatePanel(notateEditor.keyAction) / TapPanel / Exam 的键盘处理一致 */
const KEY_GROUPS: [MessageKey, Keys][] = [
  [
    'about.keys.choice',
    [
      ['1–9 · 0 · Q–P', 'tip.key.answer'],
      ['common.space', 'tip.key.replay'],
      ['tip.key.shift', 'tip.key.preview'],
      ['tip.key.enterRight', 'tip.key.next'],
    ],
  ],
  [
    'about.keys.notate',
    [
      ['1–7', 'tip.key.pitch'],
      ['W H Q E S', 'tip.key.dur'],
      ['.', 'tip.key.dot'],
      ['T', 'tip.key.tie'],
      ['0 / R', 'tip.key.rest'],
      ['↑ ↓', 'tip.key.octave'],
      ['= / -', 'tip.key.acc'],
      ['⌫', 'tip.key.back'],
      ['Ctrl+Z / ⌘Z', 'tip.key.undo'],
      ['common.space', 'tip.key.replay'],
      ['common.enter', 'tip.key.submitNext'],
    ],
  ],
  [
    'about.keys.tap',
    [
      ['tip.key.tapKeys', 'tip.key.tap'],
      ['common.space', 'tip.key.startAgain'],
      ['common.enter', 'tip.key.next'],
    ],
  ],
  [
    'about.keys.exam',
    [
      ['1–9 · 0 · Q–P', 'tip.key.answer'],
      ['common.space', 'about.keys.examReplay'],
      ['common.enter', 'about.keys.examNext'],
    ],
  ],
  [
    'about.keys.general',
    [
      ['Esc', 'about.keys.esc'],
      ['Tab', 'about.keys.tab'],
    ],
  ],
];

const ROUTINE: MessageKey[] = ['about.routine.1', 'about.routine.2', 'about.routine.3', 'about.routine.4'];

export function AboutPage({ onBack }: Props) {
  const t = useT();
  const keyName = (k: string) => (k in MESSAGES.zh ? t(k as MessageKey) : k);

  return (
    <main className="page about">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          {t('common.back')}
        </button>
        <h1>{t('about.title')}</h1>
        <span />
      </header>

      <section className="panel" aria-labelledby="about-how">
        <h2 id="about-how">{t('about.how')}</h2>
        <h3>{t('about.routine')}</h3>
        <ol>
          {ROUTINE.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
        <h3>{t('about.exercises')}</h3>
        <ul className="about-exercises">
          {EXERCISES.map((ex) => (
            <li key={ex.id}>
              <strong>{ex.title}</strong>
              <span className="muted"> — {ex.subtitle}</span>
            </li>
          ))}
          <li>
            <strong>{t('about.ex.songs')}</strong>
            <span className="muted"> — {t('about.ex.songsDesc')}</span>
          </li>
          <li>
            <strong>{t('about.ex.exam')}</strong>
            <span className="muted"> — {t('about.ex.examDesc')}</span>
          </li>
        </ul>
        <h3>{t('about.movable')}</h3>
        <p>{t('about.movable.1')}</p>
        <p>{t('about.movable.2')}</p>
      </section>

      <section className="panel about-keys-panel" aria-labelledby="about-keys">
        <h2 id="about-keys">{t('about.keys')}</h2>
        <p className="muted">{t('about.keys.note')}</p>
        {KEY_GROUPS.map(([title, keys]) => (
          <div key={title} className="about-keygroup">
            <h3>{t(title)}</h3>
            <dl className="about-keys">
              {keys.map(([k, d]) => (
                <div key={k + d}>
                  <dt>
                    <kbd>{keyName(k)}</kbd>
                  </dt>
                  <dd>{t(d)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>

      <section className="panel" aria-labelledby="about-privacy">
        <h2 id="about-privacy">{t('about.privacy')}</h2>
        <p>{t('about.privacy.body')}</p>
        <p className="muted">{t('about.browsers')}</p>
      </section>

      <section className="panel" aria-labelledby="about-license">
        <h2 id="about-license">{t('about.license')}</h2>
        <p>{t('about.version', { v: APP_VERSION })}</p>
        <p>{t('about.license.body')}</p>
        <p>
          {t('about.source')}{' '}
          <a href="https://github.com/prehisle/earforge" target="_blank" rel="noopener noreferrer">
            github.com/prehisle/earforge
          </a>
        </p>
        <ul>
          <li>
            {t('about.credits.piano')}{' '}
            <a href="https://archive.org/details/SalamanderGrandPianoV3" target="_blank" rel="noopener noreferrer">
              Salamander Grand Piano
            </a>{' '}
            · Alexander Holm ·{' '}
            <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">
              CC BY 3.0
            </a>
          </li>
          <li>
            {t('about.credits.instruments')}{' '}
            <a href="https://github.com/nbrosowsky/tonejs-instruments" target="_blank" rel="noopener noreferrer">
              tonejs-instruments
            </a>{' '}
            · Nicholaus P. Brosowsky ·{' '}
            <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">
              CC BY 3.0
            </a>
          </li>
          <li>{t('about.credits.songs')}</li>
        </ul>
      </section>
    </main>
  );
}
