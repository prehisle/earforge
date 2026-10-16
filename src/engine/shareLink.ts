// 分享链接：把练习组合编码进 URL。占位实现，由分享模块完善（压缩、版本号、校验）。
import type { PracticeSet } from './practiceSet';

/** 分享时编码的内容（不含本地 id 与创建时间） */
export type SharedSet = Omit<PracticeSet, 'id' | 'created'>;

/** 组合 → 完整分享网址（基于当前页面地址） */
export function shareUrl(set: SharedSet): string {
  throw new Error(`shareUrl not implemented: ${set.name}`);
}

/** 从当前网址解析分享的组合；没有或无效时返回 null */
export function readSharedSet(href: string): SharedSet | null {
  void href;
  return null;
}
