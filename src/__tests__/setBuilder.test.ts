import { describe, expect, it } from 'vitest';
import { setAllItems } from '../engine/setRunner';
import { DEFAULT_SETTINGS } from '../engine/types';
import { exerciseById } from '../exercises';
import { translate } from '../i18n';
import type { TFunc } from '../i18n/react';
import { firstProblem, partSummary } from '../ui/setBuilderUtil';

const t: TFunc = (key, params) => translate('zh', key, params);

describe('组合编辑页：卡片摘要', () => {
  it('考点数 · 各选项取值 · 比重（×1 不写）', () => {
    const ex = exerciseById.chords;
    const total = setAllItems(ex, {}).length;
    expect(partSummary(ex, { ex: 'chords', items: ['maj', 'min'], options: { voicing: 'block' } }, t)).toBe(`已选 2/${total} · 柱式 · 仅原位`);
    expect(partSummary(ex, { ex: 'chords', items: ['maj'], options: {}, weight: 2 }, t)).toMatch(/^已选 1\/\d+ · .+ · .+ · ×2$/);
  });

  it('没有选项的练习只有考点数', () => {
    const ex = exerciseById.rhythm;
    const s = partSummary(ex, { ex: 'rhythm', items: [], options: {} }, t);
    expect(s.startsWith('已选 0/')).toBe(true);
  });
});

describe('组合编辑页：首个需要修正的地方', () => {
  const ok = { name: 'x', count: 20, parts: [{ ex: 'chords', items: ['maj', 'min'], options: {} }] };
  it('按页面顺序：名称 → 题数 → 练习 → 考点', () => {
    expect(firstProblem(ok, DEFAULT_SETTINGS)).toBeNull();
    expect(firstProblem({ ...ok, name: '  ', count: 0 }, DEFAULT_SETTINGS)).toEqual({ kind: 'name' });
    expect(firstProblem({ ...ok, count: 3, parts: [] }, DEFAULT_SETTINGS)).toEqual({ kind: 'count' });
    expect(firstProblem({ ...ok, parts: [] }, DEFAULT_SETTINGS)).toEqual({ kind: 'parts' });
    const bad = { ...ok, parts: [...ok.parts, { ex: 'intervals', items: [], options: {} }] };
    expect(firstProblem(bad, DEFAULT_SETTINGS)).toEqual({ kind: 'part', ex: 'intervals' });
  });
});
