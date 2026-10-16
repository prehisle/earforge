import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef } from '../engine/types';
import { pitchName, spellStack, type Pitch } from '../music/notation';
import { t } from '../i18n';
import { SCALE_BY_ID, pick, randInt, scaleNotes, type ScaleDef, type ScaleId } from '../music/theory';
import { level, option } from './common';

// 音阶与调式听辨：从同一个主音弹出一条音阶，判断它是哪种音阶 / 调式。

const LEVEL_IDS: ScaleId[][] = [
  ['major', 'minor'],
  ['harmonic'],
  ['melodic'],
  ['dorian', 'mixolydian'],
  ['lydian', 'phrygian'],
  ['pentatonic', 'blues'],
  ['wholetone', 'locrian'],
];

export type ScaleDir = 'up' | 'down' | 'both';

const scaleOf = (id: string): ScaleDef | undefined => SCALE_BY_ID[id as ScaleId];

/** 音阶各音（含高八度主音）的字母级数，与 scaleNotes 的顺序一致。 */
export function scaleLetters(def: ScaleDef, dir: ScaleDir, letters = def.letters): number[] {
  const up = [...letters, 7];
  const down = [...up].reverse();
  return dir === 'up' ? up : dir === 'down' ? down : [...up, ...down.slice(1)];
}

/** 由主音拼写音阶：主音按升号、降号两种写法中变音较少的拼写，其余音按字母级数。 */
export function spellScale(tonic: number, def: ScaleDef, dir: ScaleDir): Pitch[] {
  // 先按上行拼写（spellStack 以第一个音为准选写法），再按方向排列，保证上下行写法一致
  const notes = scaleNotes(tonic, def, 'up');
  const cost = (ps: Pitch[]) => ps.reduce((a, p) => a + (Math.abs(p.alt) > 1 ? 4 : Math.abs(p.alt)), 0);
  const tries = [def.letters, ...(def.altLetters ? [def.altLetters] : [])].map((l) => spellStack(notes, scaleLetters(def, 'up', l)));
  const up = tries.reduce((best, ps) => (cost(ps) < cost(best) ? ps : best));
  const down = [...up].reverse();
  return dir === 'up' ? up : dir === 'down' ? down : [...up, ...down.slice(1)];
}

/** 相邻两音的半音数，如大调 2 2 1 2 2 2 1 */
export function scalePattern(def: ScaleDef): number[] {
  const s = [...def.steps, 12];
  return s.slice(1).map((x, i) => x - s[i]);
}

const dirKey = (dir: ScaleDir) =>
  dir === 'up' ? 'ex.intervals.dir.up' : dir === 'down' ? 'ex.intervals.dir.down' : 'ex.scales.dir.both';

export const scales: ExerciseDef = {
  id: 'scales',
  get title() {
    return t('ex.scales.title');
  },
  get subtitle() {
    return t('ex.scales.subtitle');
  },
  icon: '♮',
  group: 'basics',
  levels: LEVEL_IDS.map((ids, i) => level(() => `${i ? '+ ' : ''}${ids.map((id) => SCALE_BY_ID[id].name).join(' · ')}`, ids)),
  options: [
    option(
      'dir',
      'ex.intervals.dir',
      [
        ['up', 'ex.intervals.dir.up'],
        ['down', 'ex.intervals.dir.down'],
        ['both', 'ex.scales.dir.both'],
        ['mix', 'ex.intervals.dir.mix'],
      ],
      'up',
    ),
  ],
  itemLabel: (it) => scaleOf(it)?.name ?? it,
  generate(item, ctx) {
    const def = scaleOf(item) ?? SCALE_BY_ID.major;
    const opt = ctx.options.dir;
    const dir: ScaleDir = opt === 'down' || opt === 'both' ? opt : opt === 'mix' ? pick(['up', 'down'] as const) : 'up';
    // 主音 G3..E4（固定 C 调时为 C4），音阶最高到 E5
    const tonic = ctx.settings.keyMode === 'C' ? 60 : randInt(55, 64);
    const beat = 0.34;
    // 同一个主音、同一方向的另一条音阶
    const build = (id: string): NoteEvent[] => {
      const notes = scaleNotes(tonic, scaleOf(id) ?? def, dir);
      return notes.map((n, i) => ({ notes: [n], time: i * beat, dur: i === notes.length - 1 ? 1.0 : beat * 0.95 }));
    };
    const choices = LEVEL_IDS.flat()
      .filter((id) => ctx.items.includes(id))
      .map((id) => ({ id, label: SCALE_BY_ID[id].name, sub: SCALE_BY_ID[id].feature }));
    return {
      item,
      events: build(item),
      choices,
      answer: [item],
      choiceEvents: build,
      prompt: t('ex.scales.prompt', { dir: t(dirKey(dir)) }),
      score: { notes: spellScale(tonic, def, dir).map((p) => [p]), fifths: 0, stems: true },
      explain: t('ex.scales.explain', {
        notes: spellScale(tonic, def, 'up')
          .map((p) => pitchName(p, false))
          .join(' '),
        pattern: scalePattern(def).join('-'),
        feature: t(`scale.feat.${def.id}`),
      }),
    };
  },
};
