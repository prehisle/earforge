import type { Choice, ExerciseDef, Level, Settings } from '../engine/types';
import { DEGREES, keyName, mod, nameInSystem, randInt, type ModeDef, type ModeId } from '../music/theory';
import {
  MODE_OPTION,
  bareItem,
  chooseTonic,
  cadenceEvents,
  degreeLevels,
  degreeMidiAnswer,
  itemMode,
  modeOf,
  noteWithResolution,
  resolutionEvents,
} from './common';

/** 考点 id 'd4' / 'minor:d3' → 相对主音的半音数。 */
export const semi = (item: string) => Number(bareItem(item).slice(1));

/** 各调式的变化音层级（调式音阶之外的 5 个半音）：先练相近调式的特征音，再练其余。 */
export const CHROMATIC: Record<ModeId, number[][]> = {
  major: [
    [3, 10],
    [6, 8, 1],
  ],
  minor: [
    [9, 11], // la ti：旋律小调
    [6, 4, 1],
  ],
  harmonic: [
    [9, 10],
    [6, 4, 1],
  ],
  dorian: [
    [11, 8],
    [6, 4, 1],
  ],
  mixolydian: [
    [11, 3],
    [6, 8, 1],
  ],
};

/** 调内音级的级别：主三和弦 → +2、4 级 → +6、7 级 → 变化音。 */
export function degreesLevels(mode: ModeDef): Level[] {
  const s = mode.scale;
  return degreeLevels(mode, [[s[0], s[2], s[4]], [s[1], s[3]], [s[5], s[6]], ...CHROMATIC[mode.id]], 3);
}

/** 按命名体系显示级数；音名/固定调需要具体调。 */
export function degreeLabel(item: string, settings: Settings, tonicPc = 0): string {
  return nameInSystem(tonicPc + semi(item), tonicPc, settings.naming, itemMode(item));
}

export function degreeChoices(items: string[], settings: Settings, tonicPc: number): Choice[] {
  return [...items]
    .sort((a, b) => semi(a) - semi(b))
    .map((id) => ({
      id,
      label: degreeLabel(id, settings, tonicPc),
      sub: settings.naming === 'jianpu' ? DEGREES[semi(id)].movableDo : DEGREES[semi(id)].jianpu,
    }));
}

export const degrees: ExerciseDef = {
  id: 'degrees',
  title: '调内音级',
  subtitle: '先听终止式建立调性，再辨认单音是第几级',
  icon: '①',
  group: '调性听觉',
  levels: degreesLevels(modeOf({})),
  levelsFor: (options) => degreesLevels(modeOf(options)),
  options: [
    MODE_OPTION,
    {
      id: 'octave',
      label: '音域',
      values: [
        { id: 'one', label: '一个八度' },
        { id: 'wide', label: '两个八度' },
      ],
      default: 'one',
    },
  ],
  itemLabel: (it, s) => degreeLabel(it, s),
  generate(item, ctx) {
    const mode = modeOf(ctx.options);
    const tonic = chooseTonic(ctx.settings);
    const tonicPc = mod(tonic, 12);
    const base = tonic + semi(item);
    const oct = ctx.options.octave === 'wide' ? randInt(-1, 0) * 12 : 0;
    const note = base + oct;
    const choices = degreeChoices(ctx.items, ctx.settings, tonicPc);
    return {
      item,
      prelude: cadenceEvents(tonic, mode),
      events: [{ notes: [note], time: 0, dur: 1.4 }],
      resolution: resolutionEvents(note, tonic, mode),
      choices,
      answer: [item],
      // 同一个调、同一个八度里的那个音，不带终止式，直接接它的解决
      choiceEvents: (id) => noteWithResolution(tonic + oct + semi(id), tonic, mode),
      midiAnswer: degreeMidiAnswer(
        choices.map((c) => c.id),
        tonic,
      ),
      prompt: `${keyName(tonicPc, mode)} ${mode.label} · 这个音是哪一级？`,
      explain: `${DEGREES[semi(item)].movableDo}（${DEGREES[semi(item)].jianpu}）— 听它如何解决到 do`,
    };
  },
};
