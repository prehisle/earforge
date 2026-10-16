// 自定义练习组合：从若干练习中各取一部分考点与选项，混合出题；可保存、可通过链接分享。
// 本文件只定义数据结构（UI、存储与分享编码分别在各自的模块里实现）。

/** 组合中的一个练习 */
export interface SetPart {
  /** 练习 id（见 src/exercises/index.ts） */
  ex: string;
  /** 本练习参与出题的考点 id（非空） */
  items: string[];
  /** 本练习的选项（如调式、长度、速度）；缺省项用练习的默认值 */
  options: Record<string, string>;
  /** 出题权重，缺省为 1 */
  weight?: number;
}

/** 一个练习组合 */
export interface PracticeSet {
  /** 本地 id（分享时不编码，导入时重新生成） */
  id: string;
  name: string;
  parts: SetPart[];
  /** 每组题数 */
  count: number;
  /** 固定题目：给定 seed 时，同一组合每次（以及每个打开同一链接的人）出的题完全相同；缺省为随机 */
  seed?: number;
  /** 创建时间（毫秒） */
  created: number;
}
