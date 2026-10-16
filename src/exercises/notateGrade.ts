// 节奏旋律听写的判定：把作答与正确答案逐音对齐，音高与节奏分开计分。
//
// 对齐用保序的动态规划（编辑距离）：配对两个音的代价 = 音高不同（或一个是休止）1 + 时值不同 1，
// 漏写或多写一个音的代价 1.2（因此音高、时值都错时算「写错」而不是「漏一个 + 多一个」）；
// 代价相同的对齐方式里取起音时刻最接近的（如二分音符写成了两个四分，配对的是第一个）。
// 按序列而不是按绝对时刻对齐，所以前面一个音的时值写错、后面整体错开时，后面的音仍算对，错误不会传递。

import type { NotateNote } from '../engine/types';

/** 合并相邻休止、去掉零时值 */
export function normalize(notes: NotateNote[]): NotateNote[] {
  const out: NotateNote[] = [];
  for (const n of notes) {
    if (n.dur <= 0) continue;
    const last = out[out.length - 1];
    if (n.rel === null && last && last.rel === null) out[out.length - 1] = { rel: null, dur: last.dur + n.dur };
    else out.push({ ...n });
  }
  return out;
}

export interface RefMark {
  /** 音高对不对；休止为 null（不计入音高） */
  pitch: boolean | null;
  rhythm: boolean;
  /** 配对到的作答下标（漏写为 null） */
  match: number | null;
}

export interface Grade {
  ref: RefMark[];
  /** 每个作答的音是否完全正确（多写的音为 false） */
  user: boolean[];
  pitch: { ok: number; n: number };
  rhythm: { ok: number; n: number };
  /** 多写的音数 */
  extras: number;
  allRight: boolean;
}

const GAP = 1.2;
const EPS = 1e-4;

function onsets(notes: NotateNote[]): number[] {
  let t = 0;
  return notes.map((n) => {
    const s = t;
    t += n.dur;
    return s;
  });
}

function pairCost(a: NotateNote, b: NotateNote): number {
  return (a.rel !== b.rel ? 1 : 0) + (a.dur !== b.dur ? 1 : 0);
}

/** 判定作答（两边都先 normalize）。 */
export function gradeDictation(refIn: NotateNote[], userIn: NotateNote[]): Grade {
  const ref = normalize(refIn);
  const user = normalize(userIn);
  const n = ref.length;
  const m = user.length;
  const ra = onsets(ref);
  const ua = onsets(user);
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const from: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0)); // 0 漏写 1 多写 2 配对
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      let best = Infinity;
      let f = 0;
      if (i > 0 && cost[i - 1][j] + GAP < best) [best, f] = [cost[i - 1][j] + GAP, 0];
      if (j > 0 && cost[i][j - 1] + GAP < best) [best, f] = [cost[i][j - 1] + GAP, 1];
      if (i > 0 && j > 0) {
        const c = cost[i - 1][j - 1] + pairCost(ref[i - 1], user[j - 1]) + (EPS * Math.abs(ra[i - 1] - ua[j - 1])) / 12;
        if (c < best - 1e-12) [best, f] = [c, 2];
      }
      cost[i][j] = best;
      from[i][j] = f;
    }

  const refMarks: RefMark[] = ref.map((r) => ({ pitch: r.rel === null ? null : false, rhythm: false, match: null }));
  const userOk = user.map(() => false);
  let extras = 0;
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const f = from[i][j];
    if (f === 2) {
      const r = ref[i - 1];
      const u = user[j - 1];
      const sameKind = (r.rel === null) === (u.rel === null);
      const mk = refMarks[i - 1];
      mk.match = j - 1;
      mk.rhythm = sameKind && r.dur === u.dur;
      if (r.rel !== null) mk.pitch = u.rel === r.rel;
      userOk[j - 1] = mk.rhythm && mk.pitch !== false;
      i--;
      j--;
    } else if (f === 1) {
      extras++;
      j--;
    } else i--;
  }

  const notes = refMarks.filter((r) => r.pitch !== null);
  const pitch = { ok: notes.filter((r) => r.pitch).length, n: notes.length };
  const rhythm = { ok: refMarks.filter((r) => r.rhythm).length, n: refMarks.length };
  return {
    ref: refMarks,
    user: userOk,
    pitch,
    rhythm,
    extras,
    allRight: extras === 0 && pitch.ok === pitch.n && rhythm.ok === rhythm.n,
  };
}
