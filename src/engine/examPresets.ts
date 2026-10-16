// 模拟考试的试卷定义（固定的部分、题数、难度、时限与重听次数）。
// 与出题、计分（exam.ts）分开：首页的考试入口卡片只需要试卷列表，不必把考试逻辑放进首屏脚本。

import type { MessageKey } from '../i18n';

export interface ExamSection {
  /** 部分名称的词典键 */
  title: MessageKey;
  exId: string;
  /** 取该练习（在 options 下）的哪些级别，考点为这些级别的并集 */
  levels: number[];
  /** 固定的选项（未列出的取练习默认值） */
  options: Record<string, string>;
  /** 题数 */
  count: number;
  /** 本部分满分（全卷合计 100） */
  points: number;
}

export interface ExamPreset {
  id: string;
  /** 名称、简介的词典键 */
  title: MessageKey;
  desc: MessageKey;
  icon: string;
  sections: ExamSection[];
  /** 建议时限（分钟），用户可关闭 */
  minutes: number;
  /** 每题自动播放一次之后允许的重听次数 */
  replays: number;
}

export const EXAM_PRESETS: ExamPreset[] = [
  {
    id: 'beginner',
    title: 'exam.p.beginner',
    desc: 'exam.p.beginner.desc',
    icon: '🌱',
    minutes: 10,
    replays: 2,
    sections: [
      { title: 'exam.sec.ivUp', exId: 'intervals', levels: [0, 1, 2], options: { dir: 'up' }, count: 6, points: 40 },
      { title: 'exam.sec.triads', exId: 'chords', levels: [0, 1], options: { voicing: 'both', inv: 'root' }, count: 5, points: 30 },
      { title: 'exam.sec.degrees', exId: 'degrees', levels: [0, 1], options: { mode: 'major', octave: 'one' }, count: 4, points: 30 },
    ],
  },
  {
    id: 'grade',
    title: 'exam.p.grade',
    desc: 'exam.p.grade.desc',
    icon: '📜',
    minutes: 23,
    replays: 2,
    sections: [
      { title: 'exam.sec.ivMix', exId: 'intervals', levels: [0, 1, 2, 3, 4], options: { dir: 'mix' }, count: 6, points: 22 },
      { title: 'exam.sec.triadsInv', exId: 'chords', levels: [0, 1], options: { voicing: 'block', inv: 'any' }, count: 5, points: 18 },
      { title: 'exam.sec.progMajor', exId: 'progressions', levels: [0, 1, 2], options: { mode: 'major', len: '4' }, count: 4, points: 17 },
      // 四部和声听写：大调原位 Ⅰ Ⅳ Ⅴ ⅵ ⅱ，四个和弦（按和弦给分）
      { title: 'exam.sec.harmony', exId: 'harmony', levels: [0, 1], options: { mode: 'major', len: '4' }, count: 2, points: 12 },
      { title: 'exam.sec.dictation', exId: 'dictation', levels: [0, 1, 2], options: { mode: 'major', len: '5' }, count: 3, points: 18 },
      { title: 'exam.sec.rhythm', exId: 'rhythm', levels: [0, 1, 2], options: { speed: 'mid', bars: '1' }, count: 4, points: 13 },
    ],
  },
  {
    id: 'conserv',
    title: 'exam.p.conserv',
    desc: 'exam.p.conserv.desc',
    icon: '🎓',
    minutes: 35,
    replays: 2,
    sections: [
      { title: 'exam.sec.ivHarm', exId: 'intervals', levels: [0, 1, 2, 3, 4, 5], options: { dir: 'harm' }, count: 6, points: 10 },
      // 复音程（九度至十五度）：intervals 的第 7–12 级
      { title: 'exam.sec.ivCompound', exId: 'intervals', levels: [6, 7, 8, 9, 10, 11], options: { dir: 'harm' }, count: 3, points: 8 },
      { title: 'exam.sec.triadsInv', exId: 'chords', levels: [0, 1], options: { voicing: 'block', inv: 'any' }, count: 4, points: 10 },
      { title: 'exam.sec.sevenths', exId: 'chords', levels: [3, 4], options: { voicing: 'block', inv: 'root' }, count: 4, points: 10 },
      // 转位辨认：三和弦与七和弦的全部位置
      { title: 'exam.sec.inversions', exId: 'inversions', levels: [0, 1, 2, 3], options: { qual: 'all', voicing: 'block' }, count: 4, points: 10 },
      { title: 'exam.sec.progMinor', exId: 'progressions', levels: [0, 1, 2, 3, 4], options: { mode: 'minor', len: '4' }, count: 3, points: 12 },
      // 四部和声听写：含六和弦与属七及其转位（和声听写的第 1–4 级），四个和弦
      { title: 'exam.sec.harmonyInv', exId: 'harmony', levels: [0, 1, 2, 3], options: { mode: 'major', len: '4' }, count: 3, points: 12 },
      { title: 'exam.sec.dictChrom', exId: 'dictation', levels: [0, 1, 2, 3], options: { mode: 'major', len: '6' }, count: 3, points: 16 },
      { title: 'exam.sec.rhythmAdv', exId: 'rhythm', levels: [0, 1, 2, 3, 4], options: { speed: 'mid', bars: '2' }, count: 4, points: 12 },
    ],
  },
];

export const examPresetById: Record<string, ExamPreset> = Object.fromEntries(EXAM_PRESETS.map((p) => [p.id, p]));

export const presetCount = (p: ExamPreset) => p.sections.reduce((a, s) => a + s.count, 0);
