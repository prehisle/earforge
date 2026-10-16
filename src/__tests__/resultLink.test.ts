import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../engine/types';
import {
  MAX_STUDENT,
  decodeResult,
  encodeResult,
  hasResult,
  readResult,
  resultDraws,
  resultUrl,
  setFingerprint,
  type ResultInput,
} from '../engine/resultLink';
import { mulberry32, SEEDED_GEN_SETTINGS, seededSource, withSeed } from '../engine/seeded';
import { setSource } from '../engine/setRunner';
import { SET_TEMPLATES, templateSet } from '../engine/setTemplates';
import { checksum, decodeSet, encodeSet, fromBase64Url, toBase64Url, toPracticeSet, type SharedSet } from '../engine/shareLink';
import { exerciseById } from '../exercises';

const tpl = (id: string, count: number, name = '期中复习 · 三班'): SharedSet => ({
  ...templateSet(
    SET_TEMPLATES.find((t) => t.id === id)!,
    name,
  ),
  count,
  seed: 0x9e3779b9,
});

/** n 题的作答：第 k 题按 pattern 决定对错；multi 中的题号为 4 步题 */
function input(set: SharedSet, wrong: number[] = [], multi: number[] = []): ResultInput {
  return {
    set,
    results: Array.from({ length: set.count }, (_, k) => {
      const n = multi.includes(k) ? 4 : 1;
      return { steps: Array.from({ length: n }, (_, j) => ({ ok: !(wrong.includes(k) && j === 0) })) };
    }),
    at: Date.UTC(2026, 9, 16, 8, 30, 15),
    minutes: 12.4,
    version: '0.9.0',
    name: '张三',
  };
}

/** 成绩段的明文，改写后重新封装（校验正确），用来构造各种「合法校验但内容不对」的输入 */
function reseal(code: string, edit: (fields: string[]) => string[]): string {
  const [head, setCode] = code.split('.');
  const fields = edit(fromBase64Url(head)!.split('|'));
  const body = fields.slice(2).join('|');
  return `${toBase64Url(`${fields[0]}|${checksum(`${body}.${setCode}`)}|${body}`)}.${setCode}`;
}

describe('成绩链接编解码', () => {
  it('往返：分数、每题对错、多步题、时间、姓名', () => {
    const set = tpl('grade', 20);
    const code = encodeResult(input(set, [1, 4, 7, 19], [3, 7]));
    const r = decodeResult(code)!;
    expect(r).not.toBeNull();
    expect(r.score).toBe(16);
    expect(r.marks.map((m) => m.ok)).toEqual(Array.from({ length: 20 }, (_, k) => ![1, 4, 7, 19].includes(k)));
    expect(r.marks[3]).toEqual({ ok: true, c: 4, n: 4 });
    expect(r.marks[7]).toEqual({ ok: false, c: 3, n: 4 });
    expect(r.marks[0]).toEqual({ ok: true, c: 1, n: 1 });
    expect(r.at).toBe(Date.UTC(2026, 9, 16, 8, 30));
    expect(r.minutes).toBe(12);
    expect(r.version).toBe('0.9.0');
    expect(r.name).toBe('张三');
    expect(r.set).toEqual(decodeSet(encodeSet(set)));
    expect(r.setCode).toBe(encodeSet(set));
  });

  it('题数不是 4 的倍数、全对、全错、只有 1 题', () => {
    for (const count of [1, 2, 5, 7, 13, 100]) {
      const set = tpl('ivChord', count);
      const all = Array.from({ length: count }, (_, k) => k);
      expect(decodeResult(encodeResult(input(set)))!.score).toBe(count);
      expect(decodeResult(encodeResult(input(set, all)))!.score).toBe(0);
    }
  });

  it('长度：20 题的自包含链接在 600 字符以内', () => {
    const lens: Record<string, number> = {};
    for (const t of SET_TEMPLATES) {
      const set = tpl(t.id, 20);
      const url = resultUrl(input(set, [2, 5], [1, 3, 9]), 'https://example.github.io/earforge/');
      lens[t.id] = url.length;
      expect(url.length).toBeLessThan(600);
    }
    // 成绩段本身很短（组合段占大头）
    const head = encodeResult(input(tpl('grade', 20), [2, 5])).split('.')[0];
    expect(head.length).toBeLessThan(80);
    console.info('成绩链接长度（20 题）', lens, '成绩段', head.length);
  });

  it('作业指纹：与名称无关，与内容、seed 有关', () => {
    const a = tpl('grade', 20, '甲班');
    expect(setFingerprint(a)).toBe(setFingerprint({ ...a, name: '乙班' }));
    expect(setFingerprint(a)).not.toBe(setFingerprint({ ...a, seed: 1 }));
    expect(setFingerprint(a)).not.toBe(setFingerprint({ ...a, count: 21 }));
    expect(decodeResult(encodeResult(input(a)))!.fingerprint).toBe(setFingerprint(a));
  });

  it('姓名：清理控制字符，最多 20 个字符，可为空', () => {
    const set = tpl('ivChord', 5);
    const long = decodeResult(encodeResult({ ...input(set), name: ` 王\n小明|${'😀'.repeat(30)} ` }))!;
    expect([...long.name].length).toBe(MAX_STUDENT);
    expect(long.name.startsWith('王 小明|')).toBe(true);
    expect(decodeResult(encodeResult({ ...input(set), name: '' }))!.name).toBe('');
  });

  it('不是固定题目、题数不符时不能编码', () => {
    const set = tpl('ivChord', 5);
    expect(() => encodeResult(input({ ...set, seed: undefined }))).toThrow();
    expect(() => encodeResult({ ...input(set), results: input(set).results.slice(1) })).toThrow();
  });

  it('改动、截断、换组合都作废', () => {
    const set = tpl('grade', 20);
    const code = encodeResult(input(set, [1]));
    expect(decodeResult(code)).not.toBeNull();
    // 逐字符改动
    for (let i = 0; i < code.length; i += 3) {
      const ch = code[i] === 'A' ? 'B' : 'A';
      expect(decodeResult(code.slice(0, i) + ch + code.slice(i + 1))).toBeNull();
    }
    // 截断
    for (const n of [1, 5, 20, code.length - 1]) expect(decodeResult(code.slice(0, n))).toBeNull();
    // 换成另一份作业的组合段
    const other = encodeSet({ ...set, seed: 7 });
    expect(decodeResult(`${code.split('.')[0]}.${other}`)).toBeNull();
    // 不固定题目的组合
    const [head] = encodeResult(input(set)).split('.');
    expect(decodeResult(`${head}.${encodeSet({ ...set, seed: undefined })}`)).toBeNull();
  });

  it('校验正确但内容自相矛盾时也作废', () => {
    const code = encodeResult(input(tpl('grade', 20), [1], [3]));
    expect(decodeResult(reseal(code, (f) => f))).not.toBeNull();
    const bad: ((f: string[]) => string[])[] = [
      (f) => ((f[0] = '2'), f), // 版本
      (f) => ((f[2] = '19'), f), // 题数与组合不符
      (f) => ((f[5] = '20'), f), // 得分与位图不符
      (f) => ((f[3] = f[3] + '0'), f), // 位图长度
      (f) => ((f[3] = 'zzzzz'), f),
      (f) => ((f[4] = '3:3/4'), f), // 多步题与位图不符（第 3 题整题答对）
      (f) => ((f[4] = '3:5/4'), f),
      (f) => ((f[4] = '20:4/4'), f), // 题号越界
      (f) => ((f[4] = '3:4/4,3:4/4'), f), // 重复
      (f) => ((f[6] = '-1'), f),
      (f) => ((f[7] = 'abc'), f),
      (f) => ((f[8] = '<script>'), f),
      (f) => ((f[9] = 'a\u0000b'), f), // 姓名未清理
      (f) => ((f[9] = 'x'.repeat(21)), f),
      (f) => f.slice(0, 9), // 字段不够
    ];
    for (const edit of bad) expect(decodeResult(reseal(code, edit))).toBeNull();
    // 位图末尾多余的位
    const five = encodeResult(input(tpl('ivChord', 5)));
    expect(decodeResult(reseal(five, (f) => ((f[3] = 'ff'), f)))).toBeNull();
  });

  it('任意输入都不抛异常', () => {
    const r = mulberry32(3);
    const alphabet = 'ABCxyz019-_.|';
    for (let i = 0; i < 500; i++) {
      const s = Array.from({ length: Math.floor(r() * 80) }, () => alphabet[Math.floor(r() * alphabet.length)]).join('');
      expect(() => decodeResult(s)).not.toThrow();
    }
    expect(decodeResult('')).toBeNull();
    expect(decodeResult('.')).toBeNull();
    expect(decodeResult('x'.repeat(10000))).toBeNull();
    expect(decodeResult(undefined as unknown as string)).toBeNull();
  });

  it('网址读取', () => {
    const set = tpl('ivChord', 5);
    const url = resultUrl(input(set), 'https://x.io/earforge/');
    expect(url.startsWith('https://x.io/earforge/#r=')).toBe(true);
    expect(hasResult(url)).toBe(true);
    expect(hasResult('https://x.io/#s=abc')).toBe(false);
    expect(readResult(url)!.score).toBe(5);
    expect(readResult('https://x.io/#r=broken')).toBeNull();
    expect(readResult('https://x.io/')).toBeNull();
  });
});

describe('每题的练习与考点（老师端重现）', () => {
  it('与学生 SetRun 的题源、实际出的题一致', () => {
    for (const t of SET_TEMPLATES) {
      const shared = tpl(t.id, 20);
      // 学生：本地组合（toPracticeSet）+ SetRun 的同一构造
      const local = toPracticeSet(shared);
      const student = seededSource(setSource(local, mulberry32(local.seed!)), local.seed!);
      const seen: { ex: string; item: string; qItem: string }[] = [];
      for (let d = student.next(); d; d = student.next()) {
        // 学生自己的设置（固定 C 调、高音区）出题时被统一设置覆盖
        const user = { ...DEFAULT_SETTINGS, keyMode: 'C' as const, voice: 'high' as const };
        const settings = { ...user, ...SEEDED_GEN_SETTINGS };
        const q = withSeed(d.seed, () => d.ex.generate(d.item, { settings, items: d.items, options: d.options }));
        seen.push({ ex: d.ex.id, item: d.item, qItem: q.item });
      }
      // 老师：只从成绩链接解码出的组合推出
      const r = decodeResult(encodeResult(input(shared)))!;
      const draws = resultDraws(r.set);
      expect(draws.map((d) => [d.ex, d.item])).toEqual(seen.map((s) => [s.ex, s.item]));
      // 题目的考点（成绩里记录的 QuizResult.item）就是推出的考点
      expect(seen.every((s) => s.qItem === s.item)).toBe(true);
      for (const d of draws) expect(exerciseById[d.ex].itemLabel(d.item, DEFAULT_SETTINGS)).toBeTruthy();
    }
  });

  it('不固定题目时为空', () => {
    expect(resultDraws({ ...tpl('ivChord', 5), seed: undefined })).toEqual([]);
  });
});
