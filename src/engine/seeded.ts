// 固定题目：可复现的伪随机数。练习的 generate 直接（或经 music/theory 的 pick / randInt）调用 Math.random，
// withSeed 在一次同步调用期间临时替换 Math.random，使同一 seed 出完全相同的题。
//
// 练习组合运行时的用法（setSource 见 setRunner.ts）：
//   const source = set.seed === undefined
//     ? setSource(set, Math.random)
//     : seededSource(setSource(set, mulberry32(set.seed)), set.seed);
// seededSource 给每题的 Draw 加上 seed = questionSeed(set.seed, 第 k 题)，Quiz 出题时据此调用 withSeed。
// 第 k 题的 seed 只取决于组合 seed 与题号，与作答结果无关。

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
