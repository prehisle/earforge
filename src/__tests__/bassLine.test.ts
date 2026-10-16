import { describe, expect, it } from 'vitest';
import { levelsOf } from '../engine/progress';
import { questionSeed, withSeed } from '../engine/seeded';
import { canUseInSet } from '../engine/setRunner';
import { CODES } from '../engine/shareLink';
import { DEFAULT_SETTINGS, type Question, type Settings } from '../engine/types';
import { EXERCISES } from '../exercises';
import { bassLine } from '../exercises/bassLine';
import { semi } from '../exercises/degrees';
import { harmonyChord } from '../exercises/harmony';
import { mod, nameInSystem, MODE_BY_ID, type NamingSystem } from '../music/theory';

const RANDOM: Settings = { ...DEFAULT_SETTINGS, keyMode: 'random' };
const C: Settings = { ...DEFAULT_SETTINGS, keyMode: 'C' };

interface Case {
  q: Question;
  item: string;
  items: string[];
  options: Record<string, string>;
  lv: number;
}

/** 每种调式 × 和弦数 × 低音选项 × 级别，用该级别启用的每个考点各出 times 题 */
function* cases(times: number): Generator<Case> {
  for (const mode of ['major', 'minor'])
    for (const len of ['4', '6'])
      for (const bass of ['boost', 'even']) {
        const options = { mode, len, bass };
        const levels = levelsOf(bassLine, options);
        for (let lv = 0; lv < levels.length; lv++) {
          const items = [...new Set(levels.slice(0, lv + 1).flatMap((l) => l.items))];
          for (const item of items)
            for (let k = 0; k < times; k++) yield { q: bassLine.generate(item, { settings: RANDOM, items, options }), item, items, options, lv };
        }
      }
}

const ALL = [...cases(4)];
/** 主音（MIDI）：终止式第一个和弦的低音高一个八度 */
const tonicOf = (q: Question) => q.prelude![0].notes[0] + 12;
/** 每个和弦的四个音（低音在前）：突出低音时低音与上方声部是两个事件 */
const chordsOf = (q: Question, boost: boolean, events = q.events) =>
  boost ? events.filter((_, i) => i % 2 === 0).map((e, i) => [...e.notes, ...events[2 * i + 1].notes]) : events.map((e) => e.notes);

describe('低音线听写：题目结构', () => {
  it('题数足够', () => {
    expect(ALL.length).toBeGreaterThan(1000);
  });

  it('每个级别 / 调式都能出题：步数、第一个低音是 do、考点在第 2 个及之后、答案都在选项里', () => {
    for (const { q, item, items, options } of ALL) {
      const where = `${JSON.stringify(options)} ${item} ${q.answer.join(' ')} ${q.stepItems!.join(' ')}`;
      const n = Number(options.len);
      expect(q.answer.length, where).toBe(n);
      expect(q.stepItems!.length, where).toBe(n);
      expect(q.events.length, where).toBe(options.bass === 'even' ? n : 2 * n);
      expect(semi(q.answer[0]), where).toBe(0);
      expect(q.item).toBe(item);
      expect(q.stepItems!.indexOf(item, 1), where).toBeGreaterThanOrEqual(1);
      const ids = q.choices.map((c) => c.id);
      for (const a of q.answer) expect(ids, where).toContain(a);
      expect(new Set(ids).size).toBe(ids.length);
      // 选项按级数排列，带调式前缀
      expect(ids.map(semi)).toEqual([...ids.map(semi)].sort((a, b) => a - b));
      for (const id of ids) expect(id.startsWith('minor:'), id).toBe(options.mode === 'minor');
      // 启用的每个考点的低音都在选项里
      expect(q.score!.notes.length).toBe(n);
      expect(q.score!.notes.every((g) => g.length === 4)).toBe(true);
      for (const it of items) expect(bassLine.itemLabel(it, DEFAULT_SETTINGS)).not.toBe(it);
    }
  }, 30000);

  it('答案就是实际奏出的低音（谱面与音频一致），也是该和弦转位的低音', () => {
    for (const { q, options } of ALL) {
      const tonic = tonicOf(q);
      const chords = chordsOf(q, options.bass !== 'even');
      q.answer.forEach((a, i) => {
        const bass = Math.min(...chords[i]);
        expect(chords[i][0]).toBe(bass);
        expect(mod(bass - tonic, 12)).toBe(semi(a));
        expect(q.score!.notes[i][0].midi).toBe(bass);
        const id = q.stepItems![i];
        const hc = harmonyChord(id);
        // 副属和弦的第一转位（Ⅴ⁶/Ⅴ、Ⅴ⁶₅/Ⅴ）低音是 fi
        expect(semi(a), id).toBe(hc ? mod(hc.tones[hc.inv], 12) : 6);
      });
    }
  });

  it('低音 fi 不在 Ⅰ 之后（增四度），小调里也不在 Ⅵ 之后（减三度），且都上行到 sol', () => {
    let seen = 0;
    for (const { q, options } of ALL)
      q.answer.forEach((a, i) => {
        if (semi(a) !== 6) return;
        seen++;
        const prev = q.stepItems![i - 1].replace('minor:', '');
        expect(prev).not.toMatch(/^(I|i)$/);
        if (options.mode === 'minor') expect(prev).not.toBe('VI');
        expect(semi(q.answer[i + 1])).toBe(7);
      });
    expect(seen).toBeGreaterThan(20);
  });

  it('级别：大调第 0 级低音 do fa sol，第 1 级加 la re，第 2 级加 mi ti，最高级加 fi', () => {
    const basses = (mode: string, lv: number) => {
      const levels = levelsOf(bassLine, { mode });
      const items = levels.slice(0, lv + 1).flatMap((l) => l.items);
      const q = bassLine.generate(items[0], { settings: C, items, options: { mode, len: '4', bass: 'boost' } });
      return q.choices.map((c) => semi(c.id));
    };
    expect(basses('major', 0)).toEqual([0, 5, 7]);
    expect(basses('major', 1)).toEqual([0, 2, 5, 7, 9]);
    expect(basses('major', 2)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(basses('major', 5)).toEqual([0, 2, 4, 5, 6, 7, 9, 11]);
    // 小调（和声小调）：me le ti
    expect(basses('minor', 2)).toEqual([0, 3, 5, 7, 8, 11]);
    expect(basses('minor', 5)).toEqual([0, 2, 3, 5, 6, 7, 8, 11]);
    expect(levelsOf(bassLine, { mode: 'major' })[0].name).toBe('Ⅰ · Ⅳ · Ⅴ (do fa sol)');
  });

  it('转位级别的低音线以级进为主', () => {
    let steps = 0;
    let total = 0;
    for (const { q, lv } of ALL) {
      if (lv < 2) continue;
      for (let i = 1; i < q.answer.length; i++) {
        const d = mod(semi(q.answer[i]) - semi(q.answer[i - 1]), 12);
        if (Math.min(d, 12 - d) <= 2) steps++;
        total++;
      }
    }
    expect(steps / total).toBeGreaterThan(0.5);
  });

  it('突出低音：低音单独一个事件、力度大于上方声部；均衡：一个和弦一个事件', () => {
    const items = levelsOf(bassLine, {}).flatMap((l) => l.items);
    const boost = bassLine.generate('V65', { settings: C, items, options: { mode: 'major', len: '4', bass: 'boost' } });
    for (let i = 0; i < 4; i++) {
      expect(boost.events[2 * i].notes.length).toBe(1);
      expect(boost.events[2 * i + 1].notes.length).toBe(3);
      expect(boost.events[2 * i].time).toBe(boost.events[2 * i + 1].time);
      expect(boost.events[2 * i].velocity!).toBeGreaterThan(boost.events[2 * i + 1].velocity!);
    }
    const even = bassLine.generate('V65', { settings: C, items, options: { mode: 'major', len: '4', bass: 'even' } });
    expect(even.events.every((e) => e.notes.length === 4 && e.velocity === undefined)).toBe(true);
  });
});

describe('低音线听写：对比试听', () => {
  it('只把这一步的低音换成所选级数，上方声部与其他和弦不变', () => {
    let checked = 0;
    for (const { q, options } of ALL.filter((_, i) => i % 7 === 0)) {
      const boost = options.bass !== 'even';
      const tonic = tonicOf(q);
      const orig = chordsOf(q, boost);
      q.answer.forEach((a, step) => {
        expect(q.choiceEvents!(a, step)).toEqual(q.events);
        for (const c of q.choices) {
          if (c.id === a) continue;
          const alt = chordsOf(q, boost, q.choiceEvents!(c.id, step));
          expect(alt.length).toBe(orig.length);
          alt.forEach((ch, i) => {
            if (i !== step) return expect(ch).toEqual(orig[i]);
            expect(ch.slice(1)).toEqual(orig[i].slice(1));
            expect(mod(ch[0] - tonic, 12)).toBe(semi(c.id));
            // 换上的低音离原低音不超过一个八度，且仍在上方声部之下
            expect(Math.abs(ch[0] - orig[i][0])).toBeLessThanOrEqual(12);
            expect(ch[0]).toBeLessThan(ch[1]);
          });
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('低音线听写：唱名体系', () => {
  const items = levelsOf(bassLine, {}).flatMap((l) => l.items);
  const gen = (naming: NamingSystem) => bassLine.generate('V6/V', { settings: { ...C, naming }, items, options: { mode: 'major', len: '4', bass: 'boost' } });

  it('选项按设置的唱名体系显示（C 大调）', () => {
    expect(gen('movable').choices.map((c) => c.label)).toEqual(['do', 're', 'mi', 'fa', 'fi', 'sol', 'la', 'ti']);
    expect(gen('jianpu').choices.map((c) => c.label)).toEqual(['1', '2', '3', '4', '♯4', '5', '6', '7']);
    for (const naming of ['fixed', 'letter'] as const) {
      const q = gen(naming);
      expect(q.choices.map((c) => c.label)).toEqual(q.choices.map((c) => nameInSystem(60 + semi(c.id), 0, naming)));
    }
    expect(gen('letter').choices.map((c) => c.label)).toContain('F♯');
  });

  it('小调用首调唱名 me le，解析与题干也按唱名体系', () => {
    const minor = levelsOf(bassLine, { mode: 'minor' }).flatMap((l) => l.items);
    const q = bassLine.generate('minor:iv6', { settings: C, items: minor, options: { mode: 'minor', len: '4', bass: 'boost' } });
    expect(q.choices.map((c) => c.label)).toEqual(['do', 're', 'me', 'fa', 'fi', 'sol', 'le', 'ti']);
    expect(q.prompt).toContain('do');
    expect(q.explain).toMatch(/^低音 do – /);
    const j = gen('jianpu');
    expect(j.explain).toMatch(/^低音 1 – /);
    expect(j.explain).toContain('♯4');
    // 考点名：和弦 + 低音
    expect(bassLine.itemLabel('V6/V', DEFAULT_SETTINGS)).toBe('Ⅴ⁶/Ⅴ (fi)');
    expect(bassLine.itemLabel('minor:iv6', { ...DEFAULT_SETTINGS, naming: 'jianpu' })).toBe('ⅳ⁶ (♭6)');
    expect(nameInSystem(68, 0, 'movable', MODE_BY_ID.minor)).toBe('le');
  });
});

describe('低音线听写：注册与固定题目', () => {
  it('在和声听写之后、可用于自定义练习、有分享代号', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(ids.indexOf('bassLine')).toBe(ids.indexOf('harmony') + 1);
    expect(canUseInSet(bassLine)).toBe(true);
    expect(bassLine.heavy).toBe(true);
    expect(CODES.bassLine).toBe('bl');
    expect(new Set(Object.values(CODES)).size).toBe(Object.keys(CODES).length);
  });

  it('同一 seed 出同一题，不同 seed 通常不同', () => {
    const project = (q: Question) => JSON.stringify({ ...q, choiceEvents: undefined, midiAnswer: undefined });
    let differ = 0;
    let total = 0;
    for (const mode of ['major', 'minor']) {
      const options = { mode, len: '6', bass: 'boost' };
      const items = levelsOf(bassLine, options).flatMap((l) => l.items);
      for (const [i, item] of items.entries()) {
        const seed = questionSeed(99, i);
        const run = (s: number) => project(withSeed(s, () => bassLine.generate(item, { settings: RANDOM, items, options })));
        const a = run(seed);
        bassLine.generate(item, { settings: RANDOM, items, options });
        expect(run(seed)).toBe(a);
        total++;
        if (run(seed ^ 0x5bd1e995) !== a) differ++;
      }
    }
    expect(differ / total).toBeGreaterThan(0.8);
  });
});

describe('谱面', () => {
  it('四部和声的解析谱固定用大谱表（音域偏低时也不挤在低音谱表上）', () => {
    for (let k = 0; k < 50; k++) {
      const q = bassLine.generate('I', { settings: DEFAULT_SETTINGS, items: ['I', 'IV', 'V'], options: {} });
      expect(q.score?.clef).toBe('grand');
    }
  });
});
