import { describe, expect, it } from 'vitest';
import { GRADEBOOK_MAX, addToGradebook, csvField, removeFromGradebook, sanitizeGradebook, toCsv } from '../engine/gradebook';
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
    importBackup(s, { version: 1, exercises: {}, gradebook: [{ code: 'c.d', added: 2 }] });
    expect(s.gradebook).toEqual([{ code: 'c.d', added: 2 }]);
    // 旧备份没有成绩单：保留现有的
    importBackup(s, { version: 1, exercises: {} });
    expect(s.gradebook).toEqual([{ code: 'c.d', added: 2 }]);
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
    expect(
      toCsv([
        ['a', 1],
        ['b,c', 2],
      ]),
    ).toBe('\ufeffa,1\r\n"b,c",2\r\n');
  });
});
