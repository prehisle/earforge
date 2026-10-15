import type { ExerciseDef, Level } from '../engine/types';
import { DEGREES, keyName, mod, type ModeDef } from '../music/theory';
import { MODE_OPTION, chooseTonic, cadenceEvents, degreeLevels, melodyEvents, modeItem, modeOf } from './common';
import { CHROMATIC, degreeChoices, degreeLabel, semi } from './degrees';

/** 旋律听写的级别：按音阶顺序 do re mi → +4、5 级 → +6、7 级 → 变化音。 */
function dictationLevels(mode: ModeDef): Level[] {
  const s = mode.scale;
  // 大调沿用原有的变化音组合 ♭3 ♭7 ♯4
  const chromatic = mode.id === 'major' ? [3, 10, 6] : CHROMATIC[mode.id][0];
  return degreeLevels(mode, [s.slice(0, 3), s.slice(3, 5), s.slice(5), chromatic], 3, ' ');
}

/** 生成以 do 开头、包含指定音级、以级进为主的旋律（相对主音的半音数）。 */
export function makeMelody(pool: number[], must: number, len: number): number[] {
  const sorted = [...pool].sort((a, b) => a - b);
  const mel = [0];
  const slot = must === 0 ? -1 : 1 + Math.floor(Math.random() * (len - 1));
  for (let i = 1; i < len; i++) {
    if (i === slot) {
      mel.push(must);
      continue;
    }
    const prev = mel[i - 1];
    // 距离越近权重越大，避免同音反复
    const weights = sorted.map((d) => (d === prev ? 0.15 : 1 / Math.pow(Math.abs(d - prev), 1.2)));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let next = sorted[0];
    for (let k = 0; k < sorted.length; k++) {
      r -= weights[k];
      if (r <= 0) {
        next = sorted[k];
        break;
      }
    }
    mel.push(next);
  }
  return mel;
}

export const dictation: ExerciseDef = {
  id: 'dictation',
  title: '旋律听写',
  subtitle: '听一段短旋律，按顺序写出唱名',
  icon: '✎',
  group: '调性听觉',
  levels: dictationLevels(modeOf({})),
  levelsFor: (options) => dictationLevels(modeOf(options)),
  options: [
    MODE_OPTION,
    {
      id: 'len',
      label: '音符数',
      values: [
        { id: '3', label: '3 个' },
        { id: '4', label: '4 个' },
        { id: '5', label: '5 个' },
        { id: '6', label: '6 个' },
        { id: '8', label: '8 个' },
      ],
      default: '3',
    },
  ],
  itemLabel: (it, s) => degreeLabel(it, s),
  generate(item, ctx) {
    const mode = modeOf(ctx.options);
    const tonic = chooseTonic(ctx.settings);
    const tonicPc = mod(tonic, 12);
    // 旋律总从 do 开始，所以 do 必须可选
    const items = ctx.items.some((it) => semi(it) === 0) ? ctx.items : [modeItem(mode, 'd0'), ...ctx.items];
    const idOf = new Map(items.map((it) => [semi(it), it]));
    const mel = makeMelody([...idOf.keys()], semi(item), Number(ctx.options.len));
    const answer = mel.map((d) => idOf.get(d)!);
    return {
      item,
      prelude: cadenceEvents(tonic, mode),
      events: melodyEvents(
        mel.map((d) => tonic + d),
        0.62,
      ),
      choices: degreeChoices(items, ctx.settings, tonicPc),
      answer,
      stepItems: answer,
      prompt: `${keyName(tonicPc, mode)} ${mode.label} · 依次写出 ${mel.length} 个音（第一个是 do）`,
      explain: mel.map((d) => DEGREES[d].movableDo).join(' '),
    };
  },
};
