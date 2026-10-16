import { describe, expect, it } from 'vitest';
import { levelsOf } from '../engine/progress';
import { DEFAULT_SETTINGS, type Question, type Settings } from '../engine/types';
import { EXERCISES } from '../exercises';
import {
  BASS_RANGE,
  MAX_UPPER_MOVE,
  NEXT,
  UPPER_RANGE,
  canEnd,
  harmony,
  harmonyChord,
  hasParallel,
  sequence,
  type HarmonyChord,
} from '../exercises/harmony';
import { mod } from '../music/theory';

const RANDOM: Settings = { ...DEFAULT_SETTINGS, keyMode: 'random' };

interface Case {
  q: Question;
  item: string;
  items: string[];
  options: Record<string, string>;
  lv: number;
}

/** 每种调式 × 和弦数 × 级别，用该级别启用的每个考点各出 times 题 */
function* cases(times: number): Generator<Case> {
  for (const mode of ['major', 'minor'])
    for (const len of ['4', '6']) {
      const options = { mode, len };
      const levels = levelsOf(harmony, options);
      for (let lv = 0; lv < levels.length; lv++) {
        const items = [...new Set(levels.slice(0, lv + 1).flatMap((l) => l.items))];
        for (const item of items)
          for (let k = 0; k < times; k++) yield { q: harmony.generate(item, { settings: RANDOM, items, options }), item, items, options, lv };
      }
    }
}

const ALL = [...cases(8)];
/** 主音（MIDI）：终止式第一个和弦的低音低一个八度 */
const tonicOf = (q: Question) => q.prelude![0].notes[0] + 12;
const chordsOf = (q: Question) => q.answer.map((id) => harmonyChord(id)!);
const keyOf = (c: HarmonyChord) => c.key;

describe('和声听写：题目结构', () => {
  it('题数足够', () => {
    expect(ALL.length).toBeGreaterThan(1500);
  });

  it('答案长度、第一个是主和弦、考点在第 2 个及之后、答案都在选项里', () => {
    for (const { q, item, items, options } of ALL) {
      const where = `${JSON.stringify(options)} ${item} ${q.answer.join(' ')}`;
      expect(q.answer.length, where).toBe(Number(options.len));
      expect(q.events.length, where).toBe(q.answer.length);
      expect(q.stepItems).toEqual(q.answer);
      expect(keyOf(chordsOf(q)[0]), where).toBe('I');
      expect(q.item).toBe(item);
      expect(q.answer.indexOf(item, 1), where).toBeGreaterThanOrEqual(1);
      const ids = q.choices.map((c) => c.id);
      for (const a of q.answer) expect(ids, where).toContain(a);
      // 选项 = 启用的考点（+ 必要的 Ⅰ Ⅳ Ⅴ 与解决和弦），不重复
      for (const it of items) expect(ids).toContain(it);
      expect(new Set(ids).size).toBe(ids.length);
      expect(q.explain).toBe(chordsOf(q).map((c) => c.label).join(' → '));
      expect(q.score!.notes.length).toBe(q.answer.length);
      expect(q.score!.notes.every((g) => g.length === 4)).toBe(true);
    }
  }, 30000);

  it('选项有罗马数字标签与调内和弦名', () => {
    const q = harmony.generate('V65', {
      settings: { ...DEFAULT_SETTINGS, keyMode: 'C' },
      items: ['I', 'IV', 'V', 'V7', 'V65', 'V43', 'V42'],
      options: { mode: 'major', len: '4' },
    });
    expect(q.choices.find((c) => c.id === 'V65')).toMatchObject({ label: 'Ⅴ⁶₅', sub: 'G7/B' });
    expect(q.choices.find((c) => c.id === 'V42')).toMatchObject({ label: 'Ⅴ⁴₂', sub: 'G7/F' });
    expect(q.choices.find((c) => c.id === 'IV')).toMatchObject({ label: 'Ⅳ', sub: 'F' });
    const m = harmony.generate('minor:iio65', {
      settings: { ...DEFAULT_SETTINGS, keyMode: 'C' },
      items: ['minor:i', 'minor:iio65', 'minor:VI', 'minor:viio6', 'minor:V/V'],
      options: { mode: 'minor', len: '4' },
    });
    expect(m.choices.find((c) => c.id === 'minor:iio65')).toMatchObject({ label: 'ⅱø⁶₅', sub: 'Dø7/F' });
    expect(m.choices.find((c) => c.id === 'minor:VI')).toMatchObject({ label: 'Ⅵ', sub: 'A♭' });
    expect(m.choices.find((c) => c.id === 'minor:viio6')).toMatchObject({ label: 'ⅶ°⁶', sub: 'B°/D' });
    expect(m.choices.find((c) => c.id === 'minor:V/V')).toMatchObject({ label: 'Ⅴ/Ⅴ', sub: 'D' });
    expect(m.prompt).toContain('C');
  });

  it('选项按级数排列，与级别顺序无关', () => {
    const q = ALL.find((c) => c.options.mode === 'major' && c.lv === 5)!.q;
    expect(q.choices.map((c) => c.id)).toEqual(['I', 'I6', 'I64', 'ii', 'ii6', 'ii7', 'ii65', 'IV', 'IV6', 'V', 'V6', 'V7', 'V65', 'V43', 'V42', 'vi', 'viio6', 'V/V', 'V7/V']);
  });

  it('自选考点很少时也能出题（补上 Ⅰ Ⅳ Ⅴ 与解决所需的 Ⅰ⁶）', () => {
    for (const len of ['4', '6'])
      for (const item of ['V42', 'I64', 'viio6', 'V/V', 'ii65', 'V6'])
        for (let k = 0; k < 30; k++) {
          const q = harmony.generate(item, { settings: RANDOM, items: [item], options: { mode: 'major', len } });
          expect(q.answer.indexOf(item, 1)).toBeGreaterThanOrEqual(1);
          for (const a of q.answer) expect(q.choices.map((c) => c.id)).toContain(a);
        }
    // 别的调式的考点：按本调式的主和弦出题
    const q = harmony.generate('I', { settings: RANDOM, items: ['I', 'IV', 'V'], options: { mode: 'minor', len: '4' } });
    expect(q.answer[0]).toBe('minor:i');
  });
});

describe('和声听写：功能和声文法', () => {
  it('Ⅰ⁶₄ 后接 Ⅴ / Ⅴ⁷；Ⅴ/Ⅴ 后接 Ⅴ 或 Ⅰ⁶₄；属七转位解决到 Ⅰ / Ⅰ⁶；每一步都在文法里；结尾合法', () => {
    for (const { q } of ALL) {
      const ks = chordsOf(q).map(keyOf);
      const where = ks.join(' ');
      for (let i = 1; i < ks.length; i++) expect(NEXT[ks[i - 1]], where).toContain(ks[i]);
      expect(canEnd(ks[ks.length - 2], ks[ks.length - 1]), where).toBe(true);
      ks.forEach((k, i) => {
        const nx = ks[i + 1];
        if (nx === undefined) return;
        if (k === 'I64') expect(['V', 'V7'], where).toContain(nx);
        if (k === 'V/V' || k === 'V7/V') expect(['V', 'I64'], where).toContain(nx);
        if (k === 'V65' || k === 'V43' || k === 'V42') expect(['I', 'I6'], where).toContain(nx);
        if (k === 'V42') expect(nx, where).toBe('I6');
        if (k === 'V7') expect(['I', 'vi'], where).toContain(nx);
      });
      // 不会结束在不稳定的和弦上
      expect(['I', 'vi', 'V'], where).toContain(ks[ks.length - 1]);
    }
  }, 30000);

  it('没有合法进行时 sequence 返回 null；否则均匀覆盖各个位置', () => {
    expect(sequence(4, ['I', 'V42'], 'V42')).toBeNull();
    const at = new Set<number>();
    for (let k = 0; k < 300; k++) at.add(sequence(6, ['I', 'I6', 'IV', 'V', 'ii6', 'vi'], 'ii6')!.indexOf('ii6'));
    expect([...at].sort()).toEqual([1, 2, 3, 4]);
  });

  it('每个考点在 4 和弦、6 和弦里都能出现', () => {
    for (const mode of ['major', 'minor'])
      for (const len of ['4', '6']) {
        const options = { mode, len };
        const items = levelsOf(harmony, options).flatMap((l) => l.items);
        for (const item of items) expect(ALL.some((c) => c.options.mode === mode && c.options.len === len && c.q.answer.includes(item))).toBe(true);
      }
  });
});

describe('和声听写：声部进行', () => {
  it('每个和弦四个音、低音最低、音域合理，音级与级数和转位一致', () => {
    for (const { q } of ALL) {
      const tonic = tonicOf(q);
      chordsOf(q).forEach((ch, i) => {
        const v = q.events[i].notes;
        const where = `${ch.id} ${v.join(',')}`;
        expect(v.length).toBe(4);
        expect([...v].sort((a, b) => a - b), where).toEqual(v);
        expect(new Set(v).size).toBe(4);
        expect(v[0]).toBeGreaterThanOrEqual(BASS_RANGE[0]);
        expect(v[0]).toBeLessThanOrEqual(BASS_RANGE[1]);
        for (const m of v.slice(1)) {
          expect(m).toBeGreaterThanOrEqual(UPPER_RANGE[0]);
          expect(m).toBeLessThanOrEqual(UPPER_RANGE[1]);
        }
        expect(v[3] - v[1], where).toBeLessThanOrEqual(12);
        const rel = v.map((m) => mod(m - tonic, 12));
        // 低音 = 转位对应的和弦音；所有音都是和弦音；根音、三音（七和弦还有七音）都在
        expect(rel[0], where).toBe(ch.tones[ch.inv]);
        for (const r of rel) expect(ch.tones, where).toContain(r);
        expect(rel, where).toContain(ch.tones[0]);
        expect(rel, where).toContain(ch.tones[1]);
        if (ch.seventh) expect(rel.filter((r) => r === ch.tones[3]).length, where).toBe(1);
        // 不重复导音
        expect(rel.filter((r) => r === 11).length, where).toBeLessThanOrEqual(1);
      });
    }
  }, 30000);

  it('上方声部每步不超过纯五度；没有平行（反向）纯五度、纯八度；七音级进下行或保持；外声部导音上行解决', () => {
    for (const { q } of ALL) {
      const tonic = tonicOf(q);
      const chs = chordsOf(q);
      const vs = q.events.map((e) => e.notes);
      for (let i = 1; i < vs.length; i++) {
        const [a, b] = [vs[i - 1], vs[i]];
        const where = `${chs.map((c) => c.id).join(' ')} @${i}: ${a.join(',')} → ${b.join(',')}`;
        for (let k = 1; k < 4; k++) expect(Math.abs(b[k] - a[k]), where).toBeLessThanOrEqual(MAX_UPPER_MOVE);
        expect(Math.abs(b[0] - a[0]), where).toBeLessThanOrEqual(12);
        expect(hasParallel(a, b), where).toBe(false);
        const prev = chs[i - 1];
        for (let k = 0; k < 4; k++) {
          const r = mod(a[k] - tonic, 12);
          const d = b[k] - a[k];
          if (prev.seventh && r === prev.tones[3]) expect([0, -1, -2], where).toContain(d);
          if ((prev.key === 'V/V' || prev.key === 'V7/V') && r === 6) expect(d, where).toBe(1);
          if (r === 11 && (k === 0 || k === 3) && ['I', 'I6', 'vi'].includes(chs[i].key) && ((prev.key.startsWith('V') && !prev.key.includes('/')) || prev.key === 'viio6')) expect(d, where).toBe(1);
        }
      }
    }
  }, 30000);

  it('hasParallel 识别平行与反向五八度，静止声部不算', () => {
    expect(hasParallel([48, 60, 64, 67], [50, 62, 65, 69])).toBe(true); // 全体平行
    expect(hasParallel([48, 64, 67, 72], [43, 62, 67, 71])).toBe(false); // C → G：只有共同音
    expect(hasParallel([48, 55, 64, 72], [55, 62, 65, 71])).toBe(true); // 低音与次中声部 P5 → P5
    expect(hasParallel([48, 55, 64, 67], [43, 59, 62, 67])).toBe(false);
  });
});

describe('和声听写：对比试听', () => {
  it('choiceEvents 只替换这一步，选正确答案与题目一致', () => {
    for (const { q } of ALL.filter((_, i) => i % 7 === 0))
      for (let step = 0; step < q.answer.length; step++) {
        expect(q.choiceEvents!(q.answer[step], step)).toEqual(q.events);
        const other = q.choices.find((c) => c.id !== q.answer[step])!.id;
        const evs = q.choiceEvents!(other, step);
        expect(evs.length).toBe(q.events.length);
        evs.forEach((e, i) => (i === step ? expect(e).not.toEqual(q.events[i]) : expect(e).toEqual(q.events[i])));
        expect(evs[step].notes.length).toBe(4);
      }
  }, 30000);
});

describe('和声听写：注册', () => {
  it('排在级数和弦之后、耗时长', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(ids.indexOf('harmony')).toBe(ids.indexOf('progressions') + 1);
    expect(harmony.heavy).toBe(true);
    expect(levelsOf(harmony, {}).length).toBe(6);
    expect(levelsOf(harmony, { mode: 'minor' })[0].items).toEqual(['minor:i', 'minor:iv', 'minor:V']);
  });
});
