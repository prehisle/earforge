import type { ExerciseDef } from '../engine/types';
import { INTERVALS, INTERVAL_SONGS, noteName, pick, randInt } from '../music/theory';

const byId = Object.fromEntries(INTERVALS.map((i) => [i.id, i]));

export const intervals: ExerciseDef = {
  id: 'intervals',
  title: '音程识别',
  subtitle: '听两个音，判断它们之间的距离',
  icon: '↕',
  group: '基础',
  levels: [
    { name: '纯五度 · 纯八度', items: ['P5', 'P8'] },
    { name: '+ 大三度 · 纯四度', items: ['M3', 'P4'] },
    { name: '+ 小三度 · 大六度', items: ['m3', 'M6'] },
    { name: '+ 大二度 · 小二度', items: ['M2', 'm2'] },
    { name: '+ 小六度 · 小七度', items: ['m6', 'm7'] },
    { name: '+ 大七度 · 三全音', items: ['M7', 'TT'] },
  ],
  options: [
    {
      id: 'dir',
      label: '方向',
      values: [
        { id: 'up', label: '上行' },
        { id: 'down', label: '下行' },
        { id: 'harm', label: '和声（同时）' },
        { id: 'mix', label: '混合' },
      ],
      default: 'up',
    },
  ],
  itemLabel: (it) => byId[it].name,
  generate(item, ctx) {
    const iv = byId[item];
    const dir = ctx.options.dir === 'mix' ? pick(['up', 'down', 'harm']) : ctx.options.dir;
    const low = randInt(52, 72 - iv.semitones);
    const high = low + iv.semitones;
    const [a, b] = dir === 'down' ? [high, low] : [low, high];
    const events =
      dir === 'harm'
        ? [{ notes: [a, b], time: 0, dur: 1.6 }]
        : [
            { notes: [a], time: 0, dur: 0.75 },
            { notes: [b], time: 0.8, dur: 1.0 },
          ];
    const song = INTERVAL_SONGS[item];
    const dirLabel = dir === 'up' ? '上行' : dir === 'down' ? '下行' : '和声';
    return {
      item,
      events,
      choices: ctx.items.map((id) => ({ id, label: byId[id].name, sub: byId[id].short })),
      answer: [item],
      prompt: `这是什么音程？（${dirLabel}）`,
      explain: `${noteName(a)} → ${noteName(b)}，${iv.semitones} 个半音${song ? `。记忆：${song}` : ''}`,
    };
  },
};
