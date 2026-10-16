import { describe, expect, it } from 'vitest';
import {
  GRADEBOOK_MAX,
  addToGradebook,
  csvField,
  groupByStudent,
  markCell,
  removeFromGradebook,
  sanitizeGradebook,
  studentKey,
  toCsv,
} from '../engine/gradebook';
import { importBackup, parseStore } from '../engine/progress';

describe('成绩单存储', () => {
  it('规范化：丢弃格式不对的与重复的，按添加时间排序', () => {
    const out = sanitizeGradebook([
      { code: 'b.c', added: 2 },
      { code: 'a.c', added: 1 },
      { code: 'a.c', added: 3 },
      { code: '<script>', added: 4 },
      { code: '', added: 5 },
      { code: 'x'.repeat(6000), added: 6 },
      null,
      'str',
      { code: 'd.e' },
    ]);
    expect(out).toEqual([
      { code: 'd.e', added: 0 },
      { code: 'a.c', added: 1 },
      { code: 'b.c', added: 2 },
    ]);
    expect(sanitizeGradebook('nope')).toEqual([]);
  });

  it('添加不重复，超出上限丢弃最早的；删除', () => {
    const list = [{ code: 'a.b', added: 1 }];
    expect(addToGradebook(list, 'a.b', 2)).toBe(false);
    expect(addToGradebook(list, 'c.d', 3)).toBe(true);
    expect(list.map((r) => r.code)).toEqual(['a.b', 'c.d']);
    removeFromGradebook(list, 'a.b');
    expect(list.map((r) => r.code)).toEqual(['c.d']);
    for (let i = 0; i < GRADEBOOK_MAX + 5; i++) addToGradebook(list, `k${i}.x`, 10 + i);
    expect(list.length).toBe(GRADEBOOK_MAX);
    expect(list[list.length - 1].code).toBe(`k${GRADEBOOK_MAX + 4}.x`);
  });

  it('读取存储与导入备份时规范化', () => {
    const s = parseStore(JSON.stringify({ version: 1, settings: {}, exercises: {}, daily: {}, gradebook: [{ code: 'a.b', added: 1 }, 5] }));
    expect(s.gradebook).toEqual([{ code: 'a.b', added: 1 }]);
    expect(parseStore(null).gradebook).toEqual([]);
    // 导入备份：成绩单合并（不能用旧备份覆盖掉之后才收到的成绩）
    importBackup(s, { version: 1, exercises: {}, gradebook: [{ code: 'c.d', added: 2 }, { code: 'a.b', added: 9 }] });
    expect(s.gradebook).toEqual([
      { code: 'a.b', added: 1 },
      { code: 'c.d', added: 2 },
    ]);
    // 旧备份没有成绩单：保留现有的
    importBackup(s, { version: 1, exercises: {} });
    expect(s.gradebook).toEqual([
      { code: 'a.b', added: 1 },
      { code: 'c.d', added: 2 },
    ]);
  });
});

describe('同一学生的多次提交', () => {
  const r = (name: string, score: number, at: number) => ({ name, score, at });
  it('同名合成一行：取得分最高的一次（同分取最晚的），给出全部提交；未署名的不归并', () => {
    const rows = [r('张三', 3, 10), r('Li Si', 4, 11), r('张 三', 5, 12), r('', 1, 13), r('', 2, 14), r('ＬＩ si', 4, 15), r('张三', 2, 16)];
    const g = groupByStudent(rows);
    expect(g.map((x) => [x.best.name, x.best.score, x.best.at, x.attempts.length])).toEqual([
      ['张 三', 5, 12, 3],
      ['ＬＩ si', 4, 15, 2],
      ['', 1, 13, 1],
      ['', 2, 14, 1],
    ]);
    expect(g[0].attempts.map((x) => x.at)).toEqual([10, 12, 16]);
    expect(studentKey(' Li  Si ')).toBe(studentKey('ｌｉsi'));
    expect(studentKey('')).toBe('');
  });
});

describe('CSV', () => {
  it('转义逗号、引号、换行；防公式注入', () => {
    expect(csvField('张三')).toBe('张三');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('-x')).toBe("'-x");
    expect(csvField(-3)).toBe('-3');
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('\tx')).toBe("'\tx");
    expect(csvField('\r=1')).toBe(`"'\r=1"`);
    expect(csvField('a\nb')).toBe('"a\nb"');
    expect(
      toCsv([
        ['a', 1],
        ['b,c', 2],
      ]),
    ).toBe('\ufeffa,1\r\n"b,c",2\r\n');
  });

  it('\u591a\u6b65\u9898\u90e8\u5206\u7b54\u5bf9\u5199\u6210\u6bd4\u4f8b\uff0c\u4e0d\u5199\u300c2/3\u300d\uff08Excel \u4f1a\u5f53\u6210\u65e5\u671f\uff09', () => {
    expect(markCell({ ok: true, c: 1, n: 1 })).toBe(1);
    expect(markCell({ ok: false, c: 0, n: 1 })).toBe(0);
    expect(markCell({ ok: true, c: 4, n: 4 })).toBe(1);
    expect(markCell({ ok: false, c: 2, n: 3 })).toBe(0.67);
    expect(String(markCell({ ok: false, c: 1, n: 4 }))).not.toContain('/');
  });
});
