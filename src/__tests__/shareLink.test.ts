import { describe, expect, it, vi } from 'vitest';
import { levelsOf } from '../engine/progress';
import { mulberry32 } from '../engine/seeded';
import {
  CODES,
  MAX_CODE,
  MAX_ITEMS,
  MAX_NAME,
  MAX_PARTS,
  cleanSet,
  decodeSet,
  encodeSet,
  hasSharedSet,
  readSharedSet,
  sealText,
  shareUrl,
  toPracticeSet,
  type SharedSet,
} from '../engine/shareLink';
import type { SetPart } from '../engine/practiceSet';
import { EXERCISES, exerciseById } from '../exercises';

const bytesB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64 = (s: string) => bytesB64(new TextEncoder().encode(s));
const unB64 = (c: string) => new TextDecoder().decode(Uint8Array.from(atob(c.replace(/-/g, '+').replace(/_/g, '/')), (x) => x.charCodeAt(0)));

/** 随机组合：随机选练习、选项与考点子集 */
function randomSet(r: () => number): SharedSet {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const parts: SetPart[] = Array.from({ length: 1 + Math.floor(r() * 4) }, () => {
    const ex = pick(EXERCISES);
    const options: Record<string, string> = {};
    for (const o of ex.options ?? []) if (r() < 0.5) options[o.id] = pick(o.values).id;
    const all = [...new Set(levelsOf(ex, { ...Object.fromEntries((ex.options ?? []).map((o) => [o.id, o.default])), ...options }).flatMap((l) => l.items))];
    const items = all.filter(() => r() < 0.5);
    const part: SetPart = { ex: ex.id, items: items.length ? items : [all[0]], options };
    if (r() < 0.2) part.weight = 1 + Math.floor(r() * 4);
    return part;
  });
  const names = ['', '期中复习', 'Week 3 | intervals ~;,=', '😀 和弦 & <b>x</b>', 'a'.repeat(40)];
  const set: SharedSet = { name: pick(names), parts, count: 1 + Math.floor(r() * 50) };
  if (r() < 0.5) set.seed = Math.floor(r() * 0x100000000);
  return set;
}

/** 与 cleanSet 一致的规范形式（默认值的选项去掉，便于比较） */
function canon(s: SharedSet) {
  return {
    ...s,
    parts: s.parts.map((p) => {
      const ex = exerciseById[p.ex];
      const options = Object.fromEntries(Object.entries(p.options).filter(([k, v]) => ex.options?.find((o) => o.id === k)?.default !== v));
      const out: SetPart = { ...p, options };
      if (out.weight === 1) delete out.weight;
      return out;
    }),
  };
}

const SAMPLE: SharedSet = {
  name: '期中复习',
  count: 20,
  seed: 3141592653,
  parts: [
    { ex: 'intervals', items: ['m3', 'M3', 'P4', 'P5', 'm6', 'M6'], options: { dir: 'harm' } },
    { ex: 'chords', items: ['maj', 'min', 'dim', 'aug'], options: {} },
    { ex: 'degrees', items: ['minor:d0', 'minor:d2', 'minor:d3', 'minor:d5', 'minor:d7'], options: { mode: 'minor' } },
  ],
};

describe('分享码', () => {
  it('所有练习都有固定的短代号，且代号与 id 不冲突、分隔符不出现在 id 里', () => {
    for (const ex of EXERCISES) {
      expect(CODES[ex.id], ex.id).toBeTruthy();
      expect(exerciseById[CODES[ex.id]]).toBeUndefined();
      const ids = [ex.id, ...(ex.options ?? []).flatMap((o) => [o.id, ...o.values.map((v) => v.id)])];
      for (const o of [{}, ...(ex.options ?? []).flatMap((o) => o.values.map((v) => ({ [o.id]: v.id })))])
        ids.push(...levelsOf(ex, o).flatMap((l) => l.items));
      for (const id of ids) expect(id, `${ex.id}: ${id}`).not.toMatch(/[|;~,=]/);
    }
    expect(new Set(Object.values(CODES)).size).toBe(Object.keys(CODES).length);
  });

  it('往返：随机组合编码再解码不变', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const set = randomSet(r);
      const expected = cleanSet(set)!;
      const back = decodeSet(encodeSet(set));
      expect(back, JSON.stringify(set)).toEqual(expected);
      expect(canon(back!)).toEqual(canon({ ...set, name: expected.name }));
    }
  });

  it('网址很短：三个练习的组合', () => {
    const url = shareUrl(SAMPLE, 'https://someone.github.io/earforge/');
    console.log(`分享网址 ${url.length} 字符：${url}`);
    expect(url.length).toBeLessThan(200);
    expect(url.startsWith('https://someone.github.io/earforge/#s=')).toBe(true);
    expect(readSharedSet(url)).toEqual(SAMPLE);
  });

  it('默认基址是 origin + BASE_URL', () => {
    vi.stubGlobal('location', { origin: 'https://example.org' });
    try {
      const url = shareUrl(SAMPLE);
      expect(url.startsWith(`https://example.org${import.meta.env.BASE_URL}#s=`)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('readSharedSet：子路径、其他 hash 参数、没有 hash', () => {
    const code = encodeSet(SAMPLE);
    expect(readSharedSet(`https://x.io/earforge/#s=${code}`)).toEqual(SAMPLE);
    expect(readSharedSet(`https://x.io/earforge/?a=1#x=2&s=${code}`)).toEqual(SAMPLE);
    expect(readSharedSet(`https://x.io/earforge/?s=${code}`)).toBeNull();
    expect(readSharedSet('https://x.io/')).toBeNull();
    expect(readSharedSet('https://x.io/#s=')).toBeNull();
    expect(hasSharedSet(`https://x.io/#s=${code}`)).toBe(true);
    expect(hasSharedSet('https://x.io/#s=garbage')).toBe(true);
    expect(hasSharedSet('https://x.io/#top')).toBe(false);
  });

  it('篡改、乱码、超长输入返回 null 而不抛异常', () => {
    const code = encodeSet(SAMPLE);
    const bad = [
      '',
      '!!!!',
      'a',
      'abcde',
      '%%%',
      code.slice(0, -7),
      `${code}x`,
      b64('2|0000|20||iv~m3|x'), // 版本不对
      b64('1|0000|20||iv~m3|x'), // 校验不对
      sealText('20||iv~m3'), // 字段不够
      sealText('abc||iv~m3|x'), // 题数不是数字
      sealText('20|ZZ|iv~m3|x'), // seed 非法
      sealText('20|zzzzzzzz|iv~m3|x'), // seed 太大
      sealText('20||zz~m3|x'), // 未知练习
      sealText('20||iv~nope,xx|x'), // 没有有效考点
      sealText('20||__proto__~m3|x'),
      sealText('20||constructor~m3|x'),
      bytesB64(new Uint8Array([0x31, 0x7c, 0xff, 0xfe])), // 非 UTF-8
      'A'.repeat(MAX_CODE + 4),
    ];
    for (const c of bad) {
      expect(() => decodeSet(c)).not.toThrow();
      expect(decodeSet(c), c.slice(0, 40)).toBeNull();
      expect(readSharedSet(`https://x.io/#s=${c}`)).toBeNull();
    }
    // 随机翻转字符：不抛异常，结果要么 null 要么是合法组合
    const r = mulberry32(5);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < 2000; i++) {
      const chars = [...code];
      for (let k = 0; k < 1 + Math.floor(r() * 3); k++) chars[Math.floor(r() * chars.length)] = alphabet[Math.floor(r() * 64)];
      const got = decodeSet(chars.join(''));
      if (got) expect(cleanSet(got)).toEqual(got);
    }
  });

  it('未知练习、考点、选项被丢弃，数量与长度被限制', () => {
    const items = Array.from({ length: 80 }, (_, i) => `x${i}`).concat(['m3', 'M3', 'm3']);
    const text = [
      '999999',
      '',
      ['zz~m3', `iv~${items.join(',')}~dir=harm,bogus=1,mode=minor~2`, 'ch~maj~voicing=nope', 'iv~m3~~-5', 'iv~m3~~1e9'].join(';'),
      `  名字\n<script>alert(1)</script>${'长'.repeat(60)}`,
    ].join('|');
    const got = decodeSet(sealText(text))!;
    expect(got.count).toBe(100);
    expect(got.seed).toBeUndefined();
    expect(got.parts).toEqual([
      { ex: 'intervals', items: ['m3', 'M3'], options: { dir: 'harm' }, weight: 2 },
      { ex: 'chords', items: ['maj'], options: {} },
      { ex: 'intervals', items: ['m3'], options: {} },
      { ex: 'intervals', items: ['m3'], options: {}, weight: 100 },
    ]);
    expect([...got.name].length).toBe(MAX_NAME);
    expect(got.name.startsWith('名字 <script>')).toBe(true); // 名称只按文本显示（React 转义）

    const many = Array.from({ length: 30 }, () => 'iv~m3').join(';');
    expect(decodeSet(sealText(`0||${many}|n`))!.parts.length).toBe(MAX_PARTS);
    expect(decodeSet(sealText(`0||${many}|n`))!.count).toBe(1);
  });

  it('作用域考点（调式）省略前缀后能还原', () => {
    const set: SharedSet = { name: 'x', count: 5, parts: [{ ex: 'progressions', items: ['minor:i', 'minor:bVI'], options: { mode: 'minor' } }] };
    const code = encodeSet(set);
    expect(unB64(code)).toMatch(/^1\|[0-9a-z]{4}\|5\|\|pr~i,bVI~mode=minor\|x$/);
    expect(decodeSet(code)).toEqual(set);
  });

  it('考点上限', () => {
    const ex = EXERCISES.find((e) => e.id === 'intervals')!;
    const all = levelsOf(ex, {}).flatMap((l) => l.items);
    expect(all.length).toBeLessThanOrEqual(MAX_ITEMS);
  });

  it('toPracticeSet 生成新 id 与创建时间，名称为空时用备用名', () => {
    const a = toPracticeSet({ ...SAMPLE, name: '' }, '分享的组合');
    const b = toPracticeSet(SAMPLE);
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe('分享的组合');
    expect(b.seed).toBe(SAMPLE.seed);
    expect(Math.abs(b.created - Date.now())).toBeLessThan(1000);
    expect(toPracticeSet({ ...SAMPLE, seed: undefined }).seed).toBeUndefined();
  });
});
