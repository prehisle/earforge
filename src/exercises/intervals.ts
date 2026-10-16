import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef } from '../engine/types';
import { intervalNumber, pitchName, spellStack } from '../music/notation';
import { t } from '../i18n';
import { INTERVALS, intervalSong, pick, randInt } from '../music/theory';
import { level, option } from './common';

const byId = Object.fromEntries(INTERVALS.map((i) => [i.id, i]));

export const intervals: ExerciseDef = {
  id: 'intervals',
  get title() {
    return t('ex.intervals.title');
  },
  get subtitle() {
    return t('ex.intervals.subtitle');
  },
  icon: '↕',
  group: 'basics',
  levels: [
    ['P5', 'P8'],
    ['M3', 'P4'],
    ['m3', 'M6'],
    ['M2', 'm2'],
    ['m6', 'm7'],
    ['M7', 'TT'],
  ].map((items, i) => level(() => `${i ? '+ ' : ''}${items.map((id) => byId[id].name).join(' · ')}`, items)),
  options: [
    option(
      'dir',
      'ex.intervals.dir',
      [
        ['up', 'ex.intervals.dir.up'],
        ['down', 'ex.intervals.dir.down'],
        ['harm', 'ex.intervals.dir.harm'],
        ['mix', 'ex.intervals.dir.mix'],
      ],
      'up',
    ),
  ],
  itemLabel: (it) => byId[it].name,
  generate(item, ctx) {
    const iv = byId[item];
    const dir = ctx.options.dir === 'mix' ? pick(['up', 'down', 'harm']) : ctx.options.dir;
    const low = randInt(52, 72 - iv.semitones);
    const high = low + iv.semitones;
    const a = dir === 'down' ? high : low;
    // 从第一个音 a 出发、同一方向上的音程（和声音程 a 为低音）
    const sign = dir === 'down' ? -1 : 1;
    const build = (semitones: number): NoteEvent[] => {
      const to = a + sign * semitones;
      return dir === 'harm'
        ? [{ notes: [a, to], time: 0, dur: 1.6 }]
        : [
            { notes: [a], time: 0, dur: 0.75 },
            { notes: [to], time: 0.8, dur: 1.0 },
          ];
    };
    const events = build(iv.semitones);
    // 记谱：上方音的字母按度数从低音数起（三全音记作增四度）
    const [pl, ph] = spellStack([low, high], [0, intervalNumber(item) - 1]);
    const [pa, pb] = dir === 'down' ? [ph, pl] : [pl, ph];
    const song = intervalSong(item);
    const dirLabel = t(
      dir === 'up' ? 'ex.intervals.dir.up' : dir === 'down' ? 'ex.intervals.dir.down' : 'ex.intervals.dirShort.harm',
    );
    return {
      item,
      events,
      choices: ctx.items.map((id) => ({ id, label: byId[id].name, sub: byId[id].short })),
      answer: [item],
      choiceEvents: (id) => build(byId[id].semitones),
      // 弹出第二个音：按它相对第一个音的方向与半音数作答（和声音程弹上方的音）；弹第一个音本身不算作答
      midiAnswer: (m) => ctx.items.find((id) => byId[id].semitones > 0 && byId[id].semitones === sign * (m - a)) ?? null,
      prompt: t('ex.intervals.prompt', { dir: dirLabel }),
      score: { notes: dir === 'harm' ? [[pl, ph]] : [[pa], [pb]], fifths: 0 },
      explain:
        t('ex.intervals.explain', { from: pitchName(pa), to: pitchName(pb), n: iv.semitones }) +
        (song ? t('ex.intervals.song', { song }) : ''),
    };
  },
};
