// 首页卡片的可见性：新手只突出几个入门练习，其余收进「更多练习」；随进度自动移到前面。纯函数，不修改 store。
//
// 规则（按顺序判断，满足任一条就显示在前面）：
//   1. 入门练习：调内音级、音程识别、和弦性质；引导里选「学过乐器」再加级数和弦，选「备考」再加旋律听写。
//   2. 练过的练习：有任何作答记录或自选过考点（视唱曲库：唱过任何一首）。老用户练过的不会被收起。
//   3. 按累计答题数分批解锁：满 UNLOCK_TIERS[i].at 题后，该批练习移到前面。
// 其余的放在「更多练习」里，可以手动展开（展开状态记在设置里）。

import { totalAnswered } from './onboarding';
import type { Store } from './progress';
import type { Background } from './types';

/** 所有人都突出的入门练习 */
export const CORE_IDS = ['degrees', 'intervals', 'chords'];

/** 按引导所选背景追加的入门练习（与 START_LEVELS 里调高起点的模块一致） */
export const EXTRA_CORE: Record<Background, string[]> = {
  beginner: [],
  player: ['progressions'],
  exam: ['dictation'],
};

/** 视唱曲库入口卡片的 id（不是练习模块，但和练习卡片一起排） */
export const SONGS_ID = 'songs';

/** 分批解锁：累计答满 at 题后，ids 里的练习移到前面 */
export const UNLOCK_TIERS: { at: number; ids: string[] }[] = [
  { at: 50, ids: ['inversions', 'scales', 'progressions', 'rhythm', 'dictation'] },
  { at: 150, ids: ['harmony', 'bassLine', 'rhythmDictation', 'rhythmTap', 'singing', SONGS_ID] },
];

/** 入门练习（按背景） */
export function coreIds(store: Store): string[] {
  const bg = store.settings.background;
  return bg ? [...CORE_IDS, ...EXTRA_CORE[bg]] : CORE_IDS;
}

/** 练过：有作答记录或自选过考点；视唱曲库看是否有曲目记录 */
export function practiced(store: Store, id: string): boolean {
  if (id === SONGS_ID) return Object.keys(store.songs ?? {}).length > 0;
  const p = store.exercises[id];
  return !!p && (p.custom !== null || Object.values(p.items).some((st) => st.n > 0));
}

export interface HomeLayout {
  /** 显示在前面的卡片（保持传入的顺序） */
  front: string[];
  /** 收进「更多练习」的卡片 */
  more: string[];
  /** 下一批还在「更多练习」里的解锁：还差几题、会移到前面的练习；没有了为 null */
  next: { left: number; ids: string[] } | null;
}

/** 把 ids（首页全部卡片，按显示顺序）分成前面与「更多练习」两部分。 */
export function homeLayout(store: Store, ids: string[]): HomeLayout {
  const n = totalAnswered(store);
  const shown = new Set(coreIds(store));
  for (const tier of UNLOCK_TIERS) if (n >= tier.at) tier.ids.forEach((id) => shown.add(id));
  const front = ids.filter((id) => shown.has(id) || practiced(store, id));
  const more = ids.filter((id) => !front.includes(id));
  let next: HomeLayout['next'] = null;
  for (const tier of UNLOCK_TIERS) {
    if (n >= tier.at) continue;
    const pending = tier.ids.filter((id) => more.includes(id));
    if (pending.length) {
      next = { left: tier.at - n, ids: pending };
      break;
    }
  }
  return { front, more, next };
}
