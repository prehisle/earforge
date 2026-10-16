import { afterEach, describe, expect, it } from 'vitest';
import { EXAM_PRESETS, sectionItems } from '../engine/exam';
import { START_LEVELS } from '../engine/onboarding';
import { DEFAULT_SETTINGS, type GenContext } from '../engine/types';
import { exerciseById } from '../exercises';
import { COMPOUND_FROM, INTERVAL_LEVELS } from '../exercises/intervals';
import { INVERSION_QUALITIES, chordFor, inversionNotes } from '../exercises/inversions';
import { scalePattern, spellScale } from '../exercises/scales';
import { setLocale } from '../i18n';
import { LETTERS, pitchName, pitchStep } from '../music/notation';
import {
  ALL_INTERVALS,
  CHORDS,
  COMPOUND_INTERVALS,
  INVERSIONS,
  MAJOR_SCALE,
  SCALES,
  SCALE_BY_ID,
  mod,
  scaleNotes,
  simpleOf,
} from '../music/theory';

afterEach(() => setLocale('zh'));

const ctxFor = (exId: string, level: number, options: Record<string, string> = {}): GenContext => {
  const ex = exerciseById[exId];
  const defaults = Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default]));
  const items = [...new Set(ex.levels.slice(0, level + 1).flatMap((l) => l.items))];
  return { settings: DEFAULT_SETTINGS, items, options: { ...defaults, ...options } };
};

const lowest = (notes: number[]) => Math.min(...notes);

// ───────────── 音阶 ─────────────

describe('音阶的音程结构', () => {
  const PATTERNS: Record<string, string> = {
    major: '2212221',
    minor: '2122122',
    harmonic: '2122131',
    melodic: '2122221',
    dorian: '2122212',
    mixolydian: '2212212',
    lydian: '2221221',
    phrygian: '1222122',
    locrian: '1221222',
    pentatonic: '22323',
    blues: '321132',
    wholetone: '222222',
  };

  it.each(SCALES.map((s) => s.id))('%s', (id) => {
    const def = SCALE_BY_ID[id];
    expect(scalePattern(def).join('')).toBe(PATTERNS[id]);
    expect(scalePattern(def).reduce((a, b) => a + b, 0)).toBe(12);
    expect(def.letters.length).toBe(def.steps.length);
  });

  it('教会调式是大调音阶的转位', () => {
    const rotate = (k: number) => MAJOR_SCALE.map((_, i) => mod(MAJOR_SCALE[(i + k) % 7] - MAJOR_SCALE[k], 12));
    expect(SCALE_BY_ID.dorian.steps).toEqual(rotate(1));
    expect(SCALE_BY_ID.phrygian.steps).toEqual(rotate(2));
    expect(SCALE_BY_ID.lydian.steps).toEqual(rotate(3));
    expect(SCALE_BY_ID.mixolydian.steps).toEqual(rotate(4));
    expect(SCALE_BY_ID.minor.steps).toEqual(rotate(5));
    expect(SCALE_BY_ID.locrian.steps).toEqual(rotate(6));
  });

  it('上行、下行、上下行的音', () => {
    const c = SCALE_BY_ID.major;
    expect(scaleNotes(60, c, 'up')).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(scaleNotes(60, c, 'down')).toEqual([72, 71, 69, 67, 65, 64, 62, 60]);
    const both = scaleNotes(60, c, 'both');
    expect(both.length).toBe(15);
    expect(both[0]).toBe(60);
    expect(both[7]).toBe(72);
    expect(both[14]).toBe(60);
  });

  it('拼写：字母按级数，没有重升重降', () => {
    const names = (tonic: number, id: keyof typeof SCALE_BY_ID) =>
      spellScale(tonic, SCALE_BY_ID[id], 'up')
        .map((p) => pitchName(p, false))
        .join(' ');
    expect(names(60, 'major')).toBe('C D E F G A B C');
    expect(names(57, 'harmonic')).toBe('A B C D E F G♯ A');
    expect(names(57, 'melodic')).toBe('A B C D E F♯ G♯ A');
    expect(names(62, 'dorian')).toBe('D E F G A B C D');
    expect(names(63, 'dorian')).toBe('E♭ F G♭ A♭ B♭ C D♭ E♭');
    expect(names(65, 'lydian')).toBe('F G A B C D E F');
    expect(names(64, 'phrygian')).toBe('E F G A B C D E');
    expect(names(60, 'pentatonic')).toBe('C D E G A C');
    expect(names(60, 'blues')).toBe('C E♭ F F♯ G B♭ C');
    expect(names(60, 'wholetone')).toBe('C D E F♯ G♯ B♭ C');
    for (let tonic = 55; tonic <= 66; tonic++)
      for (const s of SCALES) {
        const ps = spellScale(tonic, s, 'up');
        expect(ps.map((p) => p.midi)).toEqual(scaleNotes(tonic, s, 'up'));
        for (const p of ps) expect(Math.abs(p.alt), `${tonic} ${s.id} ${pitchName(p)}`).toBeLessThanOrEqual(1);
        // 七声音阶每个字母恰好用一次
        if (s.steps.length === 7) expect(new Set(ps.slice(0, 7).map((p) => LETTERS[p.letter])).size).toBe(7);
        // 谱位单调上行（同字母的 F、F♯ 可以并列）
        for (let i = 1; i < ps.length; i++) expect(pitchStep(ps[i])).toBeGreaterThanOrEqual(pitchStep(ps[i - 1]));
      }
  });
});

describe('音阶练习出题', () => {
  const ex = exerciseById.scales;

  it('每个级别、每个方向都能出题，对比试听与题目同主音、同方向', () => {
    for (let lv = 0; lv < ex.levels.length; lv++)
      for (const dir of ['up', 'down', 'both', 'mix']) {
        const ctx = ctxFor('scales', lv, { dir });
        for (const item of ctx.items) {
          const q = ex.generate(item, ctx);
          const notes = q.events.map((e) => e.notes[0]);
          const def = SCALE_BY_ID[item as keyof typeof SCALE_BY_ID];
          expect(q.answer).toEqual([item]);
          expect(q.choices.map((c) => c.id).sort()).toEqual([...ctx.items].sort());
          const tonic = dir === 'down' || (dir === 'mix' && notes[0] > notes[1]) ? notes[notes.length - 1] : notes[0];
          const realDir = dir === 'mix' ? (notes[0] > notes[1] ? 'down' : 'up') : (dir as 'up' | 'down' | 'both');
          expect(notes).toEqual(scaleNotes(tonic, def, realDir));
          expect(tonic).toBeGreaterThanOrEqual(55);
          expect(Math.max(...notes)).toBeLessThanOrEqual(76);
          // 谱：与播放的音一致
          expect(q.score!.notes.map((g) => g[0].midi)).toEqual(notes);
          for (const c of q.choices) {
            const alt = q.choiceEvents!(c.id).map((e) => e.notes[0]);
            expect(alt).toEqual(scaleNotes(tonic, SCALE_BY_ID[c.id as keyof typeof SCALE_BY_ID], realDir));
          }
        }
      }
  });

  it('级别：大调与自然小调起步，依次加入和声、旋律小调与各调式', () => {
    expect(ex.levels[0].items).toEqual(['major', 'minor']);
    expect(ex.levels[1].items).toEqual(['harmonic']);
    expect(ex.levels[2].items).toEqual(['melodic']);
    const all = ex.levels.flatMap((l) => l.items);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(SCALES.map((s) => s.id).sort());
  });

  it('英文名称与解析', () => {
    setLocale('en');
    const q = ex.generate('dorian', { ...ctxFor('scales', 3), settings: { ...DEFAULT_SETTINGS, keyMode: 'C' } });
    expect(q.explain).toContain('C D E♭ F G A B♭ C');
    expect(q.explain).toContain('2-1-2-2-2-1-2');
    expect(ex.itemLabel('pentatonic', DEFAULT_SETTINGS)).toBe('Major pentatonic');
  });
});

// ───────────── 和弦转位 ─────────────

describe('和弦转位', () => {
  const ex = exerciseById.inversions;
  const chord = (id: string) => CHORDS.find((c) => c.id === id)!;

  it('低音音名：C 大三和弦、G 属七和弦、B 半减七和弦', () => {
    expect(inversionNotes(48, 't0', 'maj')).toEqual([48, 52, 55]); // C E G
    expect(inversionNotes(48, 't1', 'maj')).toEqual([52, 55, 60]); // E G C：六和弦
    expect(inversionNotes(48, 't2', 'maj')).toEqual([55, 60, 64]); // G C E：四六和弦
    expect(inversionNotes(55, 's0', 'dom7')).toEqual([55, 59, 62, 65]); // G B D F
    expect(inversionNotes(55, 's1', 'dom7')).toEqual([59, 62, 65, 67]); // B：五六和弦
    expect(inversionNotes(55, 's2', 'dom7')).toEqual([62, 65, 67, 71]); // D：三四和弦
    expect(inversionNotes(55, 's3', 'dom7')).toEqual([65, 67, 71, 74]); // F：二和弦
    expect(inversionNotes(47, 's3', 'm7b5')[0]).toBe(57); // B D F A → 低音 A
  });

  it('每种性质、每个转位：低音是对应的和弦音，密集排列', () => {
    const qualities = [...INVERSION_QUALITIES.all.triads, ...INVERSION_QUALITIES.all.sevenths];
    for (const inv of INVERSIONS)
      for (const qn of qualities) {
        const def = chordFor(inv.id, qn);
        expect(def.intervals.length).toBe(inv.seventh ? 4 : 3);
        const notes = inversionNotes(50, inv.id, qn);
        expect(mod(notes[0] - 50, 12)).toBe(def.intervals[inv.inv]);
        for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
        expect(notes[notes.length - 1] - notes[0]).toBeLessThan(12);
      }
  });

  it('不考对称和弦（增三、减七）', () => {
    const all = [...INVERSION_QUALITIES.all.triads, ...INVERSION_QUALITIES.all.sevenths];
    expect(all).not.toContain('aug');
    expect(all).not.toContain('dim7');
    expect(chordFor('s1', 'maj')).toBe(chord('dom7'));
    expect(chordFor('t1', 'm7b5')).toBe(chord('dim'));
  });

  it('每个级别、每种选项都能出题；谱的低音、MIDI 弹低音作答与题目一致', () => {
    for (let lv = 0; lv < ex.levels.length; lv++)
      for (const qual of ['basic', 'all'])
        for (const voicing of ['block', 'arp', 'both']) {
          const ctx = ctxFor('inversions', lv, { qual, voicing });
          for (const item of ctx.items)
            for (let round = 0; round < 4; round++) {
              const q = ex.generate(item, ctx);
              const inv = INVERSIONS.find((i) => i.id === item)!;
              const notes = q.events.flatMap((e) => e.notes);
              const bass = lowest(notes);
              const voiced = q.score!.notes[0];
              expect(voiced.length).toBe(inv.seventh ? 4 : 3);
              expect(voiced[0].midi).toBe(bass);
              expect(new Set(notes).size).toBe(voiced.length);
              expect(q.midiAnswer!(bass)).toBe(item);
              expect(q.midiAnswer!(bass + 12)).toBe(item);
              expect(q.midiAnswer!(bass + 1)).not.toBe(item);
              expect(q.choices.map((c) => c.id)).toEqual(INVERSIONS.map((i) => i.id).filter((id) => ctx.items.includes(id)));
              // 对比试听：同一个和弦（同根音），只换低音
              for (const c of q.choices) {
                const alt = q.choiceEvents!(c.id).flatMap((e) => e.notes);
                const ci = INVERSIONS.find((i) => i.id === c.id)!;
                expect(new Set(alt).size).toBe(ci.seventh ? 4 : 3);
              }
              if (qual === 'basic' && !inv.seventh) expect(['maj', 'min'].some((x) => q.explain!.includes(chord(x).name))).toBe(true);
            }
        }
  });

  it('中文名称是考级术语', () => {
    expect(INVERSIONS.map((i) => i.name)).toEqual(['三和弦原位', '六和弦', '四六和弦', '七和弦原位', '五六和弦', '三四和弦', '二和弦']);
    expect(INVERSIONS.map((i) => i.figure)).toEqual(['5/3', '6', '6/4', '7', '6/5', '4/3', '4/2']);
  });
});

// ───────────── 复音程 ─────────────

describe('复音程', () => {
  const ex = exerciseById.intervals;

  it('半音数与对应的单音程', () => {
    const SEMI: Record<string, number> = {
      m9: 13,
      M9: 14,
      m10: 15,
      M10: 16,
      P11: 17,
      A11: 18,
      P12: 19,
      m13: 20,
      M13: 21,
      m14: 22,
      M14: 23,
      P15: 24,
    };
    for (const iv of COMPOUND_INTERVALS) {
      expect(iv.semitones).toBe(SEMI[iv.id]);
      expect(simpleOf(iv.id)!.semitones + 12).toBe(iv.semitones);
    }
    expect(simpleOf('A11')!.id).toBe('TT');
    expect(simpleOf('P15')!.id).toBe('P8');
    expect(simpleOf('P5')).toBeUndefined();
    expect(new Set(ALL_INTERVALS.map((i) => i.id)).size).toBe(25);
  });

  it('名称', () => {
    const name = (id: string) => ALL_INTERVALS.find((i) => i.id === id)!.name;
    expect(name('m9')).toBe('小九度');
    expect(name('A11')).toBe('增十一度');
    expect(name('P15')).toBe('纯十五度');
    setLocale('en');
    expect(name('M10')).toBe('Major 10th');
    expect(name('P15')).toBe('Double octave');
  });

  it('级别：单音程之后按同样顺序加八度', () => {
    expect(ex.levels.length).toBe(12);
    for (let i = 0; i < COMPOUND_FROM; i++) {
      const simple = INTERVAL_LEVELS[i].map((id) => ALL_INTERVALS.find((x) => x.id === id)!.semitones);
      const compound = INTERVAL_LEVELS[i + COMPOUND_FROM].map((id) => ALL_INTERVALS.find((x) => x.id === id)!.semitones);
      expect(compound).toEqual(simple.map((s) => s + 12));
    }
  });

  it('出题：半音数、谱上的度数、MIDI 作答都正确', () => {
    for (const dir of ['up', 'down', 'harm', 'mix'])
      for (const iv of COMPOUND_INTERVALS)
        for (let round = 0; round < 6; round++) {
          const ctx = ctxFor('intervals', 11, { dir });
          const q = ex.generate(iv.id, ctx);
          const notes = q.events.flatMap((e) => e.notes);
          expect(Math.max(...notes) - Math.min(...notes)).toBe(iv.semitones);
          expect(Math.min(...notes)).toBeGreaterThanOrEqual(43);
          expect(Math.max(...notes)).toBeLessThanOrEqual(81);
          const ps = q.score!.notes.flat();
          const steps = ps.map(pitchStep);
          expect(Math.max(...steps) - Math.min(...steps)).toBe(Number(iv.id.slice(1)) - 1);
          const second = q.events.length === 1 ? Math.max(...notes) : q.events[1].notes[0];
          expect(q.midiAnswer!(second)).toBe(iv.id);
          expect(q.explain).toContain(simpleOf(iv.id)!.name);
        }
  });
});

// ───────────── 试卷与引导 ─────────────

describe('新内容进入试卷与引导', () => {
  it('艺考模拟含复音程与转位', () => {
    const conserv = EXAM_PRESETS.find((p) => p.id === 'conserv')!;
    const compound = conserv.sections.find((s) => s.title === 'exam.sec.ivCompound')!;
    expect(sectionItems(compound).sort()).toEqual(COMPOUND_INTERVALS.map((i) => i.id).sort());
    const inv = conserv.sections.find((s) => s.exId === 'inversions')!;
    expect(sectionItems(inv).sort()).toEqual(INVERSIONS.map((i) => i.id).sort());
  });

  it('引导的起始级别在范围内', () => {
    for (const bg of ['player', 'exam'] as const)
      for (const id of ['inversions', 'scales']) {
        expect(START_LEVELS[bg][id]).toBeGreaterThan(0);
        expect(START_LEVELS[bg][id]).toBeLessThan(exerciseById[id].levels.length);
      }
  });
});
