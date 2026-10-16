import type { ExerciseDef, Level } from '../engine/types';
import { keyScore } from '../music/notation';
import { keyName, mod, nameInSystem, randInt, type ModeDef } from '../music/theory';
import { MODE_OPTION, cadenceEvents, degreeLevels, melodyEvents, modeItem, modeOf } from './common';
import { degreeLabel, semi } from './degrees';
import { makeMelody } from './dictation';

/** 视唱的级别：主三和弦 → +2、4 级 → +6、7 级（只唱自然音级）。 */
function singingLevels(mode: ModeDef): Level[] {
  const s = mode.scale;
  return degreeLevels(mode, [[s[0], s[2], s[4]], [s[1], s[3]], [s[5], s[6]]], 3);
}

export const singing: ExerciseDef = {
  id: 'singing',
  title: '视唱 / 模唱',
  subtitle: '对着麦克风唱出来，实时判断音准',
  icon: '🎤',
  group: '视唱练耳',
  mic: true,
  levels: singingLevels(modeOf({})),
  levelsFor: (options) => singingLevels(modeOf(options)),
  options: [
    MODE_OPTION,
    {
      // 原 id 为 'mode'，现让给调式选项；旧数据中的取值会被 getProgress 重置为默认
      id: 'task',
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
    const mode = modeOf(ctx.options);
    // 主音落在歌者舒适的音区
    const tonic = ctx.settings.voice === 'low' ? randInt(48, 53) : randInt(60, 65);
    const tonicPc = mod(tonic, 12);
    const len = Number(ctx.options.len);
    const idOf = new Map(ctx.items.map((it) => [semi(it), it]));
    const degs = len === 1 ? [semi(item)] : makeMelody([...idOf.keys()], semi(item), len);
    const answer = degs.map((d) => idOf.get(d) ?? modeItem(mode, `d${d}`));
    const targets = degs.map((d) => tonic + d);
    const sight = ctx.options.task !== 'echo';
    const key = `${keyName(tonicPc, mode)} ${mode.label}`;
    return {
      item,
      prelude: cadenceEvents(tonic, mode),
      events: melodyEvents(targets, 0.7),
      choices: [],
      answer,
      stepItems: answer,
      score: keyScore(
        targets.map((m) => [m]),
        tonicPc,
        mode,
        true,
      ),
      prompt: sight ? `${key} · 听完终止式后，唱出下面的音` : `${key} · 听旋律，然后唱出来`,
      sing: {
        targets,
        display: targets.map((m) => nameInSystem(m, tonicPc, ctx.settings.naming, mode)),
        showDisplay: sight,
      },
    };
  },
};
