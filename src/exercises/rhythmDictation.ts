// 节奏旋律听写（视唱练耳考试的核心题型）：先听终止式，再听（可选一小节预备拍）一段 1~4 小节、
// 带节奏的短旋律，用记谱面板（NotatePanel）写出每个音的音高与时值，音高、节奏分开判定。
//
// 考点 id：「节奏层级.音高层级」，如 'e.1'（八分音符 · do–sol），其他调式加前缀（'minor:e.1'）。
// 节奏层级决定可用的节奏型（逐级累加），音高层级沿用旋律听写的音级顺序；二者组合成九个级别。
// 时值单位为 tick（四分音符 = 12），负数表示休止。

import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef, Level, NotateNote } from '../engine/types';
import { t, type MessageKey } from '../i18n';
import { DEGREES, keyLabel, mod, nameInSystem, type ModeDef, type NamingSystem } from '../music/theory';
import { MODE_OPTION, bareItem, cadenceEvents, itemMode, level, modeItem, modeOf, option } from './common';
import { CHROMATIC } from './degrees';
import { SPEED } from './rhythm';

export const TPQ = 12;

// ───────────── 节奏 ─────────────

/** 节奏层级：四分·二分 → 八分 → 附点四分 → 十六分 / 附点八分 → 切分 / 连音线 → 6/8 拍 */
export const R_TIERS = ['qh', 'e', 'dq', 's', 'syn', 'c68'] as const;
export type RTier = (typeof R_TIERS)[number];

/** 节奏型：时值序列、所属节奏层级（R_TIERS 的下标）与出现的权重 */
export interface Cell {
  durs: number[];
  tier: number;
  w: number;
}

/** 单拍子（2/4、3/4、4/4）的节奏型，长度为整数拍 */
export const SIMPLE_CELLS: Cell[] = [
  { durs: [12], tier: 0, w: 3 },
  { durs: [24], tier: 0, w: 1 },
  { durs: [48], tier: 0, w: 0.2 },
  { durs: [6, 6], tier: 1, w: 2 },
  { durs: [-12], tier: 1, w: 0.25 },
  { durs: [18, 6], tier: 2, w: 1.5 },
  { durs: [36], tier: 2, w: 0.3 },
  { durs: [3, 3, 3, 3], tier: 3, w: 0.5 },
  { durs: [6, 3, 3], tier: 3, w: 1 },
  { durs: [3, 3, 6], tier: 3, w: 1 },
  { durs: [9, 3], tier: 3, w: 1 },
  { durs: [6, 12, 6], tier: 4, w: 1.2 },
  { durs: [-6, 6], tier: 4, w: 0.4 },
];

/** 6/8 拍的节奏型，长度为附点四分（一大拍）的整数倍 */
export const COMPOUND_CELLS: Cell[] = [
  { durs: [18], tier: 0, w: 2 },
  { durs: [12, 6], tier: 0, w: 2.5 },
  { durs: [6, 6, 6], tier: 1, w: 2 },
  { durs: [36], tier: 0, w: 0.3 },
  { durs: [6, 12], tier: 2, w: 0.6 },
  { durs: [9, 3, 6], tier: 3, w: 0.7 },
];

const cellLen = (c: Cell) => c.durs.reduce((s, d) => s + Math.abs(d), 0);

/** 节奏型能否放在小节内 pos 处：二拍型落在强拍或次强拍，三拍、四拍型从小节开头起。 */
export function canPlace(c: Cell, pos: number, barLen: number, compound: boolean): boolean {
  const len = cellLen(c);
  if (pos + len > barLen) return false;
  if (compound) return len <= 18 || pos === 0;
  const beats = len / TPQ;
  const p = pos / TPQ;
  const n = barLen / TPQ;
  if (beats === 1) return true;
  if (beats === 2) return n === 3 ? p <= 1 : p % 2 === 0;
  return p === 0;
}

/** 加权随机 */
function weighted<T>(list: T[], weight: (x: T) => number, rng: () => number): T {
  const ws = list.map(weight);
  let r = rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    r -= ws[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** 种子随机数（mulberry32），测试与可复现的出题用 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function meterBar(meter: [number, number]): number {
  return (meter[0] * 4 * TPQ) / meter[1];
}

export interface RhythmPlan {
  /** 时值序列（负数为休止；连音线连起来的音已合成一个） */
  durs: number[];
  /** 是否用到了目标层级的节奏（或连音线） */
  hasTarget: boolean;
}

/**
 * 生成一段节奏：每小节由节奏型拼成，末小节以一个长音（落在拍上、写到小节末）结束。
 * 切分层级会把跨小节线的两个音用连音线连起来。
 */
export function makeRhythm(rt: RTier, meter: [number, number], nBars: number, rng: () => number): RhythmPlan {
  const tier = R_TIERS.indexOf(rt);
  const compound = rt === 'c68';
  const bar = meterBar(meter);
  const beat = compound ? 18 : TPQ;
  const cells = compound ? COMPOUND_CELLS : SIMPLE_CELLS.filter((c) => c.tier <= tier);
  // 结束音的长度：至少一拍；只有一小节时不能占满整小节
  // 附点（附点二分）从附点层级开始
  const finals = compound ? [18, 36] : bar === 24 ? [12, 24] : bar === 36 ? (tier >= 2 ? [24, 36] : [24]) : [24, 48];
  const finalOptions = nBars === 1 ? finals.filter((f) => f < bar) : finals;

  let best: RhythmPlan = { durs: [], hasTarget: false };
  for (let attempt = 0; attempt < 200; attempt++) {
    const used: Cell[] = [];
    const durs: number[] = [];
    const bounds: number[] = []; // 每个音的起点（tick）
    let t0 = 0;
    const push = (d: number) => {
      bounds.push(t0);
      durs.push(d);
      t0 += Math.abs(d);
    };
    const fin = finalOptions[Math.floor(rng() * finalOptions.length)];
    for (let b = 0; b < nBars; b++) {
      const end = b === nBars - 1 ? bar - fin : bar;
      let pos = 0;
      while (pos < end) {
        const ok = cells.filter((c) => canPlace(c, pos, end, compound));
        const c = ok.length
          ? weighted(ok, (x) => x.w * (x.tier === tier && tier > 0 && !compound ? 3 : 1), rng)
          : { durs: [beat], tier: 0, w: 1 };
        used.push(c);
        c.durs.forEach(push);
        pos += cellLen(c);
      }
      if (b === nBars - 1) push(fin);
    }
    // 切分层级：有一定概率把跨小节线的两个音连起来（不连结束音）
    let tied = false;
    if (rt === 'syn' && nBars > 1 && rng() < 0.6) {
      const cands: number[] = [];
      for (let i = 0; i + 2 < durs.length; i++)
        if (durs[i] >= 6 && durs[i + 1] >= 6 && (bounds[i] + durs[i]) % bar === 0 && durs[i] + durs[i + 1] <= 24) cands.push(i);
      if (cands.length) {
        const i = cands[Math.floor(rng() * cands.length)];
        durs.splice(i, 2, durs[i] + durs[i + 1]);
        tied = true;
      }
    }
    const hasTarget = compound || tier === 0 || tied || used.some((c) => c.tier === tier);
    const plan = { durs, hasTarget };
    const rests = durs.filter((d) => d < 0).length;
    const notes = durs.length - rests;
    const good =
      durs[0] > 0 && durs[durs.length - 2] > 0 && rests <= 1 && notes >= Math.min(3, 2 * nBars) && notes <= 7 * nBars;
    if (good) {
      best = plan;
      if (hasTarget) return plan;
    }
  }
  return best;
}

// ───────────── 音高 ─────────────

/** 含变化音级别的变化音：大调沿用旋律听写的 ♭3 ♭7 ♯4，其他调式用该调式的第一组变化音 */
export function chromaticOf(mode: ModeDef): number[] {
  return mode.id === 'major' ? [3, 10, 6] : CHROMATIC[mode.id][0];
}

export interface PitchPool {
  /** 自然音（相对主音的半音，升序） */
  diatonic: number[];
  chromatic: number[];
  /** 本层新加入的音：出题时至少用到一个 */
  fresh: number[];
  /** 最大跳进（按自然音的级数） */
  maxLeap: number;
}

/** 音高层级：0 = do re mi，1 = do–sol，2 = 低音 sol 到高音 do，3 = 再加变化音 */
export function pitchPool(mode: ModeDef, pt: number): PitchPool {
  const s = mode.scale;
  if (pt === 0) return { diatonic: s.slice(0, 3), chromatic: [], fresh: [], maxLeap: 2 };
  if (pt === 1) return { diatonic: s.slice(0, 5), chromatic: [], fresh: s.slice(3, 5), maxLeap: 3 };
  const wide = [s[4] - 12, s[5] - 12, s[6] - 12, ...s, 12];
  if (pt === 2) return { diatonic: wide, chromatic: [], fresh: [s[4] - 12, s[5] - 12, s[6] - 12, s[5], s[6], 12], maxLeap: 5 };
  const chromatic = chromaticOf(mode);
  return { diatonic: wide, chromatic, fresh: chromatic, maxLeap: 5 };
}

/** 稳定音：主三和弦音 */
const stable = (mode: ModeDef, d: number) => [0, mode.scale[2], mode.scale[4]].includes(mod(d, 12));

/**
 * 给 n 个音配上音高：从主三和弦音开始、以 do 结束（倒数第二个音优先级进到 do），以级进为主，
 * 跳进的大小按层级限制，大跳之后优先反向级进；强拍上偏好稳定音。downbeats[i] 表示第 i 个音落在小节强拍。
 */
export function makePitches(mode: ModeDef, pool: PitchPool, downbeats: boolean[], rng: () => number): number[] {
  const D = pool.diatonic;
  const n = downbeats.length;
  let out: number[] = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    const at: number[] = []; // 下标（在 D 中）
    const starts = D.map((_, i) => i).filter((i) => stable(mode, D[i]) && D[i] >= 0 && D[i] < 12);
    at.push(weighted(starts, (i) => (D[i] === 0 ? 3 : 1), rng));
    for (let i = 1; i < n; i++) {
      const prev = at[i - 1];
      if (i === n - 1) {
        // 结束在离上一个音最近的 do
        const dos = D.map((_, k) => k).filter((k) => mod(D[k], 12) === 0);
        at.push(dos.reduce((a, b) => (Math.abs(b - prev) < Math.abs(a - prev) ? b : a)));
        break;
      }
      const lastMove = i >= 2 ? at[i - 1] - at[i - 2] : 0;
      const cands = D.map((_, k) => k);
      const next = weighted(
        cands,
        (k) => {
          const d = Math.abs(k - prev);
          const octave = Math.abs(D[k] - D[prev]) === 12;
          let w = d === 0 ? 0.35 : d === 1 ? 3 : d === 2 ? 1.5 : d <= pool.maxLeap ? 0.5 / (d - 1) : octave && pool.maxLeap >= 5 ? 0.12 : 0;
          // 大跳之后反向级进
          if (Math.abs(lastMove) >= 3) w *= Math.sign(k - prev) === -Math.sign(lastMove) && d <= 2 ? 3 : 0.3;
          // 同音不连续三次
          if (d === 0 && i >= 2 && at[i - 2] === prev) w = 0;
          if (downbeats[i] && stable(mode, D[k])) w *= 1.6;
          // 倒数第二个音：离 do 一级最好，其次是 sol（属音）
          if (i === n - 2) {
            const toDo = Math.min(...D.map((x, j) => (mod(x, 12) === 0 ? Math.abs(j - k) : 99)));
            w *= toDo === 1 ? 3 : mod(D[k], 12) === mode.scale[4] ? 1 : toDo === 0 ? 0.1 : 0.4;
          }
          return w;
        },
        rng,
      );
      at.push(next);
    }
    let mel = at.map((k) => D[k]);
    // 变化音：作为经过音或辅助音，按升降方向半音解决到下一个音
    if (pool.chromatic.length && n >= 3) {
      const spots: [number, number][] = [];
      for (let i = 1; i < n - 1; i++)
        for (const c of pool.chromatic) {
          const flat = DEGREES[c].jianpu.startsWith('♭');
          const target = mel[i + 1];
          const resolves = flat ? target === c - 1 || target === c - 2 : target === c + 1 || target === c + 2;
          if (resolves && Math.abs(c - mel[i - 1]) <= 4 && mel[i - 1] !== c) spots.push([i, c]);
        }
      if (spots.length) {
        const [i, c] = spots[Math.floor(rng() * spots.length)];
        mel = mel.map((x, j) => (j === i ? c : x));
      }
    }
    out = mel;
    if (!pool.fresh.length || mel.some((x) => pool.fresh.includes(x))) return mel;
  }
  return out;
}

// ───────────── 整段旋律 ─────────────

export interface Phrase {
  notes: NotateNote[];
  meter: [number, number];
  bars: number;
}

/** 按考点生成一段旋律。meter 缺省时随机选单拍子（6/8 层级固定 6/8）。 */
export function makePhrase(
  mode: ModeDef,
  rt: RTier,
  pt: number,
  bars: number,
  rng: () => number,
  meter?: [number, number],
): Phrase {
  const m: [number, number] =
    meter ?? (rt === 'c68' ? [6, 8] : ([[2, 4], [3, 4], [4, 4]] as [number, number][])[Math.floor(rng() * 3)]);
  // 2/4 拍的小节短，小节数加倍
  const nBars = m[0] === 2 && m[1] === 4 ? bars * 2 : bars;
  const { durs } = makeRhythm(rt, m, nBars, rng);
  const bar = meterBar(m);
  const downbeats: boolean[] = [];
  let pos = 0;
  for (const d of durs) {
    if (d > 0) downbeats.push(pos % bar === 0);
    pos += Math.abs(d);
  }
  const pitches = makePitches(mode, pitchPool(mode, pt), downbeats, rng);
  let k = 0;
  const notes = durs.map((d) => (d < 0 ? { rel: null, dur: -d } : { rel: pitches[k++], dur: d }));
  return { notes, meter: m, bars: nBars };
}

/** 旋律的音频（不含预备拍）：start 为开始时刻（秒） */
export function notateEvents(notes: NotateNote[], tonic: number, bpm: number, start = 0): NoteEvent[] {
  const q = 60 / bpm;
  const out: NoteEvent[] = [];
  let pos = 0;
  for (const n of notes) {
    if (n.rel !== null) out.push({ notes: [tonic + n.rel], time: start + (pos / TPQ) * q, dur: (n.dur / TPQ) * q * 0.92 });
    pos += n.dur;
  }
  return out;
}

/** 一小节预备拍（6/8 打六个八分）：返回事件与时长（秒） */
export function countInEvents(meter: [number, number], bpm: number): { events: NoteEvent[]; length: number } {
  const unit = (60 / bpm) * (4 / meter[1]);
  const events: NoteEvent[] = Array.from({ length: meter[0] }, (_, i) => ({
    kind: 'click' as const,
    notes: [],
    time: i * unit,
    dur: 0.05,
    accent: i === 0,
    velocity: i === 0 || (meter[1] === 8 && i % 3 === 0) ? 0.9 : 0.6,
  }));
  return { events, length: meter[0] * unit };
}

/** 唱名串，小节之间用 | 分开，休止写 0 */
export function phraseText(
  notes: NotateNote[],
  meter: [number, number],
  tonic: number,
  mode: ModeDef,
  naming: NamingSystem,
): string {
  const bar = meterBar(meter);
  const bars: string[][] = [];
  let pos = 0;
  for (const n of notes) {
    const b = Math.floor(pos / bar);
    (bars[b] ??= []).push(n.rel === null ? '0' : nameInSystem(tonic + n.rel, mod(tonic, 12), naming, mode));
    pos += n.dur;
  }
  return bars.map((b) => (b ?? []).join(' ')).join(' | ');
}

// ───────────── 考点与级别 ─────────────

/** 考点 → [节奏层级, 音高层级] */
export function parseItem(item: string): [RTier, number] {
  const [r, p] = bareItem(item).split('.');
  return [(R_TIERS as readonly string[]).includes(r) ? (r as RTier) : 'qh', Math.max(0, Math.min(3, Number(p) || 0))];
}

const rName = (rt: RTier) => t(`ex.rdict.r.${rt}` as MessageKey);

function pitchName(mode: ModeDef, pt: number): string {
  const s = mode.scale;
  const n = (d: number) => DEGREES[d].movableDo;
  if (pt === 0) return s.slice(0, 3).map(n).join(' ');
  if (pt === 1) return `${n(s[0])}–${n(s[4])}`;
  if (pt === 2) return t('ex.rdict.p.2');
  return t('ex.rdict.p.3', { names: chromaticOf(mode).map((d) => DEGREES[d].jianpu).join(' ') });
}

function rdictLevels(mode: ModeDef): Level[] {
  const it = (id: string) => modeItem(mode, id);
  const s = mode.scale;
  const names = (ds: number[]) => ds.map((d) => DEGREES[d].movableDo).join(' ');
  return [
    level(() => `${rName('qh')} · ${pitchName(mode, 0)}`, [it('qh.0')]),
    level(() => `+ ${names(s.slice(3, 5))}`, [it('qh.1')]),
    level(() => `+ ${rName('e')}`, [it('e.1')]),
    level(() => `+ ${names(s.slice(5))} · ${t('ex.rdict.p.2')}`, [it('qh.2'), it('e.2')]),
    level(() => `+ ${rName('dq')}`, [it('dq.2')]),
    level(() => `+ ${rName('s')}`, [it('s.2')]),
    level(() => `+ ${rName('syn')}`, [it('syn.2')]),
    level(() => `+ ${rName('c68')}`, [it('c68.2')]),
    level(() => t('level.chromatic', { names: chromaticOf(mode).map((d) => DEGREES[d].jianpu).join(' ') }), [it('e.3'), it('dq.3')]),
  ];
}

export const rhythmDictation: ExerciseDef = {
  id: 'rhythmDictation',
  get title() {
    return t('ex.rdict.title');
  },
  get subtitle() {
    return t('ex.rdict.subtitle');
  },
  icon: '♫',
  group: 'tonal',
  heavy: true,
  levels: rdictLevels(modeOf({})),
  levelsFor: (options) => rdictLevels(modeOf(options)),
  options: [
    MODE_OPTION,
    option(
      'bars',
      'ex.rdict.bars',
      [
        ['1', 'ex.rdict.bars.1'],
        ['2', 'ex.rdict.bars.2'],
        ['4', 'ex.rdict.bars.4'],
      ],
      '2',
    ),
    option(
      'speed',
      'ex.rhythm.speed',
      [
        ['slow', 'ex.rhythm.speed.slow'],
        ['mid', 'ex.rhythm.speed.mid'],
        ['fast', 'ex.rhythm.speed.fast'],
      ],
      'slow',
    ),
    option(
      'countIn',
      'ex.rdict.countIn',
      [
        ['on', 'common.on'],
        ['off', 'common.off'],
      ],
      'on',
    ),
  ],
  itemLabel(item) {
    const [rt, pt] = parseItem(item);
    return `${rName(rt)} · ${pitchName(itemMode(item), pt)}`;
  },
  generate(item, ctx) {
    const rng = Math.random;
    const mode = modeOf(ctx.options);
    const [rt, pt] = parseItem(item);
    const bars = [1, 2, 4].includes(Number(ctx.options.bars)) ? Number(ctx.options.bars) : 2;
    const bpm = SPEED[ctx.options.speed] ?? 60;
    const phrase = makePhrase(mode, rt, pt, bars, rng);
    // 主音在 C4..F♯4：低音 sol 不低于 G3，整段都写在高音谱表
    const tonic = ctx.settings.keyMode === 'C' ? 60 : 60 + Math.floor(rng() * 7);
    const tonicPc = mod(tonic, 12);
    const count = ctx.options.countIn === 'off' ? { events: [], length: 0 } : countInEvents(phrase.meter, bpm);
    const first = phrase.notes.find((n) => n.rel !== null)!.rel!;
    const naming = ctx.settings.naming;
    return {
      item,
      prelude: cadenceEvents(tonic, mode),
      events: [...count.events, ...notateEvents(phrase.notes, tonic, bpm, count.length)],
      choices: [],
      answer: ['notate'],
      notate: {
        notes: phrase.notes,
        meter: phrase.meter,
        tonic,
        mode: mode.id,
        bpm,
        chromatic: pt >= 3,
      },
      prompt: t('ex.rdict.prompt', {
        key: keyLabel(tonicPc, mode),
        meter: `${phrase.meter[0]}/${phrase.meter[1]}`,
        bars: phrase.bars,
        bpm,
        first: nameInSystem(tonic + first, tonicPc, naming, mode),
      }),
      explain: phraseText(phrase.notes, phrase.meter, tonic, mode, naming),
    };
  },
};
