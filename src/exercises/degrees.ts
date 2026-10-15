import type { Choice, ExerciseDef, Settings } from '../engine/types';
import { DEGREES, keyName, mod, nameInSystem, randInt } from '../music/theory';
import { chooseTonic, cadenceEvents, resolutionEvents } from './common';

/** 考点 id 'd4' → 相对主音 4 个半音（mi）。 */
export const semi = (item: string) => Number(item.slice(1));

/** 按命名体系显示级数；音名/固定调需要具体调。 */
export function degreeLabel(item: string, settings: Settings, tonicPc = 0): string {
  return nameInSystem(tonicPc + semi(item), tonicPc, settings.naming);
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
  levels: [
    { name: 'do · mi · sol', items: ['d0', 'd4', 'd7'] },
    { name: '+ re · fa', items: ['d2', 'd5'] },
    { name: '+ la · ti', items: ['d9', 'd11'] },
    { name: '+ 变化音 ♭3 ♭7', items: ['d3', 'd10'] },
    { name: '+ 变化音 ♯4 ♭6 ♭2', items: ['d6', 'd8', 'd1'] },
  ],
  options: [
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
    const tonic = chooseTonic(ctx.settings);
    const tonicPc = mod(tonic, 12);
    const base = tonic + semi(item);
    const note = ctx.options.octave === 'wide' ? base + randInt(-1, 0) * 12 : base;
    return {
      item,
      prelude: cadenceEvents(tonic),
      events: [{ notes: [note], time: 0, dur: 1.4 }],
      resolution: resolutionEvents(note, tonic),
      choices: degreeChoices(ctx.items, ctx.settings, tonicPc),
      answer: [item],
      prompt: `${keyName(tonicPc)} 大调 · 这个音是哪一级？`,
      explain: `${DEGREES[semi(item)].movableDo}（${DEGREES[semi(item)].jianpu}）— 听它如何解决到 do`,
    };
  },
};
