import { describe, expect, it } from 'vitest';
import { CHOICE_KEYS, choiceIndexForKey, choiceKeyLabel, groupChoices } from '../ui/keys';

const key = (k: string, code = '', shiftKey = false) => choiceIndexForKey({ key: k, code, shiftKey });

describe('选择题的作答键', () => {
  it('1–9、0，再接 Q–P：共 20 个，各不相同', () => {
    expect(CHOICE_KEYS).toHaveLength(20);
    expect(new Set(CHOICE_KEYS).size).toBe(20);
    expect([0, 8, 9, 10, 18, 19].map(choiceKeyLabel)).toEqual(['1', '9', '0', 'Q', 'O', 'P']);
    expect(choiceKeyLabel(20)).toBeNull();
  });

  it('按键 → 选项序号', () => {
    expect(key('1', 'Digit1')).toBe(0);
    expect(key('9', 'Numpad9')).toBe(8);
    expect(key('0', 'Digit0')).toBe(9);
    expect(key('q', 'KeyQ')).toBe(10);
    expect(key('Q', 'KeyQ')).toBe(10); // 大写锁定
    expect(key('p', 'KeyP')).toBe(19);
  });

  it('Shift + 作答键（试听）：数字按 code 识别，字母不区分大小写', () => {
    expect(key('!', 'Digit1', true)).toBe(0);
    expect(key(')', 'Digit0', true)).toBe(9);
    expect(key('W', 'KeyW', true)).toBe(11);
  });

  it('其他快捷键不是作答键', () => {
    for (const k of [' ', 'Enter', 'ArrowRight', 'Escape', 'a', 's', 'z', '.', '-', '='])
      expect(key(k, k === ' ' ? 'Space' : ''), k).toBe(-1);
  });
});

describe('选项分组', () => {
  it('没有分组时返回 null（按原样单个网格）', () => {
    expect(groupChoices<{ id: string; group?: string }>([{ id: 'a' }, { id: 'b' }])).toBeNull();
  });

  it('相邻的同名分组合并，序号保持全局位置', () => {
    const g = groupChoices([
      { id: 'I', group: 'T' },
      { id: 'vi', group: 'T' },
      { id: 'IV', group: 'PD' },
      { id: 'V', group: 'D' },
      { id: 'V7', group: 'D' },
    ]);
    expect(g?.map((x) => [x.group, x.items.map((it) => `${it.c.id}@${it.i}`)])).toEqual([
      ['T', ['I@0', 'vi@1']],
      ['PD', ['IV@2']],
      ['D', ['V@3', 'V7@4']],
    ]);
  });

  it('部分选项没有分组：归入无名分组', () => {
    const g = groupChoices([{ id: 'a' }, { id: 'b', group: 'X' }]);
    expect(g?.map((x) => x.group)).toEqual(['', 'X']);
  });
});
