import type { ExerciseDef, Level } from '../engine/types';
import { keyScore } from '../music/notation';
import { t } from '../i18n';
import { keyLabel, mod, nameInSystem, randInt, type ModeDef } from '../music/theory';
import { MODE_OPTION, cadenceEvents, degreeLevels, melodyEvents, modeItem, modeOf, option } from './common';
import { degreeLabel, semi } from './degrees';
import { countOption, makeMelody } from './dictation';

/** 视唱的级别：主三和弦 → +2、4 级 → +6、7 级（只唱自然音级）。 */
function singingLevels(mode: ModeDef): Level[] {
  const s = mode.scale;
  return degreeLevels(mode, [[s[0], s[2], s[4]], [s[1], s[3]], [s[5], s[6]]], 3);
}

export const singing: ExerciseDef = {
  id: 'singing',
  get title() {
    return t('ex.singing.title');
  },
  get subtitle() {
    return t('ex.singing.subtitle');
  },
  icon: '🎤',
  group: 'sing',
  mic: true,
  levels: singingLevels(modeOf({})),
  levelsFor: (options) => singingLevels(modeOf(options)),
  options: [
    MODE_OPTION,
    // 原 id 为 'mode'，现让给调式选项；旧数据中的取值会被 getProgress 重置为默认
    option(
      'task',
      'ex.singing.task',
      [
        ['sight', 'ex.singing.task.sight'],
        ['echo', 'ex.singing.task.echo'],
      ],
      'sight',
    ),
    countOption('ex.singing.len', ['1', '3', '5'], '1'),
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
    const key = keyLabel(tonicPc, mode);
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
      prompt: t(sight ? 'ex.singing.promptSight' : 'ex.singing.promptEcho', { key }),
      sing: {
        targets,
        display: targets.map((m) => nameInSystem(m, tonicPc, ctx.settings.naming, mode)),
        showDisplay: sight,
      },
    };
  },
};
