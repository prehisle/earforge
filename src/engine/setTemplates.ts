// 练习组合的内置模板：新建组合时一键填好常用搭配。考点按级别给出（取所列级别的并集），名称是词典键。

import type { MessageKey } from '../i18n';
import { exerciseById } from '../exercises';
import type { PracticeSet } from './practiceSet';
import { setLevels } from './setRunner';

export interface SetTemplatePart {
  ex: string;
  /** 取这些级别（0 起）的考点 */
  levels: number[];
  options: Record<string, string>;
  weight?: number;
}

export interface SetTemplate {
  id: string;
  name: MessageKey;
  icon: string;
  count: number;
  parts: SetTemplatePart[];
}

export const SET_TEMPLATES: SetTemplate[] = [
  {
    id: 'ivChord',
    name: 'sets.tpl.ivChord',
    icon: '↕',
    count: 20,
    parts: [
      { ex: 'intervals', levels: [0, 1, 2], options: { dir: 'mix' } },
      { ex: 'chords', levels: [0, 1], options: { voicing: 'both', inv: 'root' } },
    ],
  },
  {
    id: 'grade',
    name: 'sets.tpl.grade',
    icon: '📜',
    count: 20,
    parts: [
      { ex: 'intervals', levels: [0, 1, 2, 3, 4], options: { dir: 'mix' }, weight: 2 },
      { ex: 'chords', levels: [0, 1], options: { voicing: 'block', inv: 'any' } },
      { ex: 'progressions', levels: [0, 1, 2], options: { mode: 'major', len: '4' } },
      { ex: 'rhythm', levels: [0, 1, 2], options: { speed: 'mid', bars: '1' } },
    ],
  },
  {
    id: 'harmony',
    name: 'sets.tpl.harmony',
    icon: '🎹',
    count: 20,
    parts: [
      { ex: 'chords', levels: [0, 1, 2, 3], options: { voicing: 'block', inv: 'root' } },
      { ex: 'inversions', levels: [0, 1], options: { qual: 'basic', voicing: 'block' } },
      { ex: 'progressions', levels: [0, 1, 2], options: { mode: 'major', len: '4' }, weight: 2 },
      { ex: 'harmony', levels: [0, 1], options: { mode: 'major', len: '4' } },
    ],
  },
  {
    id: 'tonal',
    name: 'sets.tpl.tonal',
    icon: '🎯',
    count: 20,
    parts: [
      { ex: 'degrees', levels: [0, 1, 2], options: { mode: 'major', octave: 'one' }, weight: 2 },
      { ex: 'dictation', levels: [0, 1], options: { mode: 'major', len: '3' } },
      { ex: 'progressions', levels: [0, 1], options: { mode: 'major', len: '1' } },
    ],
  },
  {
    id: 'rhythm',
    name: 'sets.tpl.rhythm',
    icon: '🥁',
    count: 10,
    parts: [
      { ex: 'rhythm', levels: [0, 1, 2], options: { speed: 'mid', bars: '1' }, weight: 2 },
      { ex: 'rhythmDictation', levels: [0, 1, 2], options: { mode: 'major', bars: '1', speed: 'slow', countIn: 'on' } },
    ],
  },
];

/** 由模板生成组合草稿（未规范化、没有 id）。name 为当前语言的模板名。 */
export function templateSet(tpl: SetTemplate, name: string): Omit<PracticeSet, 'id' | 'created'> {
  return {
    name,
    count: tpl.count,
    parts: tpl.parts.map((p) => {
      const levels = setLevels(exerciseById[p.ex], p.options);
      const items = [...new Set(p.levels.flatMap((i) => levels[i]?.items ?? []))];
      return { ex: p.ex, items, options: { ...p.options }, ...(p.weight ? { weight: p.weight } : {}) };
    }),
  };
}
