import type { ExerciseDef, Level } from '../engine/types';
import {
  MODES,
  diatonicTriads,
  keyName,
  makeTriad,
  mod,
  pick,
  type ModeDef,
  type ModeId,
  type Triad,
} from '../music/theory';
import { MODE_OPTION, chooseTonic, cadenceEvents, modeItem, modeOf } from './common';

/** 调式中可考的和弦。自然小调的属和弦按惯例用大三和弦 Ⅴ（和声小调的导音），自然的 ⅴ 放在最后一级。 */
export function modeChords(mode: ModeDef): Triad[] {
  const triads = diatonicTriads(mode);
  if (mode.id !== 'minor') return triads;
  return [...triads.slice(0, 4), makeTriad(4, 7, 4, 7), ...triads.slice(4)];
}

// 各调式的级别（和弦 id 不含调式前缀）：先练主、下属与最具特征的和弦
const LEVEL_IDS: Record<ModeId, string[][]> = {
  major: [['I', 'IV', 'V'], ['vi'], ['ii'], ['iii', 'vii']],
  minor: [['i', 'iv', 'V'], ['bVI', 'bVII'], ['bIII'], ['ii'], ['v']],
  harmonic: [['i', 'iv', 'V'], ['bVI'], ['vii'], ['ii', 'bIII']],
  dorian: [['i', 'IV', 'bVII'], ['v', 'bIII'], ['ii'], ['vi']],
  mixolydian: [['I', 'IV', 'bVII'], ['v'], ['vi', 'ii'], ['iii']],
};

// 所有调式的考点 id → 和弦
const BY_ITEM: Record<string, Triad> = {};
for (const m of MODES) for (const t of modeChords(m)) BY_ITEM[modeItem(m, t.id)] = t;

function progressionLevels(mode: ModeDef): Level[] {
  return LEVEL_IDS[mode.id].map((ids, i) => ({
    name: `${i ? '+ ' : ''}${ids.map((id) => BY_ITEM[modeItem(mode, id)].roman).join(' · ')}`,
    items: ids.map((id) => modeItem(mode, id)),
  }));
}

function voicing(tonic: number, f: Triad): number[] {
  const r = tonic + f.root - (f.root >= 7 ? 12 : 0);
  return [r - 12, r, r + f.third, r + f.fifth];
}

export const progressions: ExerciseDef = {
  id: 'progressions',
  title: '级数和弦',
  subtitle: '在调性中辨认 Ⅰ Ⅳ Ⅴ ⅵ…，扒歌、即兴的核心能力',
  icon: 'Ⅳ',
  group: '调性听觉',
  levels: progressionLevels(modeOf({})),
  levelsFor: (options) => progressionLevels(modeOf(options)),
  options: [
    MODE_OPTION,
    {
      id: 'len',
      label: '题型',
      values: [
        { id: '1', label: '单个和弦' },
        { id: '4', label: '四和弦进行' },
      ],
      default: '1',
    },
  ],
  itemLabel: (it) => (BY_ITEM[it] ? `${BY_ITEM[it].roman} ${BY_ITEM[it].name}` : it),
  generate(item, ctx) {
    const mode = modeOf(ctx.options);
    const tonic = chooseTonic(ctx.settings);
    const keyPc = mod(tonic, 12);
    const key = `${keyName(keyPc, mode)} ${mode.label}`;
    const four = ctx.options.len === '4';
    const tonicItem = modeItem(mode, modeChords(mode)[0].id);
    const ids = [...new Set(four ? [tonicItem, ...ctx.items] : ctx.items)].filter((id) => BY_ITEM[id]);
    const choices = ids
      .sort((a, b) => BY_ITEM[a].root - BY_ITEM[b].root)
      .map((id) => ({ id, label: BY_ITEM[id].roman, sub: BY_ITEM[id].name }));
    if (four) {
      // 以主和弦开头的四和弦进行，考点放在随机位置
      const seq = [tonicItem];
      const slot = 1 + Math.floor(Math.random() * 3);
      for (let i = 1; i < 4; i++) seq.push(i === slot ? item : pick(ctx.items));
      return {
        item,
        prelude: cadenceEvents(tonic, mode),
        events: seq.map((id, i) => ({ notes: voicing(tonic, BY_ITEM[id]), time: i * 1.1, dur: 1.05 })),
        choices,
        answer: seq,
        stepItems: seq,
        prompt: `${key} · 依次选出 4 个和弦（第一个是 ${BY_ITEM[tonicItem].roman}）`,
        explain: seq.map((id) => BY_ITEM[id].roman).join(' → '),
      };
    }
    return {
      item,
      prelude: cadenceEvents(tonic, mode),
      events: [{ notes: voicing(tonic, BY_ITEM[item]), time: 0, dur: 1.8 }],
      choices,
      answer: [item],
      prompt: `${key} · 这是哪个级数和弦？`,
      explain: `${BY_ITEM[item].roman} ${BY_ITEM[item].name}`,
    };
  },
};
