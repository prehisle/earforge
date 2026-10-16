import { useState } from 'react';
import type { Store } from '../engine/progress';
import type { ExerciseDef } from '../engine/types';
import { MESSAGES, type MessageKey } from '../i18n';
import { useT } from '../i18n/react';

interface Props {
  ex: ExerciseDef;
  store: Store;
  update(fn: (s: Store) => void): void;
}

type Keys = [string | MessageKey, MessageKey][];

/** 选择题通用的快捷键（与 Quiz 的键盘处理一致）；键名若是词典键则翻译 */
const CHOICE_KEYS: Keys = [
  ['1–9', 'tip.key.answer'],
  ['common.space', 'tip.key.replay'],
  ['tip.key.shift', 'tip.key.preview'],
  ['tip.key.enterRight', 'tip.key.next'],
];

/** 各练习的玩法说明（词典键 tip.<练习 id>）与快捷键 */
const TIPS: Record<string, { how: MessageKey; keys?: Keys }> = {
  degrees: { how: 'tip.degrees' },
  intervals: { how: 'tip.intervals' },
  chords: { how: 'tip.chords' },
  progressions: { how: 'tip.progressions' },
  dictation: { how: 'tip.dictation' },
  rhythm: { how: 'tip.rhythm' },
  rhythmDictation: {
    how: 'tip.rhythmDictation',
    keys: [
      ['1–7', 'tip.key.pitch'],
      ['W H Q E S', 'tip.key.dur'],
      ['.', 'tip.key.dot'],
      ['T', 'tip.key.tie'],
      ['0 / R', 'tip.key.rest'],
      ['↑ ↓', 'tip.key.octave'],
      ['= / -', 'tip.key.acc'],
      ['⌫', 'tip.key.back'],
      ['Ctrl+Z', 'tip.key.undo'],
      ['common.space', 'tip.key.replay'],
      ['common.enter', 'tip.key.submitNext'],
    ],
  },
  rhythmTap: {
    how: 'tip.rhythmTap',
    keys: [
      ['tip.key.tapKeys', 'tip.key.tap'],
      ['common.space', 'tip.key.startAgain'],
      ['common.enter', 'tip.key.next'],
    ],
  },
  singing: {
    how: 'tip.singing',
    keys: [
      ['common.space', 'tip.key.replay'],
      ['common.enter', 'tip.key.next'],
    ],
  },
};

/** 首次打开某练习时的说明卡片。关闭后记入 settings.tipsSeen；已练过该模块的老用户不显示。 */
export function ModuleTip({ ex, store, update }: Props) {
  const t = useT();
  const keyName = (k: string) => (k in MESSAGES.zh ? t(k as MessageKey) : k);
  const tip = TIPS[ex.id];
  // 只在打开时判断一次：作答后有了记录也不会让卡片中途消失
  const [show, setShow] = useState(
    () => !!tip && !store.settings.tipsSeen.includes(ex.id) && !Object.keys(store.exercises[ex.id]?.items ?? {}).length,
  );
  if (!show || !tip) return null;

  const dismiss = () => {
    setShow(false);
    update((s) => {
      if (!s.settings.tipsSeen.includes(ex.id)) s.settings.tipsSeen = [...s.settings.tipsSeen, ex.id];
    });
  };

  return (
    <aside className="module-tip" aria-label={t('tip.aria', { title: ex.title })}>
      <div className="module-tip-body">
        <strong>{t('tip.how')}</strong>
        <p>{t(tip.how)}</p>
        <dl className="module-tip-keys">
          {(tip.keys ?? CHOICE_KEYS).map(([k, v]) => (
            <div key={k + v}>
              <dt>
                <kbd>{keyName(k)}</kbd>
              </dt>
              <dd>{t(v)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <button className="ghost module-tip-close" onClick={dismiss}>
        {t('tip.gotIt')}
      </button>
    </aside>
  );
}
