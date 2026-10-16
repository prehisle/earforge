// 记谱面板的编辑状态（纯函数 reducer）：选时值 / 附点 / 八度 / 升降号，输入音或休止，
// 延音线（把当前时值接到上一个音上），退格与撤销。

import type { NotateNote } from '../engine/types';

/** 基本时值（tick）：全 48、二分 24、四分 12、八分 6、十六分 3 */
export const BASES = [48, 24, 12, 6, 3] as const;
export type Base = (typeof BASES)[number];

export interface EditorState {
  notes: NotateNote[];
  base: Base;
  dot: boolean;
  /** 音高按钮的八度（-1 低、0 中、1 高） */
  octave: number;
  /** 下一个音的临时升降（-1 / 0 / 1），输入一个音后复位 */
  acc: number;
  /** 撤销栈：之前的 notes */
  history: NotateNote[][];
}

export type EditorAction =
  | { type: 'base'; base: Base }
  | { type: 'dot' }
  | { type: 'octave'; delta: number }
  | { type: 'acc'; acc: number }
  /** 按钮或数字键：调内音（相对主音的半音，0..11），按当前八度与升降号换算 */
  | { type: 'degree'; semis: number }
  /** MIDI：相对主音的半音（含八度），八度随之切换 */
  | { type: 'note'; rel: number }
  | { type: 'rest' }
  | { type: 'tie' }
  | { type: 'back' }
  | { type: 'undo' }
  | { type: 'clear' };

export const initialEditor = (): EditorState => ({ notes: [], base: 12, dot: false, octave: 0, acc: 0, history: [] });

/** 当前选中的时值（tick）：十六分音符不能加附点 */
export const curDur = (s: EditorState): number => (s.dot && s.base > 3 ? s.base * 1.5 : s.base);

export const totalTicks = (notes: NotateNote[]): number => notes.reduce((a, n) => a + n.dur, 0);

const withNotes = (s: EditorState, notes: NotateNote[]): EditorState => ({
  ...s,
  notes,
  acc: 0,
  history: [...s.history, s.notes].slice(-200),
});

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'base':
      // 换时值时取消附点（附点四分 + 八分：选四分、附点、输入，再选八分、输入）
      return { ...s, base: a.base, dot: a.base === s.base ? s.dot : false };
    case 'dot':
      return s.base === 3 ? s : { ...s, dot: !s.dot };
    case 'octave':
      return { ...s, octave: Math.max(-1, Math.min(1, s.octave + a.delta)) };
    case 'acc':
      return { ...s, acc: s.acc === a.acc ? 0 : a.acc };
    case 'degree':
      return withNotes(s, [...s.notes, { rel: a.semis + 12 * s.octave + s.acc, dur: curDur(s) }]);
    case 'note':
      return {
        ...withNotes(s, [...s.notes, { rel: a.rel, dur: curDur(s) }]),
        octave: Math.max(-1, Math.min(1, Math.floor(a.rel / 12))),
      };
    case 'rest':
      return withNotes(s, [...s.notes, { rel: null, dur: curDur(s) }]);
    case 'tie': {
      const last = s.notes[s.notes.length - 1];
      if (!last) return s;
      return withNotes(s, [...s.notes.slice(0, -1), { ...last, dur: last.dur + curDur(s) }]);
    }
    case 'back':
      return s.notes.length ? withNotes(s, s.notes.slice(0, -1)) : s;
    case 'clear':
      return s.notes.length ? withNotes(s, []) : s;
    case 'undo':
      return s.history.length ? { ...s, notes: s.history[s.history.length - 1], history: s.history.slice(0, -1) } : s;
  }
}

/** 键盘快捷键 → 动作（semis 为调内 1..7 级的半音）。不处理的键返回 null。 */
export function keyAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }, scale: number[]): EditorAction | null {
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') return { type: 'undo' };
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (/^[1-7]$/.test(k)) return { type: 'degree', semis: scale[Number(k) - 1] };
  switch (k.toLowerCase()) {
    case 'w':
      return { type: 'base', base: 48 };
    case 'h':
      return { type: 'base', base: 24 };
    case 'q':
      return { type: 'base', base: 12 };
    case 'e':
      return { type: 'base', base: 6 };
    case 's':
      return { type: 'base', base: 3 };
    case '.':
      return { type: 'dot' };
    case 't':
      return { type: 'tie' };
    case '0':
    case 'r':
      return { type: 'rest' };
    case 'arrowup':
      return { type: 'octave', delta: 1 };
    case 'arrowdown':
      return { type: 'octave', delta: -1 };
    case '=':
    case '+':
      return { type: 'acc', acc: 1 };
    case '-':
      return { type: 'acc', acc: -1 };
    case 'backspace':
      return { type: 'back' };
  }
  return null;
}
