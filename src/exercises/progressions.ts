import type { ExerciseDef, Level } from '../engine/types';
import {
  MODES,
  diatonicTriads,
  keyLabel,
  makeTriad,
  mod,
  pick,
  type ModeDef,
  type ModeId,
  type Triad,
} from '../music/theory';
import { keyScore } from '../music/notation';
import { t } from '../i18n';
import { MODE_OPTION, chooseTonic, cadenceEvents, level, modeItem, modeOf, option } from './common';

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
  return LEVEL_IDS[mode.id].map((ids, i) =>
    level(
      () => `${i ? '+ ' : ''}${ids.map((id) => BY_ITEM[modeItem(mode, id)].roman).join(' · ')}`,
      ids.map((id) => modeItem(mode, id)),
    ),
  );
}

function voicing(tonic: number, f: Triad): number[] {
  const r = tonic + f.root - (f.root >= 7 ? 12 : 0);
  return [r - 12, r, r + f.third, r + f.fifth];
}

export const progressions: ExerciseDef = {
  id: 'progressions',
  get title() {
    return t('ex.progressions.title');
  },
  get subtitle() {
    return t('ex.progressions.subtitle');
  },
  icon: 'Ⅳ',
  group: 'tonal',
  levels: progressionLevels(modeOf({})),
  levelsFor: (options) => progressionLevels(modeOf(options)),
  options: [
    MODE_OPTION,
    option(
      'len',
      'ex.progressions.len',
      [
        ['1', 'ex.progressions.len.1'],
        ['4', 'ex.progressions.len.4'],
      ],
      '1',
    ),
  ],
  itemLabel: (it) => (BY_ITEM[it] ? `${BY_ITEM[it].roman} ${BY_ITEM[it].name}` : it),
  generate(item, ctx) {
    const mode = modeOf(ctx.options);
    const tonic = chooseTonic(ctx.settings);
    const keyPc = mod(tonic, 12);
    const key = keyLabel(keyPc, mode);
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
      const play = (ids: string[]) => ids.map((id, i) => ({ notes: voicing(tonic, BY_ITEM[id]), time: i * 1.1, dur: 1.05 }));
      return {
        item,
        prelude: cadenceEvents(tonic, mode),
        events: play(seq),
        // 把第 step 个和弦换成所选和弦后的进行
        choiceEvents: (id, step = 0) => play(seq.map((s, i) => (i === step ? id : s))),
        choices,
        answer: seq,
        stepItems: seq,
        score: keyScore(
          seq.map((id) => voicing(tonic, BY_ITEM[id])),
          keyPc,
          mode,
        ),
        prompt: t('ex.progressions.promptFour', { key, first: BY_ITEM[tonicItem].roman }),
        explain: seq.map((id) => BY_ITEM[id].roman).join(' → '),
      };
    }
    const single = (id: string) => [{ notes: voicing(tonic, BY_ITEM[id]), time: 0, dur: 1.8 }];
    return {
      item,
      prelude: cadenceEvents(tonic, mode),
      events: single(item),
      choiceEvents: single,
      choices,
      answer: [item],
      score: keyScore([voicing(tonic, BY_ITEM[item])], keyPc, mode),
      prompt: t('ex.progressions.prompt', { key }),
      explain: `${BY_ITEM[item].roman} ${BY_ITEM[item].name}`,
    };
  },
};
