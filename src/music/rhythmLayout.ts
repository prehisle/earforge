// 带时值记谱的排版：按拍号与弱起切小节、跨小节线的音拆开并加连音线、时值归类（附点、三连音）、
// 符杠分组、小节内的横向间距与按小节换行。纯函数，与字形无关（字形尺寸由调用方给出）。

import { displayAccidentals, type Pitch } from './notation';

/** 每个四分音符的 tick 数：12 可整除八分、十六分与八分三连音。 */
export const TPQ = 12;

export interface MeterInfo {
  /** 一个完整小节的 tick 数 */
  bar: number;
  /** 符杠分组的「拍」：单拍子为一个分母音符，复拍子（6/8、9/8、12/8）为附点四分 */
  beat: number;
  compound: boolean;
}

export function meterInfo(meter: [number, number] = [4, 4]): MeterInfo {
  const [n, d] = meter;
  const unit = (4 * TPQ) / d;
  const compound = d >= 8 && n % 3 === 0;
  return { bar: n * unit, beat: compound ? 3 * unit : unit, compound };
}

/** 时值：base 为音符种类（1 全、2 二分、4 四分、8 八分、16 十六分），dots 为附点数，triplet 为三连音。 */
export interface NoteValue {
  base: number;
  dots: number;
  triplet: boolean;
}

const V = (base: number, dots = 0, triplet = false): NoteValue => ({ base, dots, triplet });
/** 可直接写出的时值（tick → 时值），从长到短 */
const PLAIN: [number, NoteValue][] = [
  [72, V(1, 1)],
  [48, V(1)],
  [36, V(2, 1)],
  [24, V(2)],
  [18, V(4, 1)],
  [12, V(4)],
  [9, V(8, 1)],
  [6, V(8)],
  [3, V(16)],
];
const TRIPLET: [number, NoteValue][] = [
  [8, V(4, 0, true)],
  [4, V(8, 0, true)],
];

/** 一个 tick 数能否用单个音符写出；能则返回时值。 */
export function noteValue(ticks: number): NoteValue | null {
  return (PLAIN.find(([t]) => t === ticks) ?? TRIPLET.find(([t]) => t === ticks))?.[1] ?? null;
}

/** 把一段时值拆成若干可写出的音符（从长到短贪心）；三连音时值只在除不尽三的时候使用。 */
export function splitTicks(ticks: number): number[] {
  const out: number[] = [];
  const table = ticks % 3 === 0 ? PLAIN : [...PLAIN, ...TRIPLET].sort((a, b) => b[0] - a[0]);
  let left = ticks;
  while (left > 0) {
    const hit = table.find(([t]) => t <= left);
    if (!hit) {
      // 写不出的零头（比十六分音符还短）并入上一个音
      if (out.length) out[out.length - 1] += left;
      else out.push(left);
      break;
    }
    out.push(hit[0]);
    left -= hit[0];
  }
  return out;
}

/** 小节里的一个记谱单位：一个音组（或其被小节线拆开的一段）。 */
export interface RItem {
  /** 对应 Score.notes 的下标 */
  src: number;
  /** 小节内的起点（tick） */
  start: number;
  dur: number;
  value: NoteValue;
  rest: boolean;
  /** 与下一段用连音线相连（同一个音被拆开） */
  tie: boolean;
  /** 被拆开的后续片段（不写临时记号、不写歌词） */
  cont: boolean;
  /** 整小节休止：画在小节正中的全休止符 */
  fullBar: boolean;
}

export interface RMeasure {
  /** 整段谱中的起点（tick） */
  start: number;
  /** 本小节实际的长度（弱起小节、末小节可能不满） */
  length: number;
  /** 本小节在一个完整小节里的起点：弱起小节为 bar - pickup，其余为 0（用于按拍分组） */
  offset: number;
  items: RItem[];
}

/**
 * 按拍号与弱起把时值序列切成小节：跨小节线的音拆开并连音，写不出的时值拆成几个音连音。
 * durs 以四分音符为 1；rests[i] 为真表示第 i 个音组是休止符（休止符拆开时不加连音线）。
 */
export function splitMeasures(durs: number[], rests: boolean[], meter?: [number, number], pickup = 0): RMeasure[] {
  const { bar } = meterInfo(meter);
  const pick = Math.round(pickup * TPQ) % bar;
  const barEnd = (t: number) => (t < pick ? pick : pick + (Math.floor((t - pick) / bar) + 1) * bar);
  const measures: RMeasure[] = [];
  const measureAt = (t: number) => {
    const m = measures[measures.length - 1];
    if (m && t < m.start + (m.offset ? bar - m.offset : bar)) return m;
    const start = t < pick ? 0 : pick + Math.floor((t - pick) / bar) * bar;
    const nm: RMeasure = { start, length: 0, offset: t < pick ? bar - pick : 0, items: [] };
    measures.push(nm);
    return nm;
  };
  let t = 0;
  durs.forEach((d, src) => {
    const total = Math.max(1, Math.round(d * TPQ));
    const rest = rests[src];
    let left = total;
    while (left > 0) {
      const chunk = Math.min(left, barEnd(t) - t);
      const m = measureAt(t);
      const pieces = splitTicks(chunk);
      for (const p of pieces) {
        const value = noteValue(p) ?? V(16);
        m.items.push({ src, start: t - m.start, dur: p, value, rest, tie: !rest, cont: left !== total, fullBar: false });
        t += p;
        left -= p;
      }
      m.length = t - m.start;
    }
    // 最后一段不再连向后面
    const last = measures[measures.length - 1].items;
    last[last.length - 1].tie = false;
  });
  for (const m of measures) {
    const full = m.offset ? bar - m.offset : bar;
    // 整小节休止写成全休止符（任何拍号）
    if (m.items.length === 1 && m.items[0].rest && m.length === full && m.offset === 0) m.items[0].fullBar = true;
  }
  return measures;
}

/** 有符尾的音（八分及更短，含八分三连音） */
const flagged = (it: RItem) => !it.rest && it.value.base >= 8;

/**
 * 符杠分组（返回 items 的下标）：同一拍内相邻的八分、十六分音符连成一组，休止符打断；
 * 复拍子以附点四分为一拍；2/4、4/4 中前后两拍都是两个八分时合成四个一组；三连音单独成组。
 * 只有一个音的组不在结果里（画符尾）。
 */
export function beamGroups(m: RMeasure, meter: [number, number] = [4, 4]): number[][] {
  const { beat } = meterInfo(meter);
  const beatOf = (it: RItem) => Math.floor((m.offset + it.start) / beat);
  const groups: number[][] = [];
  let cur: number[] = [];
  const flush = () => {
    if (cur.length) groups.push(cur);
    cur = [];
  };
  m.items.forEach((it, i) => {
    if (!flagged(it)) return flush();
    const prev = cur.length ? m.items[cur[cur.length - 1]] : null;
    if (prev && (beatOf(prev) !== beatOf(it) || prev.value.triplet !== it.value.triplet)) flush();
    cur.push(i);
  });
  flush();
  // 2/4、4/4：第 1–2 拍或第 3–4 拍都是「两个八分」时合成一组
  const [n, d] = meter;
  if (d === 4 && n % 2 === 0) {
    const pair = (g: number[]) => g.length === 2 && g.every((i) => m.items[i].dur === TPQ / 2);
    for (let k = 0; k < groups.length - 1; k++) {
      const a = groups[k];
      const b = groups[k + 1];
      const ba = beatOf(m.items[a[0]]);
      if (pair(a) && pair(b) && ba % 2 === 0 && beatOf(m.items[b[0]]) === ba + 1 && b[0] === a[1] + 1 && m.items[a[0]].start % TPQ === 0) {
        groups.splice(k, 2, [...a, ...b]);
      }
    }
  }
  return groups.filter((g) => g.length > 1);
}

/** 三连音组（含休止符）：相邻的三连音时值凑满一拍（八分三连音）或两拍（四分三连音）为一组。 */
export function tupletGroups(m: RMeasure): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  let sum = 0;
  m.items.forEach((it, i) => {
    if (!it.value.triplet) {
      if (cur.length) groups.push(cur);
      cur = [];
      sum = 0;
      return;
    }
    cur.push(i);
    sum += it.dur;
    const hasQuarter = cur.some((j) => m.items[j].dur === 2 * (TPQ / 3));
    if ((sum === TPQ && !hasQuarter) || sum === 2 * TPQ) {
      groups.push(cur);
      cur = [];
      sum = 0;
    }
  });
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * 按小节计算临时记号：每小节重新从调号开始，连音线延续过来的音不写也不改变本小节的状态。
 * 返回 [小节][item] → 每个音的临时记号（null 不写，0 还原号），休止符为空数组。
 */
export function measureAccidentals(measures: RMeasure[], notes: Pitch[][], fifths: number): (number | null)[][][] {
  return measures.map((m) => {
    // 连音延续的音照样计入本小节的状态（之后同位置的还原音会写出还原号），只是自己不写
    const sounding = m.items.filter((it) => !it.rest);
    const accs = displayAccidentals(
      sounding.map((it) => notes[it.src]),
      fifths,
    );
    let k = 0;
    return m.items.map((it) => {
      if (it.rest) return [];
      const a = accs[k++];
      return it.cont ? a.map(() => null) : a;
    });
  });
}

// ───────────── 横向间距与换行 ─────────────

/** 理想间距：随时值增长但慢于线性（四分 = quarter，八分约 0.73 倍，二分约 1.37 倍）。 */
export function idealSpace(ticks: number, quarter = 30): number {
  return quarter * Math.pow(ticks / TPQ, 0.45);
}

export interface SpaceIn {
  dur: number;
  /** 相对符头中心向左、向右占用的宽度（临时记号、附点、符尾） */
  left: number;
  right: number;
  /** 下方文字（歌词）的宽度 */
  text: number;
}

export interface SpaceOpts {
  quarter?: number;
  /** 小节线到第一个音的留白 */
  padL?: number;
  /** 最后一个音到小节线的最小留白 */
  padR?: number;
  /** 相邻两音字形之间的最小留白 */
  gap?: number;
  /** 相邻两段歌词之间的最小留白 */
  textGap?: number;
}

/** 一个小节内各音组中心的横坐标（相对小节起点）与小节的自然宽度。 */
export function spaceMeasure(items: SpaceIn[], opts: SpaceOpts = {}): { xs: number[]; width: number } {
  const { quarter = 30, padL = 10, padR = 10, gap = 4, textGap = 5 } = opts;
  const xs: number[] = [];
  items.forEach((it, i) => {
    if (i === 0) {
      xs.push(Math.max(padL + it.left, it.text / 2 + 2));
      return;
    }
    const p = items[i - 1];
    const x = xs[i - 1];
    xs.push(Math.max(x + idealSpace(p.dur, quarter), x + p.right + gap + it.left, x + (p.text + it.text) / 2 + textGap));
  });
  const last = items[items.length - 1];
  const xl = xs[xs.length - 1] ?? 0;
  const width = last
    ? Math.max(xl + idealSpace(last.dur, quarter) * 0.8, xl + last.right + padR, xl + last.text / 2 + textGap)
    : padL + padR;
  return { xs, width };
}

/**
 * 按小节换行：每行放尽量多的小节（行首要留出谱号、调号的宽度；第一行另有拍号），
 * 再在不增加行数的前提下把小节平均分到各行，避免最后一行只剩一两个小节。返回每行的小节下标。
 */
export function breakLines(widths: number[], avail: number, header: number, firstHeader = header): number[][] {
  // caps[k]：第 k 行最多放几个小节（缺省不限）
  const greedy = (caps?: (left: number, k: number) => number) => {
    const lines: number[][] = [];
    let cur: number[] = [];
    let w = firstHeader;
    widths.forEach((mw, i) => {
      const cap = caps ? caps(widths.length - i + cur.length, lines.length) : Infinity;
      if (cur.length && (w + mw > avail || cur.length >= cap)) {
        lines.push(cur);
        cur = [];
        w = header;
      }
      cur.push(i);
      w += mw;
    });
    if (cur.length) lines.push(cur);
    return lines;
  };
  const base = greedy();
  const n = base.length;
  if (n <= 1) return base;
  const even = greedy((left, k) => Math.ceil(left / Math.max(1, n - k)));
  return even.length === n ? even : base;
}
