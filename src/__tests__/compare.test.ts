import { afterEach, describe, expect, it, vi } from 'vitest';
import { midi } from '../audio/midi';
import { levelsOf } from '../engine/progress';
import { DEFAULT_SETTINGS, type ExerciseDef, type Question, type Settings } from '../engine/types';
import { chords } from '../exercises/chords';
import { eventsEnd, resolutionEvents, shiftEvents } from '../exercises/common';
import { degrees, semi } from '../exercises/degrees';
import { dictation } from '../exercises/dictation';
import { intervals } from '../exercises/intervals';
import { progressions } from '../exercises/progressions';
import { rhythm } from '../exercises/rhythm';
import { singing } from '../exercises/singing';
import { MODES, mod } from '../music/theory';

const RANDOM: Settings = { ...DEFAULT_SETTINGS, keyMode: 'random' };

/** 选项的所有取值组合 */
function combos(ex: ExerciseDef): Record<string, string>[] {
  let out: Record<string, string>[] = [{}];
  for (const o of ex.options ?? []) out = out.flatMap((c) => o.values.map((v) => ({ ...c, [o.id]: v.id })));
  return out;
}

/** 每种选项组合下，用全部考点各出若干题 */
function* questions(ex: ExerciseDef, times = 4): Generator<{ q: Question; item: string; options: Record<string, string> }> {
  for (const options of combos(ex)) {
    const items = [...new Set(levelsOf(ex, options).flatMap((l) => l.items))];
    for (const item of items)
      for (let k = 0; k < times; k++) yield { q: ex.generate(item, { settings: RANDOM, items, options }), item, options };
  }
}

const COMPARABLE = [degrees, intervals, chords, progressions, dictation, rhythm];

describe('对比试听 choiceEvents', () => {
  it('每种题型对每一步、每个选项都返回非空事件', () => {
    for (const ex of COMPARABLE)
      for (const { q } of questions(ex, 2)) {
        expect(q.choiceEvents, ex.id).toBeDefined();
        for (let step = 0; step < q.answer.length; step++)
          for (const c of q.choices) {
            const evs = q.choiceEvents!(c.id, step);
            expect(evs.length, `${ex.id} ${c.id}`).toBeGreaterThan(0);
            expect(evs.every((e) => e.dur > 0 && e.time >= 0)).toBe(true);
          }
      }
  });

  it('正确选项与题目本身一致', () => {
    for (const ex of [intervals, chords, progressions, dictation, rhythm])
      for (const { q } of questions(ex))
        for (let step = 0; step < q.answer.length; step++) expect(q.choiceEvents!(q.answer[step], step)).toEqual(q.events);
  });

  it('调内音级：同一个八度的单音，接它到 do 的解决', () => {
    for (const { q, item, options } of questions(degrees)) {
      const note = q.events[0].notes[0];
      const tonic = note - semi(item);
      const mode = MODES.find((m) => m.id === options.mode)!;
      const res = resolutionEvents(note, tonic, mode);
      const expected = res.length > 1 ? [...q.events, ...shiftEvents(res, eventsEnd(q.events) + 0.1)] : q.events;
      expect(q.choiceEvents!(item)).toEqual(expected);
      // 其他选项：同一个八度、同一个调
      for (const c of q.choices) expect(q.choiceEvents!(c.id)[0].notes).toEqual([tonic + semi(c.id)]);
    }
  });

  it('多步题只替换当前这一步', () => {
    for (const ex of [dictation, progressions])
      for (const { q } of questions(ex)) {
        if (q.answer.length < 2) continue;
        const other = q.choices.find((c) => c.id !== q.answer[1])!.id;
        const evs = q.choiceEvents!(other, 1);
        expect(evs.length).toBe(q.events.length);
        evs.forEach((e, i) => (i === 1 ? expect(e).not.toEqual(q.events[i]) : expect(e).toEqual(q.events[i])));
      }
  });

  it('音程：同一个起始音、同一方向', () => {
    for (const { q, options } of questions(intervals)) {
      const a = q.events[0].notes[0];
      for (const c of q.choices) {
        const evs = q.choiceEvents!(c.id);
        expect(evs[0].notes[0]).toBe(a);
        const second = options.dir === 'harm' || evs.length === 1 ? evs[0].notes[1] : evs[1].notes[0];
        const dir = options.dir === 'harm' || evs.length === 1 ? 1 : Math.sign(q.events[1].notes[0] - a);
        expect(dir * (second - a)).toBeGreaterThan(0);
      }
    }
  });

  it('视唱不提供试听与琴键作答', () => {
    const { q } = questions(singing, 1).next().value!;
    expect(q.choiceEvents).toBeUndefined();
    expect(q.midiAnswer).toBeUndefined();
  });
});

describe('MIDI 作答 midiAnswer', () => {
  it('调内音级：按相对主音的音级映射，不区分八度，覆盖不同调', () => {
    const keys = new Set<number>();
    for (const { q, item } of questions(degrees, 6)) {
      const tonic = q.events[0].notes[0] - semi(item);
      keys.add(mod(tonic, 12));
      for (const c of q.choices)
        for (const oct of [-24, -12, 0, 12, 24]) expect(q.midiAnswer!(tonic + semi(c.id) + oct)).toBe(c.id);
      // 不在选项里的音级返回 null
      const ids = new Set(q.choices.map((c) => semi(c.id)));
      for (let d = 0; d < 12; d++) if (!ids.has(d)) expect(q.midiAnswer!(tonic + d + 12)).toBeNull();
    }
    expect(keys.size).toBeGreaterThanOrEqual(6);
  });

  it('旋律听写：第一个音是 do，按音级映射', () => {
    for (const { q } of questions(dictation, 2)) {
      const tonic = q.events[0].notes[0];
      q.answer.forEach((id, i) => {
        const note = q.events[i].notes[0];
        expect(q.midiAnswer!(note)).toBe(id);
        expect(q.midiAnswer!(note + 12)).toBe(id);
        expect(q.midiAnswer!(note - 36)).toBe(id);
      });
      expect(q.midiAnswer!(tonic - 12)).toBe(q.answer[0]);
    }
  });

  it('音程：按第二个音相对第一个音的方向与半音数映射', () => {
    for (const { q, item } of questions(intervals)) {
      const a = q.events[0].notes[0];
      const harm = q.events.length === 1;
      const b = harm ? q.events[0].notes[1] : q.events[1].notes[0];
      expect(q.midiAnswer!(b)).toBe(item);
      expect(q.midiAnswer!(a)).toBeNull(); // 重弹第一个音不算作答
      if (!harm && b !== a) expect(q.midiAnswer!(a - (b - a))).toBeNull(); // 方向弹反
    }
  });

  it('其他题型不支持琴键作答', () => {
    for (const ex of [chords, progressions, rhythm]) expect(questions(ex, 1).next().value!.q.midiAnswer).toBeUndefined();
  });
});

describe('MIDI 输入', () => {
  afterEach(() => {
    midi.disable();
    vi.unstubAllGlobals();
  });

  it('解析 note-on，忽略 note-off 与力度为 0 的 note-on，并跟踪设备插拔', async () => {
    type Input = { name: string; state: string; onmidimessage: ((e: { data: Uint8Array }) => void) | null };
    const inputs = new Map<string, Input>([['a', { name: '测试键盘', state: 'connected', onmidimessage: null }]]);
    const access = { inputs, onstatechange: null as null | (() => void) };
    vi.stubGlobal('navigator', { requestMIDIAccess: () => Promise.resolve(access) });

    await midi.enable();
    expect(midi.status).toEqual({ state: 'ready', devices: ['测试键盘'] });

    const got: [number, number][] = [];
    const off = midi.onNote((n, v) => got.push([n, v]));
    const send = (...b: number[]) => inputs.get('a')!.onmidimessage!({ data: new Uint8Array(b) });
    send(0x90, 60, 127); // 通道 1 note-on
    send(0x93, 64, 64); // 通道 4 note-on
    send(0x80, 60, 0); // note-off
    send(0x90, 62, 0); // 力度 0 = note-off
    send(0xb0, 64, 127); // 踏板
    expect(got).toEqual([
      [60, 1],
      [64, 64 / 127],
    ]);

    // 热插拔：新设备接入、旧设备拔出
    inputs.set('b', { name: '第二个键盘', state: 'connected', onmidimessage: null });
    access.onstatechange!();
    expect(midi.status.devices).toEqual(['测试键盘', '第二个键盘']);
    inputs.get('b')!.onmidimessage!({ data: new Uint8Array([0x90, 72, 100]) });
    expect(got.at(-1)?.[0]).toBe(72);
    inputs.get('a')!.state = 'disconnected';
    access.onstatechange!();
    expect(midi.status.devices).toEqual(['第二个键盘']);

    off();
    send(0x90, 61, 100);
    expect(got.length).toBe(3);
  });
});
