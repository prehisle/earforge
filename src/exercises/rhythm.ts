import type { NoteEvent } from '../audio/engine';
import type { Choice, ExerciseDef } from '../engine/types';
import { t, type MessageKey } from '../i18n';
import { pick, randInt } from '../music/theory';
import { levelT, option } from './common';

// 节奏听写：预备拍 + 1~2 小节 4/4 节奏型（木鱼声），从相似的候选节奏中选出听到的那个。
// 时值单位：1/12 个四分音符（便于同时表示十六分与三连音），负数为休止。

export const TPQ = 12;
export const BAR = 4 * TPQ;

const UNIT_DURS: Record<string, number[]> = {
  q: [12],
  h: [24],
  w: [48],
  qr: [-12],
  ee: [6, 6],
  dqe: [18, 6],
  ere: [-6, 6],
  eer: [6, -6],
  ssss: [3, 3, 3, 3],
  ess: [6, 3, 3],
  sse: [3, 3, 6],
  syn: [6, 12, 6],
  trip: [4, 4, 4],
};

/** 节奏单元（考点）：名称（当前语言）与时值序列。长度为 1、2 或 4 拍。 */
export const UNITS: Record<string, { readonly name: string; durs: number[] }> = Object.fromEntries(
  Object.entries(UNIT_DURS).map(([id, durs]) => [
    id,
    {
      durs,
      get name() {
        return t(`rhythm.${id}` as MessageKey);
      },
    },
  ]),
);

const beats = (u: string) => UNITS[u].durs.reduce((s, d) => s + Math.abs(d), 0) / TPQ;
const hasRest = (u: string) => UNITS[u].durs.some((d) => d < 0);

/** 一小节由两个「半小节」（各 2 拍）组成：一个 2 拍单元或两个 1 拍单元；全音符独占一小节。 */
type Half = string[];
export type Bar = Half[];

export const flatten = (bars: Bar[]): number[] => bars.flat(2).flatMap((u) => UNITS[u].durs);

/** 听觉上可区分的特征：木鱼声短促，只能听出起音位置，因此用起音时刻判断两个节奏是否相同。 */
/** 听感键：每个音的起点与发声长度（相邻休止合并为静音）。听感键相同的两个节奏听起来完全一样。 */
export function soundKey(durs: number[]): string {
  const out: string[] = [];
  let t = 0;
  for (const d of durs) {
    if (d > 0) out.push(`${t}+${d}`);
    t += Math.abs(d);
  }
  return out.join(',');
}

export function onsetKey(durs: number[]): string {
  const on: number[] = [];
  let t = 0;
  for (const d of durs) {
    if (d > 0) on.push(t);
    t += Math.abs(d);
  }
  return on.join(',');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomHalf(pool: string[]): Half {
  const ones = pool.filter((u) => beats(u) === 1);
  const twos = pool.filter((u) => beats(u) === 2);
  if (twos.length && Math.random() < 0.35) return [pick(twos)];
  return [pick(ones), pick(ones)];
}

/** 休止单元每小节至多一个，且至少有两次敲击（全音符小节除外）。 */
function goodBar(bar: Bar): boolean {
  if (bar[0][0] === 'w') return true;
  return bar.flat().filter(hasRest).length <= 1 && onsetKey(flatten([bar])).split(',').length >= 2;
}

/** 生成一小节；指定 target 时保证包含该单元。 */
export function makeBar(pool: string[], target?: string): Bar {
  if (target === 'w') return [['w']];
  const ones = pool.filter((u) => beats(u) === 1);
  let bar: Bar = [];
  for (let k = 0; k < 100; k++) {
    bar = [randomHalf(pool), randomHalf(pool)];
    if (target) {
      const h = randInt(0, 1);
      if (beats(target) === 2) bar[h] = [target];
      else {
        if (bar[h].length === 1) bar[h] = [pick(ones), pick(ones)];
        bar[h][randInt(0, 1)] = target;
      }
    }
    if (goodBar(bar)) break;
  }
  return bar;
}

/** 干扰项：只改动一个半小节（换一个 1 拍单元，或 2 拍单元与两个 1 拍单元互换），听感相近但不同。 */
function mutate(bars: Bar[], pool: string[]): Bar[] {
  const out = bars.map((b) => b.map((h) => [...h]));
  const bi = randInt(0, out.length - 1);
  const bar = out[bi];
  if (bar[0][0] === 'w') {
    out[bi] = makeBar(pool);
    return out;
  }
  const hi = randInt(0, 1);
  const half = bar[hi];
  const ones = pool.filter((u) => beats(u) === 1);
  const twos = pool.filter((u) => beats(u) === 2);
  const other = (list: string[], cur: string) => list.filter((u) => u !== cur);
  if (half.length === 2 && (Math.random() < 0.7 || !twos.length)) {
    const i = randInt(0, 1);
    const cands = other(ones, half[i]);
    if (cands.length) half[i] = pick(cands);
  } else if (half.length === 2) {
    bar[hi] = [pick(twos)];
  } else if (Math.random() < 0.5 && other(twos, half[0]).length) {
    bar[hi] = [pick(other(twos, half[0]))];
  } else {
    bar[hi] = [pick(ones), pick(ones)];
  }
  return out;
}

export const describe = (bars: Bar[]) =>
  bars.map((b) => b.flat().map((u) => UNITS[u].name).join(t('ex.rhythm.sep'))).join(t('ex.rhythm.barSep'));

/** 节奏型的音频：一小节预备拍，然后节奏型（木鱼）+ 轻声节拍器。durs 为时值序列（见 UNITS）。 */
export function rhythmEvents(durs: number[], bpm: number): NoteEvent[] {
  const beat = 60 / bpm;
  const nBeats = Math.ceil(durs.reduce((s, d) => s + Math.abs(d), 0) / TPQ);
  const events: NoteEvent[] = [];
  for (let i = 0; i < 4; i++)
    events.push({ kind: 'click', notes: [], time: i * beat, dur: 0.05, accent: i === 0, velocity: 0.9 });
  const start = 4 * beat;
  for (let i = 0; i < nBeats; i++)
    events.push({ kind: 'click', notes: [], time: start + i * beat, dur: 0.05, accent: i % 4 === 0, velocity: 0.35 });
  let t = 0;
  for (const d of durs) {
    const len = (Math.abs(d) / TPQ) * beat;
    if (d > 0) events.push({ kind: 'perc', notes: [], time: start + (t / TPQ) * beat, dur: len, velocity: 0.85 });
    t += Math.abs(d);
  }
  return events.sort((a, b) => a.time - b.time);
}

export const SPEED: Record<string, number> = { slow: 60, mid: 80, fast: 100 };

export const rhythm: ExerciseDef = {
  id: 'rhythm',
  get title() {
    return t('ex.rhythm.title');
  },
  get subtitle() {
    return t('ex.rhythm.subtitle');
  },
  icon: '🥁',
  group: 'basics',
  levels: [
    levelT('ex.rhythm.level.0', ['q', 'h', 'w', 'qr']),
    levelT('ex.rhythm.level.1', ['ee']),
    levelT('ex.rhythm.level.2', ['dqe', 'ere', 'eer']),
    levelT('ex.rhythm.level.3', ['ssss', 'ess', 'sse']),
    levelT('ex.rhythm.level.4', ['syn', 'trip']),
  ],
  options: [
    option(
      'speed',
      'ex.rhythm.speed',
      [
        ['slow', 'ex.rhythm.speed.slow'],
        ['mid', 'ex.rhythm.speed.mid'],
        ['fast', 'ex.rhythm.speed.fast'],
      ],
      'mid',
    ),
    option(
      'bars',
      'ex.rhythm.bars',
      [
        ['1', 'ex.rhythm.bars.1'],
        ['2', 'ex.rhythm.bars.2'],
      ],
      '1',
    ),
  ],
  itemLabel: (it) => UNITS[it].name,
  generate(item, ctx) {
    const bpm = SPEED[ctx.options.speed] ?? 80;
    const nBars = ctx.options.bars === '2' ? 2 : 1;
    // 填充用的单元：当前考点（全音符只在被考时出现）+ 四分音符兜底
    const pool = [...new Set([...ctx.items.filter((u) => u in UNITS && u !== 'w'), 'q'])];
    const at = randInt(0, nBars - 1);
    const bars: Bar[] = Array.from({ length: nBars }, (_, i) => makeBar(pool, i === at ? item : undefined));

    // 干扰项：先在当前单元池里改一处；不够时放宽到基础单元并改两处
    const seen = new Set([soundKey(flatten(bars))]);
    const wrongs: Bar[][] = [];
    const wide = [...new Set([...pool, 'h', 'ee', 'qr'])];
    for (let k = 0; k < 300 && wrongs.length < 3; k++) {
      const p = k < 150 ? pool : wide;
      let cand = mutate(bars, p);
      if (k >= 150) cand = mutate(cand, p);
      const key = soundKey(flatten(cand));
      // 只检查被改动的小节：原题小节本身可能不满足 goodBar（如 ere/eer 两个带休止的单元凑满一小节），不能因此拒掉所有干扰项
      const changed = (b: Bar, i: number) => JSON.stringify(b) !== JSON.stringify(bars[i]);
      if (seen.has(key) || !cand.every((b, i) => !changed(b, i) || goodBar(b))) continue;
      seen.add(key);
      wrongs.push(cand);
    }

    const options = shuffle([bars, ...wrongs]);
    const choices: Choice[] = options.map((b, i) => ({ id: `r${i}`, label: describe(b), rhythm: flatten(b) }));
    const answer = choices[options.indexOf(bars)].id;

    return {
      item,
      events: rhythmEvents(flatten(bars), bpm),
      choices,
      answer: [answer],
      choiceEvents: (id) => rhythmEvents(choices.find((c) => c.id === id)?.rhythm ?? [], bpm),
      prompt: t('ex.rhythm.prompt', { bpm }),
      explain: `${describe(bars)}${hasRest(item) ? t('ex.rhythm.restNote') : ''}`,
    };
  },
};
