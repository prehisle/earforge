// 成绩单（老师端）：收到的成绩链接，用户点「添加到成绩单」时才保存在本地。
// 只保存链接参数原文（见 resultLink.ts），显示时再解码、按作业指纹分组；不依赖其他模块，
// 供 progress.ts（读取/导入时规范化）与成绩页共用。不算练习记录：「清空全部练习记录」时保留。

/** 一条收到的成绩 */
export interface SavedResult {
  /** 成绩链接的参数（#r= 之后的部分） */
  code: string;
  /** 添加时间戳 */
  added: number;
}

/** 最多保存的条数（超出时丢弃最早添加的） */
export const GRADEBOOK_MAX = 1000;
/** 单条参数的长度上限（与 resultLink 的解码上限一致：成绩段 + 组合段） */
const MAX_LEN = 1024 + 1 + 4096;

/** 规范化（读取本地数据与导入备份时用）：丢弃格式不对的与重复的，按添加时间排序 */
export function sanitizeGradebook(raw: unknown): SavedResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SavedResult[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    if (typeof r.code !== 'string' || !r.code || r.code.length > MAX_LEN || !/^[A-Za-z0-9_.-]+$/.test(r.code)) continue;
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    const added = typeof r.added === 'number' && Number.isFinite(r.added) && r.added > 0 ? Math.floor(r.added) : 0;
    out.push({ code: r.code, added });
  }
  return out.sort((a, b) => a.added - b.added).slice(-GRADEBOOK_MAX);
}

/** 添加一条（就地修改）；已有同一条成绩时不重复添加，返回 false */
export function addToGradebook(list: SavedResult[], code: string, now = Date.now()): boolean {
  if (list.some((r) => r.code === code)) return false;
  list.push({ code, added: now });
  if (list.length > GRADEBOOK_MAX) list.splice(0, list.length - GRADEBOOK_MAX);
  return true;
}

/** 删除一条（就地修改） */
export function removeFromGradebook(list: SavedResult[], code: string): void {
  const i = list.findIndex((r) => r.code === code);
  if (i >= 0) list.splice(i, 1);
}

/** CSV 的一个字段：含逗号、引号、换行时加引号；以 = + - @ 开头的加单引号前缀，避免被表格软件当作公式 */
export function csvField(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 二维表 → CSV 文本（CRLF 换行，开头带 BOM，Excel 打开中文不乱码） */
export function toCsv(rows: (string | number)[][]): string {
  return `\ufeff${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}
