// 固定题目：可复现的伪随机数。练习的 generate 直接（或经 music/theory 的 pick / randInt）调用 Math.random，
// withSeed 在一次同步调用期间临时替换 Math.random，使同一 seed 出完全相同的题。
//
// 练习组合运行时的用法（setSource 见 setRunner.ts）：
//   const source = set.seed === undefined
//     ? setSource(set, Math.random)
//     : seededSource(setSource(set, mulberry32(set.seed)), set.seed);
// seededSource 给每题的 Draw 加上 seed = questionSeed(set.seed, 第 k 题)，Quiz 出题时据此调用 withSeed。
// 第 k 题的 seed 只取决于组合 seed 与题号，与作答结果无关。
//
// 出题还读取部分用户设置（固定 C 调 / 随机调、人声音区），这些设置决定 generate 消耗多少随机数、生成什么音高，
// 不同设置的人会拿到不同的题。固定题目出题时用 SEEDED_GEN_SETTINGS 覆盖它们（SetRun 作为 Quiz 的 genSettings 传入，只用于出题；
// 唱名体系、记谱方式等只影响显示的设置仍按用户自己的）。
//
// 可复现的前提（复查结论）：
// - generate 全程同步，没有 async / 定时器；音色随机（audio.newQuestion）在 withSeed 之外调用，不消耗题目的随机数。
// - 出题路径不用 localeCompare / Intl / toLocaleString；排序都是数值比较（Array.prototype.sort 自 ES2019 起稳定），
//   Chrome 与 Safari 结果相同。旋律听写用 Math.pow(x, 1.2) 算权重，不同引擎末位可能差 1 ulp，
//   只有随机数恰好落在边界的 1e-16 内才会选到不同的音，可忽略。
// - 链接里没有「题库版本」：以后改了练习的级别 / 考点 / generate / planSet，同一链接会出不同的题（不会报错）。
//   seeded.test.ts 的「出题指纹」测试会在这类改动时失败，提醒在 CHANGELOG 里注明。

import type { Settings } from './types';

/** 固定题目出题时统一使用的设置：随机调、低音区（与默认设置相同） */
export const SEEDED_GEN_SETTINGS: Readonly<Pick<Settings, 'keyMode' | 'voice'>> = { keyMode: 'random', voice: 'low' };

/** mulberry32：32 位状态的小型 PRNG，返回 [0, 1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在 fn 执行期间把 Math.random 换成以 seed 初始化的 PRNG；结束（含抛异常）后恢复。可嵌套。fn 必须是同步的。 */
export function withSeed<T>(seed: number, fn: () => T): T {
  const saved = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = saved;
  }
}

/** 32 位整数混合（murmur3 fmix32） */
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 第 index 题（从 0 起）的 seed：只取决于组合 seed 与题号 */
export function questionSeed(setSeed: number, index: number): number {
  return fmix((setSeed >>> 0) ^ fmix(Math.imul(index + 1, 0x9e3779b9) >>> 0));
}

/** 新的组合 seed（1 … 2³²−1） */
export function newSeed(): number {
  const buf = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buf);
  else buf[0] = Math.floor(Math.random() * 0x100000000);
  return buf[0] || 1;
}

/**
 * 给题源的每一题加上固定的 seed（第 k 次 next() 得到 questionSeed(setSeed, k)）。
 * 结构化类型，不依赖 UI：source 即 Practice.tsx 的 QuizSource，Draw 带可选的 seed 字段。
 */
export function seededSource<D extends object>(
  source: { next(): D | null; hasNext?(): boolean },
  setSeed: number,
): { next(): (D & { seed: number }) | null; hasNext?(): boolean } {
  let k = 0;
  const out: { next(): (D & { seed: number }) | null; hasNext?(): boolean } = {
    next() {
      const d = source.next();
      return d && { ...d, seed: questionSeed(setSeed, k++) };
    },
  };
  if (source.hasNext) out.hasNext = () => source.hasNext!();
  return out;
}
