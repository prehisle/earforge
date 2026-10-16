import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef } from '../engine/types';
import { chordLetterSteps, pitchName, spellStack } from '../music/notation';
import { t } from '../i18n';
import { CHORDS, chordNotes, randInt, type ChordDef } from '../music/theory';
import { levelT, option } from './common';

const byId = Object.fromEntries(CHORDS.map((c) => [c.id, c]));

export const chords: ExerciseDef = {
  id: 'chords',
  get title() {
    return t('ex.chords.title');
  },
  get subtitle() {
    return t('ex.chords.subtitle');
  },
  icon: '♫',
  group: 'basics',
  levels: [
    levelT('ex.chords.level.0', ['maj', 'min']),
    levelT('ex.chords.level.1', ['dim', 'aug']),
    levelT('ex.chords.level.2', ['sus2', 'sus4']),
    levelT('ex.chords.level.3', ['maj7', 'dom7', 'min7']),
    levelT('ex.chords.level.4', ['m7b5', 'dim7', 'minMaj7']),
  ],
  options: [
    option(
      'voicing',
      'ex.chords.voicing',
      [
        ['block', 'ex.chords.voicing.block'],
        ['arp', 'ex.chords.voicing.arp'],
        ['both', 'ex.chords.voicing.both'],
      ],
      'both',
    ),
    option(
      'inv',
      'ex.chords.inv',
      [
        ['root', 'ex.chords.inv.root'],
        ['any', 'ex.chords.inv.any'],
      ],
      'root',
    ),
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
    // 记谱：原位按三度叠置拼写（取变音较少的写法），再按转位把低音移高八度
    const spelled = spellStack(chordNotes(root, c), chordLetterSteps(c.intervals));
    const voiced = [...spelled.slice(inv), ...spelled.slice(0, inv).map((p) => ({ ...p, midi: p.midi + 12 }))];
    const events = build(c);
    return {
      item,
      events,
      choices: ctx.items.map((id) => ({ id, label: byId[id].name })),
      answer: [item],
      choiceEvents: (id) => build(byId[id]),
      prompt: t('ex.chords.prompt'),
      score: { notes: [voiced], fifths: 0 },
      explain: t('ex.chords.explain', {
        symbol: `${pitchName(spelled[0], false)}${c.symbol}`,
        notes: voiced.map((p) => pitchName(p)).join(' '),
      }),
    };
  },
};
