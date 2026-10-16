// 模拟考试的历史成绩。单独成文件、不依赖其他模块，供 progress.ts（读取/导入时规范化）与考试页共用。

/** 一次模拟考试的成绩 */
export interface ExamRecord {
  /** 试卷 id（见 exam.ts 的 EXAM_PRESETS） */
  preset: string;
  /** 交卷时间戳 */
  at: number;
  /** 总分 0..100 */
  score: number;
  /** 各部分得分率 0..100，顺序同试卷的 sections */
  sections: number[];
  /** 是否限时 */
  timed: boolean;
  /** 用时（秒） */
  secs: number;
  /** 是否因时间到而自动交卷 */
  timedOut?: boolean;
}

/** 最多保留的记录条数（超出时丢弃最早的） */
export const EXAM_HISTORY_MAX = 200;

const num = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null;

/** 规范化历史记录（读取本地数据与导入备份时用）：丢弃格式不对的条目，分数限制在 0..100，按时间排序。 */
export function sanitizeExams(raw: unknown): ExamRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamRecord[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const score = num(r.score, 100);
    const at = num(r.at, Number.MAX_SAFE_INTEGER);
    if (typeof r.preset !== 'string' || !r.preset || score === null || !at) continue;
    const sections = Array.isArray(r.sections) ? r.sections.map((s) => num(s, 100) ?? 0) : [];
    const rec: ExamRecord = {
      preset: r.preset,
      at,
      score,
      sections,
      timed: r.timed === true,
      secs: num(r.secs, 24 * 3600) ?? 0,
    };
    if (r.timedOut === true) rec.timedOut = true;
    out.push(rec);
  }
  return out.sort((a, b) => a.at - b.at).slice(-EXAM_HISTORY_MAX);
}

/** 追加一条成绩（就地修改），超出上限时丢弃最早的。 */
export function addExamRecord(list: ExamRecord[], rec: ExamRecord): ExamRecord[] {
  list.push(rec);
  if (list.length > EXAM_HISTORY_MAX) list.splice(0, list.length - EXAM_HISTORY_MAX);
  return list;
}

/** 某套试卷的历史：按时间先后，以及最好成绩（没有记录时为 null）。 */
export function presetHistory(list: ExamRecord[] | undefined, preset: string): { attempts: ExamRecord[]; best: number | null } {
  const attempts = (list ?? []).filter((r) => r.preset === preset);
  return { attempts, best: attempts.length ? Math.max(...attempts.map((r) => r.score)) : null };
}
