import { describe, expect, it } from 'vitest';
import { activeItems, levelsOf } from '../engine/progress';
import { planModules } from '../engine/planner';
import { DEFAULT_SETTINGS, type NotateNote } from '../engine/types';
import { EXERCISES } from '../exercises';
import { gradeDictation, normalize } from '../exercises/notateGrade';
import {
  COMPOUND_CELLS,
  R_TIERS,
  SIMPLE_CELLS,
  makePhrase,
  makeRhythm,
  meterBar,
  parseItem,
  pitchPool,
  rhythmDictation,
  seeded,
  type RTier,
} from '../exercises/rhythmDictation';
import { MAJOR, MODES, modeById, mod } from '../music/theory';
import { curDur, editorReducer, initialEditor, keyAction, type EditorAction, type EditorState } from '../ui/notateEditor';

const sum = (xs: number[]) => xs.reduce((a, b) => a + Math.abs(b), 0);
const N = (rel: number | null, dur: number): NotateNote => ({ rel, dur });

describe('节奏旋律听写：节奏', () => {
  const meters: [number, number][] = [
    [2, 4],
    [3, 4],
    [4, 4],
  ];

  it('每段的总时值等于小节数 × 小节长度，结束音落在拍上、写到末尾', () => {
    const rng = seeded(1);
    for (const rt of R_TIERS)
      for (const m of rt === 'c68' ? [[6, 8] as [number, number]] : meters)
        for (const bars of [1, 2, 4])
          for (let k = 0; k < 30; k++) {
            const { durs } = makeRhythm(rt, m, bars, rng);
            expect(sum(durs)).toBe(meterBar(m) * bars);
            const last = durs[durs.length - 1];
            expect(last).toBeGreaterThan(0);
            const beat = m[1] === 8 ? 18 : 12;
            expect(last % beat).toBe(0);
            expect((sum(durs) - last) % beat).toBe(0);
            expect(durs[0]).toBeGreaterThan(0);
          }
  });

  it('节奏型不跨小节线（连音线层级除外），且只用到当前层级及以下的时值', () => {
    const rng = seeded(2);
    for (const rt of R_TIERS) {
      const tier = R_TIERS.indexOf(rt);
      const allowed = new Set(
        (rt === 'c68' ? COMPOUND_CELLS : SIMPLE_CELLS.filter((c) => c.tier <= tier)).flatMap((c) => c.durs),
      );
      const m: [number, number] = rt === 'c68' ? [6, 8] : [4, 4];
      for (let k = 0; k < 60; k++) {
        const { durs } = makeRhythm(rt, m, 2, rng);
        const bar = meterBar(m);
        let t = 0;
        for (const d of durs.slice(0, -1)) {
          const crosses = Math.floor(t / bar) !== Math.floor((t + Math.abs(d) - 1) / bar);
          if (rt !== 'syn') {
            expect(crosses).toBe(false);
            expect(allowed.has(d)).toBe(true);
          }
          t += Math.abs(d);
        }
      }
    }
  });

  it('各层级的词汇：四分层没有八分，八分层出现八分，十六分层出现十六分，6/8 用复拍子', () => {
    const rng = seeded(3);
    const seen = (rt: RTier) => {
      const s = new Set<number>();
      for (let k = 0; k < 80; k++) makeRhythm(rt, [4, 4], 2, rng).durs.forEach((d) => s.add(d));
      return s;
    };
    const qh = seen('qh');
    expect([...qh].every((d) => d % 12 === 0 && d > 0)).toBe(true);
    // 第一层不用附点（3/4 也不出附点二分）
    for (let k = 0; k < 80; k++) expect(makeRhythm('qh', [3, 4], 2, rng).durs).not.toContain(36);
    expect(seen('e').has(6)).toBe(true);
    expect(seen('dq').has(18)).toBe(true);
    expect(seen('s').has(3)).toBe(true);
    const p = makePhrase(MAJOR, 'c68', 1, 2, rng);
    expect(p.meter).toEqual([6, 8]);
  });

  it('切分层级会出现跨小节线的连音', () => {
    const rng = seeded(4);
    let tied = 0;
    for (let k = 0; k < 100; k++) {
      const { durs } = makeRhythm('syn', [4, 4], 2, rng);
      let t = 0;
      for (const d of durs) {
        if (d > 0 && t < 48 && t + d > 48) tied++;
        t += Math.abs(d);
      }
    }
    expect(tied).toBeGreaterThan(10);
  });

  it('种子相同则结果相同', () => {
    const a = makePhrase(MAJOR, 's', 2, 4, seeded(42));
    const b = makePhrase(MAJOR, 's', 2, 4, seeded(42));
    expect(a).toEqual(b);
    const c = makePhrase(MAJOR, 's', 2, 4, seeded(43));
    expect(c).not.toEqual(a);
  });
});

describe('节奏旋律听写：音高', () => {
  it('从主三和弦音开始、以 do 结束，音都在音高层级之内，跳进不超过限制', () => {
    const rng = seeded(5);
    for (const mode of MODES)
      for (let pt = 0; pt <= 3; pt++) {
        const pool = pitchPool(mode, pt);
        const all = new Set([...pool.diatonic, ...pool.chromatic]);
        for (let k = 0; k < 40; k++) {
          const p = makePhrase(mode, pt === 3 ? 'e' : 'dq', pt, 2, rng);
          const rels = p.notes.filter((n) => n.rel !== null).map((n) => n.rel!);
          expect([0, mode.scale[2], mode.scale[4]]).toContain(mod(rels[0], 12));
          expect(mod(rels[rels.length - 1], 12)).toBe(0);
          for (const r of rels) expect(all.has(r)).toBe(true);
          for (let i = 1; i < rels.length; i++) expect(Math.abs(rels[i] - rels[i - 1])).toBeLessThanOrEqual(12);
          if (pt <= 1) expect(Math.max(...rels) - Math.min(...rels)).toBeLessThanOrEqual(7);
        }
      }
  });

  it('以级进为主', () => {
    const rng = seeded(6);
    let steps = 0;
    let moves = 0;
    for (let k = 0; k < 200; k++) {
      const rels = makePhrase(MAJOR, 'e', 2, 4, rng)
        .notes.filter((n) => n.rel !== null)
        .map((n) => n.rel!);
      for (let i = 1; i < rels.length; i++) {
        const d = Math.abs(rels[i] - rels[i - 1]);
        moves++;
        if (d <= 2) steps++;
      }
    }
    expect(steps / moves).toBeGreaterThan(0.55);
  });

  it('变化音层级至少用到一个变化音，并半音解决', () => {
    const rng = seeded(7);
    let hit = 0;
    for (let k = 0; k < 100; k++) {
      const pool = pitchPool(MAJOR, 3);
      const rels = makePhrase(MAJOR, 'e', 3, 2, rng)
        .notes.filter((n) => n.rel !== null)
        .map((n) => n.rel!);
      const i = rels.findIndex((r) => pool.chromatic.includes(r));
      if (i >= 0) {
        hit++;
        expect(Math.abs(rels[i + 1] - rels[i])).toBeLessThanOrEqual(2);
      }
    }
    expect(hit).toBeGreaterThan(80);
  });
});

describe('节奏旋律听写：练习定义', () => {
  it('考点 id 与级别', () => {
    expect(parseItem('e.1')).toEqual(['e', 1]);
    expect(parseItem('minor:c68.2')).toEqual(['c68', 2]);
    const levels = levelsOf(rhythmDictation, { mode: 'minor' });
    expect(levels.length).toBe(9);
    expect(levels[0].items).toEqual(['minor:qh.0']);
    expect(rhythmDictation.levels.flatMap((l) => l.items)).toContain('syn.2');
  });

  it('每个级别、每个考点出的题：音符时值总和正确，题目是一步作答，进今日训练', () => {
    for (const lv of rhythmDictation.levels.keys()) {
      const p = { level: lv, custom: null, items: {}, options: { mode: 'major', bars: '2', speed: 'slow', countIn: 'on' } };
      const items = activeItems(rhythmDictation, p);
      for (const item of items)
        for (let k = 0; k < 10; k++) {
          const q = rhythmDictation.generate(item, { settings: DEFAULT_SETTINGS, items, options: p.options });
          const spec = q.notate!;
          const bars = spec.meter[0] === 2 && spec.meter[1] === 4 ? 4 : 2;
          expect(sum(spec.notes.map((n) => n.dur))).toBe(meterBar(spec.meter) * bars);
          expect(q.answer).toEqual(['notate']);
          expect(q.choices).toEqual([]);
          expect(q.events.length).toBeGreaterThan(spec.meter[0]);
          expect(spec.tonic).toBeGreaterThanOrEqual(60);
          // 自己的答案判为全对
          expect(gradeDictation(spec.notes, spec.notes).allRight).toBe(true);
        }
    }
    expect(planModules({ exercises: { rhythmDictation: { level: 0, custom: null, items: { 'qh.0': { n: 1, c: 1, acc: 1, last: 0 } }, options: {} } } } as never, EXERCISES).map((e) => e.id)).toContain(
      'rhythmDictation',
    );
  });

  it('关掉预备拍就没有节拍器声', () => {
    const q = rhythmDictation.generate('e.1', {
      settings: DEFAULT_SETTINGS,
      items: ['e.1'],
      options: { mode: 'major', bars: '1', speed: 'mid', countIn: 'off' },
    });
    expect(q.events.some((e) => e.kind === 'click')).toBe(false);
    expect(modeById(q.notate!.mode)).toBe(MAJOR);
  });
});

describe('节奏旋律听写：判定（按起音对齐）', () => {
  const ref = [N(0, 12), N(2, 12), N(4, 24), N(5, 6), N(4, 6), N(2, 12), N(0, 24)];

  it('完全一致为全对', () => {
    const g = gradeDictation(ref, ref);
    expect(g.allRight).toBe(true);
    expect(g.pitch).toEqual({ ok: 7, n: 7 });
    expect(g.rhythm).toEqual({ ok: 7, n: 7 });
  });

  it('一个时值写错，后面的音不受影响', () => {
    const user = ref.map((n, i) => (i === 1 ? N(2, 6) : n));
    const g = gradeDictation(ref, user);
    expect(g.allRight).toBe(false);
    expect(g.pitch).toEqual({ ok: 7, n: 7 });
    expect(g.rhythm).toEqual({ ok: 6, n: 7 });
    expect(g.ref.map((r) => r.rhythm)).toEqual([true, false, true, true, true, true, true]);
    expect(g.user.filter((x) => !x).length).toBe(1);
  });

  it('一个音高写错只扣音高', () => {
    const user = ref.map((n, i) => (i === 3 ? N(7, 6) : n));
    const g = gradeDictation(ref, user);
    expect(g.pitch.ok).toBe(6);
    expect(g.rhythm.ok).toBe(7);
    expect(g.ref[3]).toMatchObject({ pitch: false, rhythm: true, match: 3 });
  });

  it('漏写一个音：只有这个音算错', () => {
    const user = ref.filter((_, i) => i !== 2);
    const g = gradeDictation(ref, user);
    expect(g.ref[2].match).toBeNull();
    expect(g.pitch.ok).toBe(6);
    expect(g.rhythm.ok).toBe(6);
    expect(g.extras).toBe(0);
    expect(g.ref.filter((_, i) => i !== 2).every((r) => r.pitch && r.rhythm)).toBe(true);
  });

  it('多写一个音：其他音都对，记为多写', () => {
    const user = [...ref.slice(0, 3), N(7, 6), ...ref.slice(3)];
    const g = gradeDictation(ref, user);
    expect(g.extras).toBe(1);
    expect(g.pitch.ok).toBe(7);
    expect(g.rhythm.ok).toBe(7);
    expect(g.allRight).toBe(false);
    expect(g.user[3]).toBe(false);
  });

  it('二分音符写成两个四分：配对第一个（起音相同），第二个是多写', () => {
    const g = gradeDictation([N(0, 24), N(2, 24)], [N(0, 12), N(0, 12), N(2, 24)]);
    expect(g.ref[0]).toMatchObject({ pitch: true, rhythm: false, match: 0 });
    expect(g.ref[1]).toMatchObject({ pitch: true, rhythm: true, match: 2 });
    expect(g.extras).toBe(1);
    expect(g.user).toEqual([false, false, true]);
  });

  it('连音线：连起来的长音与分开写的两个音不同；同一个长音的不同写法相同', () => {
    const tied = [N(0, 12), N(4, 18), N(2, 6), N(0, 12)];
    // 拆成四分 + 八分（没加连音线）：节奏错一个、多写一个
    const split = gradeDictation(tied, [N(0, 12), N(4, 12), N(4, 6), N(2, 6), N(0, 12)]);
    expect(split.allRight).toBe(false);
    expect(split.rhythm.ok).toBe(3);
    expect(split.extras).toBe(1);
    // 编辑器里「四分 + 延音线八分」得到的就是 18
    let s = initialEditor();
    const run = (...as: EditorAction[]) => as.forEach((a) => (s = editorReducer(s, a)));
    run({ type: 'degree', semis: 0 }, { type: 'degree', semis: 4 }, { type: 'base', base: 6 }, { type: 'tie' });
    run({ type: 'degree', semis: 2 }, { type: 'base', base: 12 }, { type: 'degree', semis: 0 });
    expect(gradeDictation(tied, s.notes).allRight).toBe(true);
  });

  it('休止：相邻休止合并；漏掉休止只扣节奏', () => {
    expect(normalize([N(0, 12), N(null, 6), N(null, 6), N(2, 12)])).toEqual([N(0, 12), N(null, 12), N(2, 12)]);
    const r = [N(0, 12), N(null, 12), N(2, 24)];
    expect(gradeDictation(r, [N(0, 12), N(null, 6), N(null, 6), N(2, 24)]).allRight).toBe(true);
    const g = gradeDictation(r, [N(0, 24), N(2, 24)]);
    expect(g.pitch).toEqual({ ok: 2, n: 2 });
    expect(g.rhythm.ok).toBe(1);
  });

  it('写错八度算音高错', () => {
    const g = gradeDictation([N(0, 12), N(7, 12)], [N(0, 12), N(-5, 12)]);
    expect(g.ref[1]).toMatchObject({ pitch: false, rhythm: true });
  });

  it('什么都没写', () => {
    const g = gradeDictation(ref, []);
    expect(g.pitch.ok).toBe(0);
    expect(g.rhythm.ok).toBe(0);
    expect(g.allRight).toBe(false);
  });
});

describe('记谱面板的编辑状态', () => {
  const apply = (s: EditorState, ...as: EditorAction[]) => as.reduce(editorReducer, s);

  it('时值、附点、八度、升降号', () => {
    let s = initialEditor();
    expect(curDur(s)).toBe(12);
    s = apply(s, { type: 'dot' });
    expect(curDur(s)).toBe(18);
    s = apply(s, { type: 'degree', semis: 0 }, { type: 'base', base: 6 }, { type: 'degree', semis: 2 });
    expect(s.notes).toEqual([N(0, 18), N(2, 6)]);
    // 十六分不能加附点
    s = apply(s, { type: 'base', base: 3 }, { type: 'dot' });
    expect(curDur(s)).toBe(3);
    s = apply(s, { type: 'octave', delta: -1 }, { type: 'degree', semis: 7 });
    expect(s.notes[2]).toEqual(N(-5, 3));
    s = apply(s, { type: 'octave', delta: -1 });
    expect(s.octave).toBe(-1);
    s = apply(s, { type: 'octave', delta: 2 }, { type: 'acc', acc: 1 }, { type: 'base', base: 24 }, { type: 'degree', semis: 5 });
    expect(s.notes[3]).toEqual(N(18, 24));
    expect(s.acc).toBe(0);
  });

  it('休止、延音线、退格、撤销、清空', () => {
    let s = apply(initialEditor(), { type: 'tie' });
    expect(s.notes).toEqual([]);
    s = apply(s, { type: 'degree', semis: 4 }, { type: 'rest' }, { type: 'degree', semis: 2 }, { type: 'base', base: 6 }, { type: 'tie' });
    expect(s.notes).toEqual([N(4, 12), N(null, 12), N(2, 18)]);
    s = apply(s, { type: 'back' });
    expect(s.notes).toEqual([N(4, 12), N(null, 12)]);
    s = apply(s, { type: 'undo' });
    expect(s.notes).toEqual([N(4, 12), N(null, 12), N(2, 18)]);
    s = apply(s, { type: 'undo' });
    expect(s.notes).toEqual([N(4, 12), N(null, 12), N(2, 12)]);
    s = apply(s, { type: 'clear' });
    expect(s.notes).toEqual([]);
    s = apply(s, { type: 'undo' });
    expect(s.notes.length).toBe(3);
  });

  it('MIDI 输入按绝对音高写入并切换八度', () => {
    const s = apply(initialEditor(), { type: 'note', rel: -3 });
    expect(s.notes).toEqual([N(-3, 12)]);
    expect(s.octave).toBe(-1);
  });

  it('键盘映射', () => {
    const scale = MAJOR.scale;
    expect(keyAction({ key: '5' }, scale)).toEqual({ type: 'degree', semis: 7 });
    expect(keyAction({ key: 'e' }, scale)).toEqual({ type: 'base', base: 6 });
    expect(keyAction({ key: 'Q' }, scale)).toEqual({ type: 'base', base: 12 });
    expect(keyAction({ key: '.' }, scale)).toEqual({ type: 'dot' });
    expect(keyAction({ key: '0' }, scale)).toEqual({ type: 'rest' });
    expect(keyAction({ key: 'z', ctrlKey: true }, scale)).toEqual({ type: 'undo' });
    expect(keyAction({ key: 'ArrowUp' }, scale)).toEqual({ type: 'octave', delta: 1 });
    expect(keyAction({ key: '8' }, scale)).toBeNull();
    expect(keyAction({ key: 'c', ctrlKey: true }, scale)).toBeNull();
  });
});
