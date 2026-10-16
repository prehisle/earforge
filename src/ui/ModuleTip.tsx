import { useState } from 'react';
import type { Store } from '../engine/progress';
import type { ExerciseDef } from '../engine/types';

interface Props {
  ex: ExerciseDef;
  store: Store;
  update(fn: (s: Store) => void): void;
}

/** 选择题通用的快捷键（与 Quiz 的键盘处理一致） */
const CHOICE_KEYS: [string, string][] = [
  ['1–9', '作答'],
  ['空格', '重听'],
  ['Shift+数字', '试听点错的选项（答完后可试听全部）'],
  ['回车 / →', '下一题'],
];

/** 各练习的玩法说明与快捷键 */
const TIPS: Record<string, { how: string; keys?: [string, string][] }> = {
  degrees: {
    how: '先听一段终止式建立调性，再听一个单音，判断它是调里的哪一级。答对后会从这个音级进回到 do，帮你记住每个音级的「倾向感」。',
  },
  intervals: {
    how: '听两个音，判断它们之间的音程。在「选项」里可以切换上行、下行、和声（同时发声）。',
  },
  chords: {
    how: '听一个和弦，凭色彩判断它的性质：大三明亮、小三柔和、减三紧张、增三悬浮……「选项」里可切换柱式 / 琶音与转位。',
  },
  progressions: {
    how: '先听终止式建立调性，再辨认和弦是 Ⅰ Ⅳ Ⅴ ⅵ… 中的哪一个。四和弦进行要按顺序逐个作答。',
  },
  dictation: {
    how: '听一段以 do 开头的短旋律，按顺序逐个点出每个音的唱名。上方的格子显示当前写到第几个音。',
  },
  rhythm: {
    how: '听一段节奏（先有预备拍），从几个相似的节奏谱中选出你听到的那个。',
  },
  rhythmTap: {
    how: '跟着节拍器的预备拍，在正确的时机把节奏打出来。「看谱打」边看谱边打，「听后打」先听一遍再凭记忆打；结束后时间轴会标出每一下早了还是晚了。',
    keys: [
      ['空格 / 字母键', '打拍（也可以点击打拍区）'],
      ['空格', '开始 / 再试一次'],
      ['回车', '下一题'],
    ],
  },
  singing: {
    how: '需要麦克风权限。「视唱」看着唱名唱，「模唱」先听再唱；唱准并稳定一小会儿就算通过，面板上实时显示音准。',
    keys: [
      ['空格', '重听'],
      ['回车', '下一题'],
    ],
  },
};

/** 首次打开某练习时的说明卡片。关闭后记入 settings.tipsSeen；已练过该模块的老用户不显示。 */
export function ModuleTip({ ex, store, update }: Props) {
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
    <aside className="module-tip" aria-label={`${ex.title}玩法说明`}>
      <div className="module-tip-body">
        <strong>💡 怎么练</strong>
        <p>{tip.how}</p>
        <dl className="module-tip-keys">
          {(tip.keys ?? CHOICE_KEYS).map(([k, v]) => (
            <div key={k + v}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <button className="ghost module-tip-close" onClick={dismiss}>
        知道了
      </button>
    </aside>
  );
}
