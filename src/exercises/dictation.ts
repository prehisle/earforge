import type { ExerciseDef } from '../engine/types';
import { DEGREES, keyName, mod } from '../music/theory';
import { chooseTonic, cadenceEvents, melodyEvents } from './common';
import { degreeChoices, degreeLabel, semi } from './degrees';

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
  levels: [
    { name: 'do re mi', items: ['d0', 'd2', 'd4'] },
    { name: '+ fa sol', items: ['d5', 'd7'] },
    { name: '+ la ti', items: ['d9', 'd11'] },
    { name: '+ 变化音 ♭3 ♭7 ♯4', items: ['d3', 'd10', 'd6'] },
  ],
  options: [
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
    const tonic = chooseTonic(ctx.settings);
    const tonicPc = mod(tonic, 12);
    // 旋律总从 do 开始，所以 do 必须可选
    const items = ctx.items.includes('d0') ? ctx.items : ['d0', ...ctx.items];
    const pool = items.map(semi);
    const mel = makeMelody(pool, semi(item), Number(ctx.options.len));
    const answer = mel.map((d) => `d${d}`);
    return {
      item,
      prelude: cadenceEvents(tonic),
      events: melodyEvents(
        mel.map((d) => tonic + d),
        0.62,
      ),
      choices: degreeChoices(items, ctx.settings, tonicPc),
      answer,
      stepItems: answer,
      prompt: `${keyName(tonicPc)} 大调 · 依次写出 ${mel.length} 个音（第一个是 do）`,
      explain: mel.map((d) => DEGREES[d].movableDo).join(' '),
    };
  },
};
