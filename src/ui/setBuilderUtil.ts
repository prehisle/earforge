// 组合编辑页的纯函数：练习卡片折叠时的一行摘要、考点是否足够、首个需要修正的位置。
import { exerciseById } from '../exercises';
import type { PracticeSet, SetPart } from '../engine/practiceSet';
import { fullOptions, minItems, setAllItems, SET_COUNT_MAX, SET_COUNT_MIN } from '../engine/setRunner';
import type { ExerciseDef, Settings } from '../engine/types';
import type { TFunc } from '../i18n/react';

/** 这个练习至少要选几个考点（只选一个时才需要出题判断：选项就是考点的练习至少要两个） */
export function partNeed(ex: ExerciseDef, part: SetPart, settings: Settings): number {
  return part.items.length >= 2 ? 1 : minItems(ex, part.options, settings);
}

/** 折叠卡片的一行摘要，如「已选 9/12 · 柱式 · 仅原位 · ×2」：考点数、各选项的取值、比重（×1 不写） */
export function partSummary(ex: ExerciseDef, part: SetPart, t: TFunc): string {
  const opts = fullOptions(ex, part.options);
  const bits = [t('sets.sumItems', { n: part.items.length, total: setAllItems(ex, opts).length })];
  for (const o of ex.options ?? []) {
    const v = o.values.find((x) => x.id === opts[o.id]);
    if (v) bits.push(v.label);
  }
  if ((part.weight ?? 1) > 1) bits.push(`×${part.weight}`);
  return bits.join(' · ');
}

export type Problem = { kind: 'name' } | { kind: 'parts' } | { kind: 'part'; ex: string } | { kind: 'count' };

/** 按页面从上到下的顺序找第一个需要修正的地方（保存失败时把焦点移过去） */
export function firstProblem(d: Pick<PracticeSet, 'name' | 'parts' | 'count'>, settings: Settings): Problem | null {
  if (!d.name.trim()) return { kind: 'name' };
  if (!Number.isInteger(d.count) || d.count < SET_COUNT_MIN || d.count > SET_COUNT_MAX) return { kind: 'count' };
  if (d.parts.length === 0) return { kind: 'parts' };
  for (const p of d.parts) if (p.items.length < partNeed(exerciseById[p.ex], p, settings)) return { kind: 'part', ex: p.ex };
  return null;
}
