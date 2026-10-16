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

/**
 * CSV 里一题的取值：整题答对 1、答错 0；多步题部分答对时为答对步数的比例（两位小数）。
 * 不写成「2/3」：Excel 会把它当成日期（2 月 3 日）。
 */
export function markCell(m: { ok: boolean; c: number; n: number }): number {
  if (m.ok) return 1;
  if (m.n <= 1) return 0;
  return Math.round((m.c / m.n) * 100) / 100;
}

// ───── 同一学生的多次提交 ─────

/** 学生的归并键：忽略大小写、全角半角与空格（「张 三」与「张三」、「ＬＩ si」与「Li Si」视为同一人）；未署名为空串 */
export function studentKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

/** 一名学生在一份作业里的全部提交：best 为显示与导出的那一次，attempts 按完成时间先后 */
export interface StudentResults<T> {
  best: T;
  attempts: T[];
}

/**
 * 按学生归并（同一份作业内）：同名的多次提交合成一行，取得分最高的一次（同分取最晚完成的），并保留全部提交。
 * 未署名的每条单独一行（无法判断是不是同一人）。顺序同各学生第一次出现的顺序。
 */
export function groupByStudent<T extends { name: string; score: number; at: number }>(rows: T[]): StudentResults<T>[] {
  const out: StudentResults<T>[] = [];
  const byKey = new Map<string, StudentResults<T>>();
  for (const r of rows) {
    const key = studentKey(r.name);
    const g = key ? byKey.get(key) : undefined;
    if (!g) {
      const fresh: StudentResults<T> = { best: r, attempts: [r] };
      out.push(fresh);
      if (key) byKey.set(key, fresh);
      continue;
    }
    g.attempts.push(r);
    if (r.score > g.best.score || (r.score === g.best.score && r.at >= g.best.at)) g.best = r;
  }
  for (const g of out) g.attempts.sort((a, b) => a.at - b.at);
  return out;
}

/** 二维表 → CSV 文本（CRLF 换行，开头带 BOM，Excel 打开中文不乱码） */
export function toCsv(rows: (string | number)[][]): string {
  return `\ufeff${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}
