import { describe, expect, it } from 'vitest';
import {
  chooseClef,
  chordLetterSteps,
  displayAccidentals,
  intervalNumber,
  keyAlterations,
  keyFifths,
  keyScore,
  keySignatureSteps,
  pitchName,
  pitchStep,
  spellInKey,
  spellSimple,
  spellStack,
  spellWithLetter,
  type Pitch,
} from '../music/notation';
import { CHORDS, MODES, MODE_BY_ID, chordNotes, keyName, mod } from '../music/theory';

const M = MODE_BY_ID;
const names = (ps: Pitch[]) => ps.map((p) => pitchName(p));

describe('拼写基础', () => {
  it('谱位与八度', () => {
    expect(pitchStep(spellSimple(60))).toBe(28); // C4
    expect(pitchStep(spellSimple(64))).toBe(30); // E4：高音谱表第一线
    expect(pitchName(spellSimple(61))).toBe('C♯4');
    expect(pitchName(spellSimple(61, true))).toBe('D♭4');
    // B♯3 与 C4 同音，但记在第 3 组、B 的谱位
    const bs = spellWithLetter(60, 6);
    expect(pitchName(bs)).toBe('B♯3');
    expect(pitchStep(bs)).toBe(27);
    const cb = spellWithLetter(59, 0);
    expect(pitchName(cb)).toBe('C♭4');
    expect(pitchStep(cb)).toBe(28);
    expect(pitchName(spellWithLetter(67, 3))).toBe('F𝄪4');
  });
});

describe('调号', () => {
  it('大调的升降号个数', () => {
    const fifths = [0, 7, 2, 9, 4, 11, 6, 5, 10, 3, 8, 1].map((pc) => keyFifths(pc, M.major));
    expect(fifths).toEqual([0, 1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5]);
  });
  it('各调式按关系大调', () => {
    expect(keyFifths(9, M.minor)).toBe(0); // A 小调
    expect(keyFifths(2, M.minor)).toBe(-1); // D 小调
    expect(keyFifths(10, M.minor)).toBe(-5); // B♭ 小调
    expect(keyFifths(8, M.minor)).toBe(5); // G♯ 小调
    expect(keyFifths(2, M.dorian)).toBe(0); // D 多利亚
    expect(keyFifths(7, M.mixolydian)).toBe(0); // G 混合利底亚
    expect(keyFifths(0, M.harmonic)).toBe(-3);
  });
  it('调号字母与谱位', () => {
    expect(keyAlterations(2)).toEqual([1, 0, 0, 1, 0, 0, 0]); // F♯ C♯
    expect(keyAlterations(-3)).toEqual([0, 0, -1, 0, 0, -1, -1]); // B♭ E♭ A♭
    expect(keySignatureSteps(3, 'treble')).toEqual([38, 35, 39]);
    expect(keySignatureSteps(-2, 'bass')).toEqual([20, 23]);
  });
  it('所有调、所有调式：主音拼写与 keyName 一致，调内音都不需临时记号', () => {
    for (const mode of MODES)
      for (let pc = 0; pc < 12; pc++) {
        const tonic = spellInKey(60 + pc, pc, mode);
        expect(pitchName(tonic, false)).toBe(keyName(pc, mode));
        const scale = mode.scale.map((d) => spellInKey(60 + pc + d, pc, mode));
        // 七个字母各出现一次
        expect(new Set(scale.map((p) => p.letter)).size).toBe(7);
        const alts = keyAlterations(keyFifths(pc, mode));
        const natural = mode.id === 'harmonic' ? scale.slice(0, 6) : scale; // 和声小调的导音是临时升高的
        for (const p of natural) expect(p.alt).toBe(alts[p.letter]);
      }
  });
});

describe('在调中拼写', () => {
  it('变化音按简谱写法', () => {
    const c = (m: number, pc: number, mode = M.major) => pitchName(spellInKey(m, pc, mode));
    expect(c(63, 0)).toBe('E♭4'); // C 大调 ♭3
    expect(c(66, 0)).toBe('F♯4'); // ♯4
    expect(c(61, 2, M.minor)).toBe('C♯4'); // D 小调导音
    expect(c(69, 3)).toBe('A4'); // E♭ 大调 ♯4 → A 还原
    expect(c(64, 0, M.minor)).toBe('E4'); // C 小调的 mi
    expect(c(68, 8, M.minor)).toBe('G♯4'); // G♯ 小调主音
  });
  it('变化音避免重升重降，导音照写重升', () => {
    // C♯ 混合利底亚的 ♯4 本应是 F𝄪，改写为 G
    expect(pitchName(spellInKey(67, 1, M.mixolydian))).toBe('G4');
    // G♯ 和声小调的导音是 F𝄪
    expect(pitchName(spellInKey(67, 8, M.harmonic))).toBe('F𝄪4');
    for (const mode of MODES)
      for (let pc = 0; pc < 12; pc++)
        for (let d = 0; d < 11; d++) {
          if (mode.scale.includes(d)) continue;
          expect(Math.abs(spellInKey(60 + pc + d, pc, mode).alt)).toBeLessThanOrEqual(1);
        }
  });
});

describe('结构拼写', () => {
  it('音程按度数拼字母', () => {
    expect(names(spellStack([64, 67], [0, 2]))).toEqual(['E4', 'G4']); // 小三度
    expect(names(spellStack([61, 64], [0, 2]))).toEqual(['C♯4', 'E4']);
    expect(names(spellStack([63, 70], [0, 4]))).toEqual(['E♭4', 'B♭4']);
    expect(names(spellStack([60, 66], [0, intervalNumber('TT') - 1]))).toEqual(['C4', 'F♯4']); // 增四度
    expect(intervalNumber('P8')).toBe(8);
  });
  it('和弦取变音较少的写法', () => {
    const chord = (root: number, id: string) => {
      const c = CHORDS.find((x) => x.id === id)!;
      return names(spellStack(chordNotes(root, c), chordLetterSteps(c.intervals)));
    };
    expect(chord(61, 'aug')).toEqual(['D♭4', 'F4', 'A4']); // 而不是 C♯ E♯ G𝄪
    expect(chord(61, 'min')).toEqual(['C♯4', 'E4', 'G♯4']);
    expect(chord(60, 'dim7')).toEqual(['C4', 'E♭4', 'G♭4', 'B𝄫4']);
    expect(chord(62, 'sus2')).toEqual(['D4', 'E4', 'A4']);
    expect(chord(62, 'sus4')).toEqual(['D4', 'G4', 'A4']);
    expect(chord(66, 'maj')).toEqual(['F♯4', 'A♯4', 'C♯5']);
  });
  it('所有和弦、所有根音：字母按三度叠置', () => {
    for (const c of CHORDS)
      for (let r = 48; r < 60; r++) {
        const ps = spellStack(chordNotes(r, c), chordLetterSteps(c.intervals));
        ps.forEach((p, i) => expect(mod(p.letter - ps[0].letter, 7)).toBe(chordLetterSteps(c.intervals)[i] % 7));
        for (const p of ps) expect(Math.abs(p.alt)).toBeLessThanOrEqual(2);
      }
  });
});

describe('临时记号', () => {
  it('与调号不同才写，小节内持续有效', () => {
    // D 大调：F♯ 不写；F 还原写 ♮；之后同位置的 F 不再写；再回到 F♯ 要写 ♯
    const s = keyScore([[66], [65], [65], [66], [61]], 2);
    expect(displayAccidentals(s.notes, s.fifths)).toEqual([[null], [0], [null], [1], [null]]);
  });
  it('不同八度互不影响', () => {
    const s = keyScore([[66], [78]], 0);
    expect(displayAccidentals(s.notes, s.fifths)).toEqual([[1], [1]]);
  });
});

describe('谱号', () => {
  it('按音域选择', () => {
    const st = (ms: number[]) => ms.map((m) => pitchStep(spellSimple(m)));
    expect(chooseClef(st([60, 72]))).toBe('treble');
    expect(chooseClef(st([55, 67]))).toBe('treble'); // G3 用下加线
    expect(chooseClef(st([43, 60]))).toBe('bass');
    expect(chooseClef(st([40, 76]))).toBe('grand');
  });
});
