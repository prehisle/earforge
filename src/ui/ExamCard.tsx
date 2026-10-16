// 首页的模拟考试入口卡片。单独成文件：考试页（Exam.tsx）按需加载，首页只需要这张卡片与试卷列表。
import type { Store } from '../engine/progress';
import { EXAM_PRESETS } from '../engine/examPresets';
import { useT } from '../i18n/react';

/** 首页入口卡片 */
export function ExamCard({ store, onOpen }: { store: Store; onOpen(): void }) {
  const t = useT();
  const list = store.exams ?? [];
  const last = list[list.length - 1];
  return (
    <button className="card" onClick={onOpen}>
      <span className="card-icon">📝</span>
      <span className="card-body">
        <span className="card-title">{t('group.exam')}</span>
        <span className="card-sub">{t('exam.cardSub', { n: EXAM_PRESETS.length })}</span>
        <span className="card-meta">
          {last ? t('exam.cardLast', { name: t(EXAM_PRESETS.find((p) => p.id === last.preset)?.title ?? 'exam.title'), score: last.score }) : t('exam.never')}
        </span>
      </span>
    </button>
  );
}
