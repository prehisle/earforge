// 音频排程的时间基准：用记录型的假 AudioContext 把每个声源的 start/stop 时刻、每个 AudioParam 的自动化
// 都记下来，与快照比对。快照是在改成「边播边排程」之前用一次性排程生成的，锁住所有发声时刻不变
// （节奏练习的示范、预备拍与敲击判定共用 play() 的零点：调用时的 currentTime + 0.05）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteEvent, Timbre } from '../audio/engine';

type Rec = { kind: string; at?: number; info: string; created: number; started?: number; stopped?: number };

let ctxs: RecContext[] = [];
let resumeGate: (() => void) | null = null;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

class RecContext {
  state: AudioContextState = 'running';
  currentTime = 10; // 不从 0 开始：确认排程以调用时的 currentTime 为零点
  sampleRate = 48000;
  destination = {};
  recs: Rec[] = [];
  constructor() {
    ctxs.push(this);
  }
  resume() {
    return new Promise<void>((r) => {
      resumeGate = () => {
        this.state = 'running';
        r();
      };
    });
  }
  private param(owner: Rec, name: string) {
    const ctx = this;
    const log = (op: string) => (v: number, t: number, c?: number) => {
      ctx.recs.push({ kind: `param:${owner.kind}.${name}`, at: r6(t), info: `${op}(${r6(v)}${c === undefined ? '' : `,${r6(c)}`})`, created: ctx.currentTime });
    };
    let value = 0;
    return {
      get value() {
        return value;
      },
      set value(v: number) {
        value = v;
        owner.info += ` ${name}=${r6(v)}`;
      },
      setValueAtTime: log('set'),
      linearRampToValueAtTime: log('lin'),
      exponentialRampToValueAtTime: log('exp'),
      setTargetAtTime: log('target'),
    };
  }
  private node(kind: string) {
    const rec: Rec = { kind, info: '', created: this.currentTime };
    this.recs.push(rec);
    const n: Record<string, unknown> = {
      rec,
      connect: (x: unknown) => x,
      disconnect() {},
      set type(v: string) {
        rec.info += ` type=${v}`;
      },
      set buffer(b: { length: number } | null) {
        rec.info += ` buffer=${b?.length ?? 0}`;
      },
      set loop(v: boolean) {
        rec.info += ` loop=${v}`;
      },
      set curve(_c: unknown) {},
      onended: null,
    };
    for (const p of ['gain', 'frequency', 'detune', 'Q', 'playbackRate', 'threshold', 'ratio']) n[p] = this.param(rec, p);
    return { n, rec };
  }
  private source(kind: string) {
    const { n, rec } = this.node(kind);
    n.start = (t = 0, off?: number) => {
      rec.started = r6(t);
      if (off !== undefined) rec.info += ' offset';
    };
    n.stop = (t?: number) => {
      // stopAll 不带参数立即停止：记为 -1
      rec.stopped = t === undefined ? -1 : r6(t);
    };
    return n;
  }
  createGain = () => this.node('gain').n;
  createDynamicsCompressor = () => this.node('comp').n;
  createWaveShaper = () => this.node('shaper').n;
  createBiquadFilter = () => this.node('biquad').n;
  createOscillator = () => this.source('osc');
  createBufferSource = () => this.source('bufsrc');
  createBuffer = (_c: number, len: number) => ({ length: len, duration: len / this.sampleRate, getChannelData: () => new Float32Array(len) });
}

async function freshEngine() {
  vi.resetModules();
  return (await import('../audio/engine')).audio;
}

/** 推进音频时钟与定时器，直到排程全部完成（同步排程时什么也不做） */
function drain(ctx: RecContext, seconds = 12) {
  for (let i = 0; i < seconds * 40; i++) {
    ctx.currentTime += 0.025;
    vi.advanceTimersByTime(25);
  }
}

/** 一次播放产生的全部记录（去掉总线），按时间与内容排序后可与快照比较 */
function timeline(ctx: RecContext, from: number) {
  return ctx.recs
    .slice(from)
    .filter((r) => !['comp', 'shaper'].includes(r.kind))
    .map((r) => `${r.kind}${r.at === undefined ? '' : ` @${r.at}`}${r.started === undefined ? '' : ` start=${r.started}`}${r.stopped === undefined ? '' : ` stop=${r.stopped}`}${r.info}`)
    .sort();
}

const MELODY: NoteEvent[] = [
  { notes: [60], time: 0, dur: 0.5 },
  { notes: [64], time: 0.5, dur: 0.25, velocity: 0.9 },
  { notes: [67], time: 0.75, dur: 0.25 },
  { notes: [72], time: 1, dur: 1.2, velocity: 0.4 },
];
const CHORDS: NoteEvent[] = [
  { notes: [48, 60, 64, 67], time: 0, dur: 0.8 },
  { notes: [53, 60, 65, 69], time: 0.8, dur: 0.8 },
  { notes: [55, 59, 62, 67], time: 1.6, dur: 0.8 },
  { notes: [48, 60, 64, 67], time: 2.4, dur: 1.2 },
];
const RHYTHM: NoteEvent[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ kind: 'click' as const, notes: [], time: i * 0.5, dur: 0.05, accent: i % 4 === 0, velocity: i < 4 ? 0.9 : 0.3 })),
  { kind: 'perc', notes: [], time: 0, dur: 0.5 },
  { kind: 'perc', notes: [], time: 0.5, dur: 0.25 },
  { kind: 'perc', notes: [], time: 0.75, dur: 0.25 },
  { kind: 'perc', notes: [], time: 1, dur: 1 },
  { kind: 'perc', notes: [], time: 3.25, dur: 0.75 },
];

const CASES: [string, Timbre, NoteEvent[]][] = [
  ['钢琴旋律', 'piano', MELODY],
  ['钢琴和弦进行', 'piano', CHORDS],
  ['吉他扫弦', 'guitar', CHORDS],
  ['风琴', 'organ', MELODY],
  ['弦乐', 'strings', CHORDS],
  ['长笛', 'flute', MELODY],
  ['马林巴', 'marimba', MELODY],
  ['节奏型与节拍器', 'piano', RHYTHM],
];

describe('排程时间基准（快照）', () => {
  beforeEach(() => {
    ctxs = [];
    resumeGate = null;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.stubGlobal('AudioContext', RecContext);
    // 气声的随机起点：固定下来便于比较
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const [name, timbre, events] of CASES)
    it(name, async () => {
      const audio = await freshEngine();
      audio.warmUp();
      const ctx = ctxs[0];
      const from = ctx.recs.length;
      const dur = await audio.play(events, timbre);
      drain(ctx);
      expect(dur).toMatchSnapshot('时长');
      expect(timeline(ctx, from)).toMatchSnapshot();
    });

  it('采样吉他扫弦（采样已就绪）', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const audio = await freshEngine();
    audio.warmUp();
    const ctx = ctxs[0];
    (ctx as unknown as { decodeAudioData: () => Promise<unknown> }).decodeAudioData = async () => ({ length: 96000, duration: 2 });
    expect(await audio.loadSampler('sampled-guitar')).toBe(true);
    const from = ctx.recs.length;
    const dur = await audio.play(CHORDS, 'sampled-guitar');
    drain(ctx);
    expect(dur).toBeCloseTo(3.6, 9);
    expect(timeline(ctx, from)).toMatchSnapshot();
  });

  it('零点为调用时的 currentTime + 0.05（节奏练习的敲击判定依赖它）', async () => {
    const audio = await freshEngine();
    audio.warmUp();
    const ctx = ctxs[0];
    ctx.currentTime = 123.4;
    const t0 = ctx.currentTime + 0.05;
    void audio.play([{ kind: 'click', notes: [], time: 0.5, dur: 0.05 }]);
    await Promise.resolve();
    await Promise.resolve();
    drain(ctx);
    const osc = ctx.recs.find((r) => r.kind === 'osc')!;
    expect(osc.started).toBeCloseTo(t0 + 0.5, 9);
  });
});
