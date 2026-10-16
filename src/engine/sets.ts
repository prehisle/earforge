// 练习组合的存储操作：保存（新建 / 覆盖）、复制、删除。都是在 update(fn) 的副本上就地修改。

import type { Store } from './progress';
import type { PracticeSet } from './practiceSet';
import { cleanSetName, newSetId, normalizeSet, SET_NAME_MAX, SETS_MAX } from './setRunner';

/** 要保存的组合：没有 id（如从分享链接导入的）时新建，有 id 时覆盖同 id 的 */
export type SetInput = Omit<PracticeSet, 'id' | 'created'> & Partial<Pick<PracticeSet, 'id' | 'created'>>;

/** 已保存的组合 */
export function listSets(s: Store): PracticeSet[] {
  return s.sets ?? [];
}

export function findSet(s: Store, id: string): PracticeSet | undefined {
  return s.sets?.find((x) => x.id === id);
}

/** 已存满 SETS_MAX 个：不能再新建 / 复制 / 保存分享来的组合（不悄悄删掉最早的，由界面提示用户先删除） */
export function setsFull(s: Store): boolean {
  return (s.sets?.length ?? 0) >= SETS_MAX;
}

/**
 * 保存组合（就地修改 st）：规范化后按 id 覆盖，没有 id 或 id 不存在时追加到末尾。
 * 返回保存的组合；没有可用的练习、或要新增而已存满时返回 null、不做修改。
 */
export function putSet(st: Store, input: SetInput): PracticeSet | null {
  const set = normalizeSet({ ...input, id: input.id || newSetId(), created: input.created ?? Date.now() });
  if (!set) return null;
  const list = (st.sets ??= []);
  const i = list.findIndex((x) => x.id === set.id);
  if (i >= 0) list[i] = set;
  else {
    if (list.length >= SETS_MAX) return null;
    list.push(set);
  }
  return set;
}

/**
 * 保存组合并持久化（供分享链接的导入页等调用）。update 即 useStore 返回的修改函数。
 * 返回保存后的组合（含 id）；无效时返回 null。
 */
export function saveSet(update: (fn: (s: Store) => void) => void, input: SetInput): PracticeSet | null {
  let saved: PracticeSet | null = null;
  update((st) => {
    saved = putSet(st, input);
  });
  return saved;
}

/**
 * 副本的名称：fmt(名称, n) 给出第 n 个副本的写法（n = 1 时不带编号，如「甲（副本）」，之后「甲（副本 2）」…），
 * 取第一个不与 taken 重名的；原名过长时截短原名，保证后缀完整、总长不超过 SET_NAME_MAX。
 */
export function copyName(name: string, taken: string[], fmt: (name: string, n: number) => string): string {
  const used = new Set(taken);
  const cps = [...name];
  for (let n = 1; ; n++) {
    const extra = [...fmt('', n)].length;
    const out = cleanSetName(fmt(cps.slice(0, Math.max(0, SET_NAME_MAX - extra)).join('').trimEnd(), n));
    if (!used.has(out) || n >= SETS_MAX + 1) return out;
  }
}

/** 复制组合（插在原组合后面），返回副本；找不到或已存满时返回 null。 */
export function duplicateSet(st: Store, id: string, name: string): PracticeSet | null {
  const list = st.sets ?? [];
  const i = list.findIndex((x) => x.id === id);
  if (i < 0 || list.length >= SETS_MAX) return null;
  const copy = normalizeSet({ ...structuredClone(list[i]), id: newSetId(), name, created: Date.now() });
  if (!copy) return null;
  list.splice(i + 1, 0, copy);
  return copy;
}

/** 删除组合 */
export function deleteSet(st: Store, id: string): void {
  if (st.sets) st.sets = st.sets.filter((x) => x.id !== id);
}
