import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef } from '../engine/types';
import { intervalNumber, pitchName, spellStack } from '../music/notation';
import { INTERVALS, INTERVAL_SONGS, pick, randInt } from '../music/theory';

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
    const song = INTERVAL_SONGS[item];
    const dirLabel = dir === 'up' ? '上行' : dir === 'down' ? '下行' : '和声';
    return {
      item,
      events,
      choices: ctx.items.map((id) => ({ id, label: byId[id].name, sub: byId[id].short })),
      answer: [item],
      choiceEvents: (id) => build(byId[id].semitones),
      // 弹出第二个音：按它相对第一个音的方向与半音数作答（和声音程弹上方的音）；弹第一个音本身不算作答
      midiAnswer: (m) => ctx.items.find((id) => byId[id].semitones > 0 && byId[id].semitones === sign * (m - a)) ?? null,
      prompt: `这是什么音程？（${dirLabel}）`,
      score: { notes: dir === 'harm' ? [[pl, ph]] : [[pa], [pb]], fifths: 0 },
      explain: `${pitchName(pa)} → ${pitchName(pb)}，${iv.semitones} 个半音${song ? `。记忆：${song}` : ''}`,
    };
  },
};
