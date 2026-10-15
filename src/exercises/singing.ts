import type { ExerciseDef } from '../engine/types';
import { keyName, mod, nameInSystem, randInt } from '../music/theory';
import { cadenceEvents, melodyEvents } from './common';
import { degreeLabel, semi } from './degrees';
import { makeMelody } from './dictation';

export const singing: ExerciseDef = {
  id: 'singing',
  title: '视唱 / 模唱',
  subtitle: '对着麦克风唱出来，实时判断音准',
  icon: '🎤',
  group: '视唱练耳',
  mic: true,
  levels: [
    { name: 'do · mi · sol', items: ['d0', 'd4', 'd7'] },
    { name: '+ re · fa', items: ['d2', 'd5'] },
    { name: '+ la · ti', items: ['d9', 'd11'] },
  ],
  options: [
    {
      id: 'mode',
      label: '模式',
      values: [
        { id: 'sight', label: '视唱（看唱名唱）' },
        { id: 'echo', label: '模唱（听后唱）' },
      ],
      default: 'sight',
    },
    {
      id: 'len',
      label: '音符数',
      values: [
        { id: '1', label: '1 个' },
        { id: '3', label: '3 个' },
        { id: '5', label: '5 个' },
      ],
      default: '1',
    },
  ],
  itemLabel: (it, s) => degreeLabel(it, s),
  generate(item, ctx) {
    // 主音落在歌者舒适的音区
    const tonic = ctx.settings.voice === 'low' ? randInt(48, 53) : randInt(60, 65);
    const tonicPc = mod(tonic, 12);
    const len = Number(ctx.options.len);
    const degs = len === 1 ? [semi(item)] : makeMelody(ctx.items.map(semi), semi(item), len);
    const targets = degs.map((d) => tonic + d);
    const sight = ctx.options.mode === 'sight';
    return {
      item,
      prelude: cadenceEvents(tonic),
      events: melodyEvents(targets, 0.7),
      choices: [],
      answer: degs.map((d) => `d${d}`),
      stepItems: degs.map((d) => `d${d}`),
      prompt: sight
        ? `${keyName(tonicPc)} 大调 · 听完终止式后，唱出下面的音`
        : `${keyName(tonicPc)} 大调 · 听旋律，然后唱出来`,
      sing: {
        targets,
        display: targets.map((m) => nameInSystem(m, tonicPc, ctx.settings.naming)),
        showDisplay: sight,
      },
    };
  },
};
