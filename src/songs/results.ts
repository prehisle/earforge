// 曲库的练习记录：独立于练耳考点的进度（Store.songs），不计入今日训练题数。

import type { SongResult, Store } from '../engine/progress';

export function songResult(s: Store, id: string): SongResult | undefined {
  return s.songs?.[id];
}

/** 记录一次跟唱（带节拍、有分数）。 */
export function recordSing(s: Store, id: string, accuracy: number, now = Date.now()): void {
  const songs = (s.songs ??= {});
  const r = (songs[id] ??= { best: 0, attempts: 0, practiced: 0, last: 0, lastScore: 0 });
  r.attempts++;
  r.best = Math.max(r.best, accuracy);
  r.lastScore = accuracy;
  r.last = now;
}

/** 记录一次逐音练习（唱完整首，不计分）。 */
export function recordPractice(s: Store, id: string, now = Date.now()): void {
  const songs = (s.songs ??= {});
  const r = (songs[id] ??= { best: 0, attempts: 0, practiced: 0, last: 0, lastScore: 0 });
  r.practiced++;
  r.last = now;
}

/** 唱过（跟唱或逐音练习过）。 */
export function hasSung(r: SongResult | undefined): boolean {
  return !!r && (r.attempts > 0 || r.practiced > 0);
}
