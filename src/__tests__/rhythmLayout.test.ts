import { describe, expect, it } from 'vitest';
import { spellSimple, type Pitch } from '../music/notation';
import {
  TPQ,
  beamGroups,
  breakLines,
  measureAccidentals,
  meterInfo,
  noteValue,
  spaceMeasure,
  splitMeasures,
  splitTicks,
  tupletGroups,
  type RMeasure,
} from '../music/rhythmLayout';

const sums = (ms: RMeasure[]) => ms.map((m) => m.items.reduce((s, it) => s + it.dur, 0) / TPQ);
const notesOnly = (durs: number[]) => splitMeasures(durs, durs.map(() => false), undefined);

describe('拍号', () => {
  it('小节长度与拍', () => {
    expect(meterInfo([4, 4])).toEqual({ bar: 48, beat: 12, compound: false });
    expect(meterInfo([3, 4])).toEqual({ bar: 36, beat: 12, compound: false });
    expect(meterInfo([2, 4])).toEqual({ bar: 24, beat: 12, compound: false });
    expect(meterInfo([6, 8])).toEqual({ bar: 36, beat: 18, compound: true });
    expect(meterInfo([2, 2]).beat).toBe(24);
  });
});

describe('时值', () => {
  it('附点与三连音', () => {
    expect(noteValue(18)).toEqual({ base: 4, dots: 1, triplet: false });
    expect(noteValue(36)).toEqual({ base: 2, dots: 1, triplet: false });
    expect(noteValue(9)).toEqual({ base: 8, dots: 1, triplet: false });
    expect(noteValue(4)).toEqual({ base: 8, dots: 0, triplet: true });
    expect(noteValue(30)).toBeNull();
  });
  it('写不出的时值拆成连音', () => {
    expect(splitTicks(30)).toEqual([24, 6]); // 二分 + 八分
    expect(splitTicks(60)).toEqual([48, 12]);
    expect(splitTicks(42)).toEqual([36, 6]);
  });
});

describe('切小节', () => {
  it('4/4、3/4、2/4、6/8 每小节时值之和', () => {
    expect(sums(notesOnly([1, 1, 1, 1, 1, 1, 2]))).toEqual([4, 4]);
    expect(sums(splitMeasures([2, 1, 3], [false, false, false], [3, 4]))).toEqual([3, 3]);
    expect(sums(splitMeasures([0.5, 0.5, 1, 2], [false, false, false, false], [2, 4]))).toEqual([2, 2]);
    expect(sums(splitMeasures([1.5, 0.5, 0.5, 0.5, 3], Array(5).fill(false), [6, 8]))).toEqual([3, 3]);
  });
  it('弱起：第一小节只有弱起长度，拍位从小节末尾倒算', () => {
    // 生日歌：3/4，弱起两个八分（附点八分 + 十六分）
    const ms = splitMeasures([0.75, 0.25, 1, 1, 1, 3], Array(6).fill(false), [3, 4], 1);
    expect(sums(ms)).toEqual([1, 3, 3]);
    expect(ms[0].offset).toBe(24);
    expect(ms[1].start).toBe(12);
    // 弱起里的附点八分 + 十六分落在第 3 拍，连成一组
    expect(beamGroups(ms[0], [3, 4])).toEqual([[0, 1]]);
  });
  it('跨小节线的音拆开并连音', () => {
    const ms = notesOnly([3, 2, 3]);
    expect(sums(ms)).toEqual([4, 4]);
    const [a, b] = ms;
    expect(a.items.map((it) => [it.src, it.dur, it.tie, it.cont])).toEqual([
      [0, 36, false, false],
      [1, 12, true, false],
    ]);
    expect(b.items.map((it) => [it.src, it.dur, it.tie, it.cont])).toEqual([
      [1, 12, false, true],
      [2, 36, false, false],
    ]);
  });
  it('跨两条小节线的长音', () => {
    const ms = splitMeasures([1, 4, 2], [false, false, false], [3, 4]);
    expect(sums(ms)).toEqual([3, 3, 1]);
    expect(ms[0].items[1]).toMatchObject({ src: 1, dur: 24, tie: true });
    expect(ms[1].items[0]).toMatchObject({ src: 1, dur: 24, tie: false, cont: true });
    expect(ms[1].items[1]).toMatchObject({ src: 2, dur: 12, tie: true });
  });
  it('休止符：不加连音线，整小节休止画全休止符', () => {
    const ms = splitMeasures([1, 4, 3, 1], [false, true, true, false], [4, 4]);
    expect(ms[0].items.map((it) => [it.rest, it.tie, it.fullBar])).toEqual([
      [false, false, false],
      [true, false, false],
    ]);
    expect(ms[1].items[0]).toMatchObject({ rest: true, dur: 12, tie: false, cont: true });
    // 3/4 里一整小节的休止也写全休止符
    const w = splitMeasures([3, 3], [true, false], [3, 4]);
    expect(w[0].items[0].fullBar).toBe(true);
    expect(w[0].items[0].value.dots).toBe(1);
  });
  it('附点时值', () => {
    const ms = notesOnly([1.5, 0.5, 0.75, 0.25, 1]);
    expect(ms[0].items.map((it) => [it.value.base, it.value.dots])).toEqual([
      [4, 1],
      [8, 0],
      [8, 1],
      [16, 0],
      [4, 0],
    ]);
  });
});

describe('符杠分组', () => {
  it('按拍分组，4/4 两拍八分合成四个', () => {
    const ms = notesOnly([0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 1]);
    expect(beamGroups(ms[0])).toEqual([[0, 1, 2, 3], [4, 5, 6]]);
  });
  it('附点八分 + 十六分、十六分四个一组', () => {
    const ms = notesOnly([0.75, 0.25, 0.25, 0.25, 0.25, 0.25, 2]);
    expect(beamGroups(ms[0])).toEqual([[0, 1], [2, 3, 4, 5]]);
  });
  it('6/8 以附点四分为一拍', () => {
    const ms = splitMeasures(Array(6).fill(0.5), Array(6).fill(false), [6, 8]);
    expect(beamGroups(ms[0], [6, 8])).toEqual([[0, 1, 2], [3, 4, 5]]);
  });
  it('3/4 不合并拍', () => {
    const ms = splitMeasures(Array(6).fill(0.5), Array(6).fill(false), [3, 4]);
    expect(beamGroups(ms[0], [3, 4])).toEqual([[0, 1], [2, 3], [4, 5]]);
  });
  it('休止符打断符杠，单个八分不成组', () => {
    const ms = splitMeasures([0.5, 0.5, 0.5, 0.5, 2], [false, true, false, false, false], [4, 4]);
    expect(beamGroups(ms[0])).toEqual([[2, 3]]);
  });
  it('三连音', () => {
    const third = 1 / 3;
    const ms = notesOnly([third, third, third, 1, 2 * third, 2 * third, 2 * third, 1]);
    expect(beamGroups(ms[0])).toEqual([[0, 1, 2]]);
    expect(tupletGroups(ms[0])).toEqual([[0, 1, 2], [4, 5, 6]]);
    expect(ms[0].items[4].value).toEqual({ base: 4, dots: 0, triplet: true });
  });
});

describe('临时记号按小节', () => {
  const F = spellSimple(66); // F♯4
  const f: Pitch = spellSimple(65);
  it('小节线后重新从调号开始，连音延续的音不写', () => {
    const notes = [[F], [F], [F], [f]];
    const ms = splitMeasures([1, 1, 4, 1], [false, false, false, false], [4, 4]);
    const accs = measureAccidentals(ms, notes, 0);
    expect(accs[0]).toEqual([[1], [null], [null]]); // 第一小节：只有第一个 F♯ 写升号
    expect(accs[1]).toEqual([[null], [0]]); // 连音延续的 F♯ 不写；之后的 F 写（提示性的）还原号
    // 下一小节新出现的 F♯ 要重新写升号
    const ms2 = splitMeasures([4, 4], [false, false], [4, 4]);
    expect(measureAccidentals(ms2, [[F], [F]], 0)).toEqual([[[1]], [[1]]]);
  });
});

describe('间距与换行', () => {
  it('时值越长间距越大，并保证字形与歌词不重叠', () => {
    const { xs } = spaceMeasure([
      { dur: 6, left: 7, right: 7, text: 0 },
      { dur: 12, left: 7, right: 7, text: 0 },
      { dur: 24, left: 7, right: 7, text: 0 },
      { dur: 12, left: 7, right: 7, text: 0 },
    ]);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(gaps[0]).toBeLessThan(gaps[1]);
    expect(gaps[1]).toBeLessThan(gaps[2]);
    const wide = spaceMeasure([
      { dur: 3, left: 7, right: 7, text: 40 },
      { dur: 3, left: 20, right: 7, text: 40 },
    ]).xs;
    expect(wide[1] - wide[0]).toBeGreaterThanOrEqual(45);
  });
  it('按小节换行并均分', () => {
    // 每小节 100，可用 330，行首 50：贪心为 3+3+1，均分后为 3+2+2
    const lines = breakLines(Array(7).fill(100), 360, 50, 60);
    expect(lines.map((l) => l.length)).toEqual([3, 2, 2]);
    expect(breakLines([100, 100], 1000, 50)).toEqual([[0, 1]]);
    // 放不下的小节单独一行
    expect(breakLines([500, 100], 300, 50).length).toBe(2);
  });
});
