// 选项网格：练习与模拟考试共用的布局。选项带 group 时按组分段，每组一个小标题与自己的网格
// （读屏通过 role="group" + aria-label 读出组名）；按钮本身由调用方渲染，序号 i 是在全部选项中的位置（对应作答键）。

import type { ReactNode } from 'react';
import type { Choice } from '../engine/types';
import { groupChoices } from './keys';

interface Props {
  choices: Choice[];
  /** 附加在最外层的类名（如 exam-choices） */
  className?: string;
  render(c: Choice, i: number): ReactNode;
}

export function ChoiceGrid({ choices, className, render }: Props) {
  const groups = groupChoices(choices);
  const extra = className ? ` ${className}` : '';
  if (!groups) return <div className={`choices n${Math.min(choices.length, 8)}${extra}`}>{choices.map((c, i) => render(c, i))}</div>;
  return (
    <div className={`choice-groups${extra}`}>
      {groups.map((g, gi) => (
        <div key={gi} className="choice-group" role="group" aria-label={g.group || undefined}>
          {g.group && (
            // 组名已由 aria-label 读出，小标题本身不再重复朗读
            <span className="choice-group-label" aria-hidden="true">
              {g.group}
            </span>
          )}
          <div className="choices grouped">{g.items.map(({ c, i }) => render(c, i))}</div>
        </div>
      ))}
    </div>
  );
}
