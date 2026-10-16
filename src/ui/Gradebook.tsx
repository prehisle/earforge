// 成绩单（老师端）：添加过的成绩链接按作业（作业指纹）分组；每份作业一张学生 × 得分表，可排序、查看、删除、导出 CSV。
// 同一学生（同名）的多次提交合成一行，显示得分最高的一次与提交次数（未署名的不归并）。
// 只保存链接参数，显示时解码（无效的跳过）。姓名只作为文本渲染。
import { useMemo, useState } from 'react';
import { groupByStudent, markCell, removeFromGradebook, toCsv, type StudentResults } from '../engine/gradebook';
import type { Store } from '../engine/progress';
import { decodeResult, type ResultData } from '../engine/resultLink';
import { useT } from '../i18n/react';
import { useDateFmt } from './dateFmt';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  /** 打开的作业；缺省显示作业列表 */
  fp?: string;
  onBack(): void;
  onOpen(fp: string): void;
  onView(code: string): void;
}

interface Row {
  code: string;
  r: ResultData;
}

/** 表格的一行：一名学生（r 为得分最高的一次） */
interface Student extends Row {
  attempts: Row[];
}

const studentsOf = (rows: Row[]): Student[] =>
  groupByStudent(rows.map((x) => ({ ...x, name: x.r.name, score: x.r.score, at: x.r.at }))).map(
    ({ best, attempts }: StudentResults<Row & { name: string; score: number; at: number }>) => ({ ...best, attempts }),
  );

type SortKey = 'name' | 'score' | 'minutes' | 'at';

const pct = (c: number, n: number) => (n ? Math.round((c / n) * 100) : 0);

/** 下载文本文件 */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GradebookPage({ store, update, fp, onBack, onOpen, onView }: Props) {
  const t = useT();
  const fmt = useDateFmt();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'score', desc: true });

  // 按作业分组（组内按添加先后）
  const groups = useMemo(() => {
    const out = new Map<string, Row[]>();
    for (const { code } of store.gradebook ?? []) {
      const r = decodeResult(code);
      if (!r) continue;
      const g = out.get(r.fingerprint) ?? [];
      g.push({ code, r });
      out.set(r.fingerprint, g);
    }
    return out;
  }, [store.gradebook]);

  const nameOf = (rows: Row[]) => rows[rows.length - 1].r.set.name || t('share.untitled');
  const anon = t('result.anon');

  if (!fp) {
    const list = [...groups.entries()].reverse();
    return (
      <main className="page gradebook">
        <header className="topbar">
          <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
            {t('common.back')}
          </button>
          <div className="practice-title">
            <h1>{t('grade.title')}</h1>
          </div>
          <span className="topbar-spacer" />
        </header>
        <p className="sets-intro muted">
          {t('grade.intro')} {t('result.selfReported')}
        </p>
        {list.length === 0 ? (
          <p className="sets-empty muted">{t('grade.empty')}</p>
        ) : (
          <ul className="set-list">
            {list.map(([key, rows]) => {
              const n = rows[0].r.marks.length;
              const students = studentsOf(rows);
              const avg = Math.round(students.reduce((a, x) => a + pct(x.r.score, n), 0) / students.length);
              return (
                <li key={key} className="set-item">
                  <div className="set-item-head">
                    <h2>{nameOf(rows)}</h2>
                    <p className="muted">{t('grade.assignMeta', { n, s: students.length, avg })}</p>
                  </div>
                  <div className="set-actions">
                    <button className="primary" onClick={() => onOpen(key)}>
                      {t('grade.view')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    );
  }

  const rows = groups.get(fp) ?? [];
  const title = rows.length ? nameOf(rows) : t('grade.title');
  const n = rows[0]?.r.marks.length ?? 0;
  const students = studentsOf(rows);

  const sorted = [...students].sort((a, b) => {
    const k = sort.key;
    const d =
      k === 'name'
        ? (a.r.name || anon).localeCompare(b.r.name || anon)
        : k === 'score'
          ? a.r.score - b.r.score
          : k === 'minutes'
            ? a.r.minutes - b.r.minutes
            : a.r.at - b.r.at;
    return sort.desc ? -d : d;
  });

  const cols: { key: SortKey; label: string }[] = [
    { key: 'name', label: t('grade.colName') },
    { key: 'score', label: t('grade.colScore') },
    { key: 'minutes', label: t('grade.colMinutes') },
    { key: 'at', label: t('grade.colDate') },
  ];

  const exportCsv = () => {
    const head = [
      t('grade.colName'),
      t('grade.colScore'),
      t('grade.colPct'),
      t('grade.colMinutes'),
      t('grade.colDate'),
      t('grade.colVersion'),
      t('grade.colAttempts'),
    ];
    const qs = Array.from({ length: n }, (_, i) => t('grade.qCol', { i: i + 1 }));
    const pad = (x: number) => String(x).padStart(2, '0');
    const date = (ms: number) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const body = sorted.map(({ r, attempts }) => [
      r.name,
      r.score,
      pct(r.score, n),
      r.minutes,
      date(r.at),
      r.version,
      attempts.length,
      ...r.marks.map(markCell),
    ]);
    const file = title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'earforge';
    download(`${file}.csv`, toCsv([[...head, ...qs], ...body]));
  };

  return (
    <main className="page gradebook">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{title}</h1>
          {rows.length > 0 && (
            <p className="muted">
              {t('grade.assignMeta', {
                n,
                s: students.length,
                avg: Math.round(students.reduce((a, x) => a + pct(x.r.score, n), 0) / students.length),
              })}
            </p>
          )}
        </div>
        <span className="topbar-spacer" />
      </header>

      {rows.length === 0 ? (
        <p className="sets-empty muted">{t('grade.notFound')}</p>
      ) : (
        <>
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                      <button
                        className="grade-sort"
                        aria-label={t('grade.sortBy', { col: c.label })}
                        onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.key !== 'name' }))}
                      >
                        {c.label}
                        <span aria-hidden>{sort.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}</span>
                      </button>
                    </th>
                  ))}
                  <th scope="col">{t('grade.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ code, r, attempts }) => {
                  const who = r.name || anon;
                  return (
                    <tr key={code}>
                      <th scope="row">
                        {who}
                        {attempts.length > 1 && (
                          <span className="muted grade-attempts" title={t('grade.attemptsAria', { n: attempts.length })}>
                            <span aria-hidden> {t('grade.attempts', { n: attempts.length })}</span>
                            <span className="sr-only">{t('grade.attemptsAria', { n: attempts.length })}</span>
                          </span>
                        )}
                      </th>
                      <td className="num">
                        {r.score}/{n} <span className="muted">({pct(r.score, n)}%)</span>
                      </td>
                      <td className="num">{r.minutes}</td>
                      <td>{fmt.format(r.at)}</td>
                      <td>
                        <div className="grade-actions">
                          <button onClick={() => onView(code)}>{t('grade.view')}</button>
                          <button
                            className="ghost"
                            aria-label={t('grade.removeAria', { name: who })}
                            onClick={() => {
                              const msg =
                                attempts.length > 1
                                  ? t('grade.removeConfirmAll', { name: who, n: attempts.length })
                                  : t('grade.removeConfirm', { name: who });
                              if (!confirm(msg)) return;
                              update((s) => {
                                for (const a of attempts) removeFromGradebook(s.gradebook ?? [], a.code);
                              });
                            }}
                          >
                            {t('grade.remove')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="shared-actions">
            <button className="primary" onClick={exportCsv}>
              {t('grade.csv')}
            </button>
            <button className="ghost" onClick={onBack}>
              {t('grade.backList')}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
