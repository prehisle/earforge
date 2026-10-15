import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef } from '../engine/types';
import { CHORDS, chordNotes, noteName, pitchClassName, randInt, type ChordDef } from '../music/theory';

const byId = Object.fromEntries(CHORDS.map((c) => [c.id, c]));

export const chords: ExerciseDef = {
  id: 'chords',
  title: '和弦性质',
  subtitle: '大、小、减、增、七和弦……听色彩辨和弦',
  icon: '♫',
  group: '基础',
  levels: [
    { name: '大三 · 小三', items: ['maj', 'min'] },
    { name: '+ 减三 · 增三', items: ['dim', 'aug'] },
    { name: '+ 挂留和弦', items: ['sus2', 'sus4'] },
    { name: '+ 大七 · 属七 · 小七', items: ['maj7', 'dom7', 'min7'] },
    { name: '+ 半减七 · 减七 · 小大七', items: ['m7b5', 'dim7', 'minMaj7'] },
  ],
  options: [
    {
      id: 'voicing',
      label: '演奏方式',
      values: [
        { id: 'block', label: '柱式' },
        { id: 'arp', label: '琶音' },
        { id: 'both', label: '琶音 + 柱式' },
      ],
      default: 'both',
    },
    {
      id: 'inv',
      label: '转位',
      values: [
        { id: 'root', label: '仅原位' },
        { id: 'any', label: '随机转位' },
      ],
      default: 'root',
    },
  ],
  itemLabel: (it) => byId[it].name,
  generate(item, ctx) {
    const c = byId[item];
    const root = randInt(48, 62);
    const inv = ctx.options.inv === 'any' ? randInt(0, c.intervals.length - 1) : 0;
    // 同一个根音、同样的转位与演奏方式（三和弦没有第三转位，按最高转位处理）
    const build = (def: ChordDef): NoteEvent[] => {
      const notes = chordNotes(root, def, Math.min(inv, def.intervals.length - 1));
      const arp = notes.map((n, i) => ({ notes: [n], time: i * 0.32, dur: 0.3 }));
      const arpEnd = notes.length * 0.32 + 0.2;
      return ctx.options.voicing === 'block'
        ? [{ notes, time: 0, dur: 1.8 }]
        : ctx.options.voicing === 'arp'
          ? [...arp.slice(0, -1), { ...arp[arp.length - 1], dur: 1.2 }]
          : [...arp, { notes, time: arpEnd, dur: 1.8 }];
    };
    const notes = chordNotes(root, c, inv);
    const events = build(c);
    return {
      item,
      events,
      choices: ctx.items.map((id) => ({ id, label: byId[id].name })),
      answer: [item],
      choiceEvents: (id) => build(byId[id]),
      prompt: '这是什么和弦？',
      explain: `${pitchClassName(root)}${c.symbol}：${notes.map((n) => noteName(n)).join(' ')}`,
    };
  },
};
