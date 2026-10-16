import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef } from '../engine/types';
import { chordLetterSteps, pitchName, spellStack } from '../music/notation';
import { t } from '../i18n';
import { CHORDS, INVERSIONS, chordNotes, mod, pick, randInt, type ChordDef } from '../music/theory';
import { levelT, option } from './common';

// 和弦转位：听一个三和弦或七和弦，判断低音是哪个和弦音（原位 / 第一、二、三转位）。
// 单独成练习而不是和弦性质的选项：考点是「转位」而不是「性质」，掌握度要按转位统计。

const INV_BY_ID = Object.fromEntries(INVERSIONS.map((i) => [i.id, i]));
const CHORD_BY_ID = Object.fromEntries(CHORDS.map((c) => [c.id, c]));

/**
 * 参与出题的和弦性质。增三和弦与减七和弦按音程是对称的，各转位听起来一样（只是换了根音），不考。
 * basic：大小三和弦、属七和弦；all：再加减三和弦与大七、小七、半减七和弦。
 */
export const INVERSION_QUALITIES: Record<string, { triads: string[]; sevenths: string[] }> = {
  basic: { triads: ['maj', 'min'], sevenths: ['dom7'] },
  all: { triads: ['maj', 'min', 'dim'], sevenths: ['dom7', 'maj7', 'min7', 'm7b5'] },
};

/** 三和弦与七和弦互相对应（对比试听跨类时用：同一根音上的「相近」和弦） */
const TO_SEVENTH: Record<string, string> = { maj: 'dom7', min: 'min7', dim: 'm7b5' };
const TO_TRIAD: Record<string, string> = { dom7: 'maj', maj7: 'maj', min7: 'min', m7b5: 'dim' };

/** 某转位考点在给定和弦性质下用的和弦（三和弦考点配七和弦性质时换成对应的三和弦，反之亦然）。 */
export function chordFor(itemId: string, quality: string): ChordDef {
  const seventh = INV_BY_ID[itemId].seventh;
  const isSeventh = CHORD_BY_ID[quality].intervals.length === 4;
  if (seventh === isSeventh) return CHORD_BY_ID[quality];
  return CHORD_BY_ID[seventh ? TO_SEVENTH[quality] : TO_TRIAD[quality]];
}

/** 转位后的和弦音（密集排列，低音在下）。 */
export function inversionNotes(root: number, itemId: string, quality: string): number[] {
  return chordNotes(root, chordFor(itemId, quality), INV_BY_ID[itemId].inv);
}

export const inversions: ExerciseDef = {
  id: 'inversions',
  get title() {
    return t('ex.inversions.title');
  },
  get subtitle() {
    return t('ex.inversions.subtitle');
  },
  icon: '⇅',
  group: 'basics',
  levels: [
    levelT('ex.inversions.level.0', ['t0', 't1']),
    levelT('ex.inversions.level.1', ['t2']),
    levelT('ex.inversions.level.2', ['s0', 's1']),
    levelT('ex.inversions.level.3', ['s2', 's3']),
  ],
  options: [
    option(
      'qual',
      'ex.inversions.qual',
      [
        ['basic', 'ex.inversions.qual.basic'],
        ['all', 'ex.inversions.qual.all'],
      ],
      'basic',
    ),
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
  ],
  itemLabel: (it) => INV_BY_ID[it]?.name ?? it,
  generate(item, ctx) {
    const inv = INV_BY_ID[item];
    const pool = INVERSION_QUALITIES[ctx.options.qual] ?? INVERSION_QUALITIES.basic;
    const quality = pick(inv.seventh ? pool.sevenths : pool.triads);
    const chord = CHORD_BY_ID[quality];
    // 根音 C3..A3：第三转位的最高音在根音上方 19 个半音，不超过 E5
    const root = randInt(48, 57);
    const build = (id: string): NoteEvent[] => {
      const notes = inversionNotes(root, id, quality);
      // 琶音从低音开始，先突出低音
      const arp = notes.map((n, i) => ({ notes: [n], time: i * 0.32, dur: 0.3 }));
      const arpEnd = notes.length * 0.32 + 0.2;
      return ctx.options.voicing === 'block'
        ? [{ notes, time: 0, dur: 1.8 }]
        : ctx.options.voicing === 'arp'
          ? [...arp.slice(0, -1), { ...arp[arp.length - 1], dur: 1.2 }]
          : [...arp, { notes, time: arpEnd, dur: 1.8 }];
    };
    // 记谱：原位按三度叠置拼写，再按转位把下方的音移高八度
    const spelled = spellStack(chordNotes(root, chord), chordLetterSteps(chord.intervals));
    const voiced = [...spelled.slice(inv.inv), ...spelled.slice(0, inv.inv).map((p) => ({ ...p, midi: p.midi + 12 }))];
    const choices = INVERSIONS.filter((i) => ctx.items.includes(i.id)).map((i) => ({
      id: i.id,
      label: i.name,
      sub: i.figure,
    }));
    // 和弦音相对根音的半音（模 12）→ 第几个和弦音
    const members = chord.intervals.map((x) => mod(x, 12));
    return {
      item,
      events: build(item),
      choices,
      answer: [item],
      choiceEvents: build,
      // 弹低音：按它是和弦的第几个音作答（同类和弦：本题是七和弦就找七和弦的转位）
      midiAnswer: (m) => {
        const k = members.indexOf(mod(m - root, 12));
        return k < 0 ? null : (choices.find((c) => INV_BY_ID[c.id].seventh === inv.seventh && INV_BY_ID[c.id].inv === k)?.id ?? null);
      },
      prompt: t('ex.inversions.prompt'),
      score: { notes: [voiced], fifths: 0 },
      explain: t('ex.inversions.explain', {
        chord: `${pitchName(spelled[0], false)}${chord.symbol}`,
        quality: chord.name,
        inv: inv.name,
        notes: voiced.map((p) => pitchName(p)).join(' '),
        bass: pitchName(voiced[0], false),
        member: t(`inv.member.${inv.inv as 0 | 1 | 2 | 3}`),
      }),
    };
  },
};
