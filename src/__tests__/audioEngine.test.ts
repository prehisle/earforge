// 音频引擎的调度竞态与节点回收：用最小的假 AudioContext 驱动（node 环境没有 Web Audio）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RANDOM_POOL, SYNTH_TIMBRES } from '../audio/timbres';

interface FakeSource {
  started: boolean;
  stopped: boolean;
  disconnected: boolean;
  onended: (() => void) | null;
}

const param = () => ({
  value: 0,
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
  setTargetAtTime() {},
});

let sources: FakeSource[] = [];
let resumeGate: (() => void) | null = null;

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  resume() {
    return new Promise<void>((r) => {
      resumeGate = () => {
        this.state = 'running';
        r();
      };
    });
  }
  private node() {
    return {
      gain: param(),
      frequency: param(),
      detune: param(),
      Q: param(),
      playbackRate: param(),
      threshold: param(),
      ratio: param(),
      type: '',
      buffer: null,
      connect: (x: unknown) => x,
      disconnect() {},
    };
  }
  private source() {
    const s: FakeSource & Record<string, unknown> = {
      ...this.node(),
      started: false,
      stopped: false,
      disconnected: false,
      onended: null,
      start() {
        s.started = true;
      },
      stop() {
        s.stopped = true;
      },
      disconnect() {
        s.disconnected = true;
      },
    };
    sources.push(s);
    return s;
  }
  createGain = () => this.node();
  createDynamicsCompressor = () => this.node();
  createWaveShaper = () => this.node();
  createBiquadFilter = () => this.node();
  createOscillator = () => this.source();
  createBufferSource = () => this.source();
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
}

const NOTE = [{ notes: [60], time: 0, dur: 0.5 }];

async function freshEngine() {
  vi.resetModules();
  return (await import('../audio/engine')).audio;
}

describe('音频引擎', () => {
  beforeEach(() => {
    sources = [];
    resumeGate = null;
    vi.stubGlobal('AudioContext', FakeContext);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('等待恢复上下文期间调用 stopAll（如离开页面）：这次播放不再发声', async () => {
    const audio = await freshEngine();
    const p = audio.play(NOTE);
    audio.stopAll();
    resumeGate?.();
    expect(await p).toBe(0);
    expect(sources.filter((s) => s.started)).toHaveLength(0);
  });

  it('等待期间又调用 play：只安排最后一次', async () => {
    const audio = await freshEngine();
    const a = audio.play(NOTE);
    const gateA = resumeGate;
    const b = audio.play([{ notes: [72], time: 0, dur: 2 }]);
    gateA?.();
    resumeGate?.();
    expect(await a).toBe(0);
    expect(await b).toBe(2);
    expect(sources.some((s) => s.started)).toBe(true);
  });

  it('上下文已在运行时正常播放，playExtra 不被前面的 play 取消', async () => {
    const audio = await freshEngine();
    const first = audio.play(NOTE);
    resumeGate?.();
    expect(await first).toBe(0.5);
    const n = sources.length;
    expect(await audio.playExtra(NOTE)).toBe(0.5);
    expect(sources.length).toBeGreaterThan(n);
  });

  it('采样钢琴：一个文件下载失败后，其余文件的进度不会把「失败」改回「加载中」', async () => {
    let release: () => void = () => {};
    const later = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData = async () => ({});
      },
    );
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('C2.mp3')) return { ok: false, status: 404, url };
      await later;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audio = await freshEngine();
    expect(await audio.loadSampler()).toBe(false);
    expect(audio.sampler.state).toBe('error');
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(audio.sampler.state).toBe('error');
  });

  it('每种合成音色都能播放四音和弦', async () => {
    const audio = await freshEngine();
    for (const timbre of SYNTH_TIMBRES) {
      audio.timbre = timbre;
      sources = [];
      const p = audio.play([{ notes: [48, 60, 64, 67], time: 0, dur: 1 }]);
      resumeGate?.();
      expect(await p, timbre).toBe(1);
      expect(sources.filter((s) => s.started).length, timbre).toBeGreaterThanOrEqual(4);
    }
  });

  it('节奏音与节拍器不随音色变化', async () => {
    const audio = await freshEngine();
    const RHYTHM = [
      { notes: [], time: 0, dur: 0.5, kind: 'perc' as const },
      { notes: [], time: 0.5, dur: 0.1, kind: 'click' as const, accent: true },
    ];
    const counts = [];
    for (const timbre of ['piano', 'guitar', 'strings', 'random'] as const) {
      audio.timbre = timbre;
      sources = [];
      const p = audio.play(RHYTHM);
      resumeGate?.();
      await p;
      counts.push(sources.length);
    }
    expect(new Set(counts).size).toBe(1);
  });

  it('随机音色：每题换一种离线乐器，不是随机模式时不变', async () => {
    const audio = await freshEngine();
    audio.timbre = 'organ';
    expect(audio.newQuestion()).toBeNull();
    expect(audio.current).toBe('organ');
    audio.timbre = 'random';
    let prev = audio.current;
    for (let i = 0; i < 50; i++) {
      const t = audio.newQuestion();
      expect(t).not.toBeNull();
      expect(t).not.toBe(prev);
      expect(audio.current).toBe(t);
      expect(RANDOM_POOL).toContain(t);
      prev = t!;
    }
  });

  it('指定乐器播放（考试回顾重放当时的乐器）：用指定的乐器，不改本题抽到的音色', async () => {
    const audio = await freshEngine();
    const count = async (p: Promise<number>) => {
      resumeGate?.();
      await p;
      const n = sources.length;
      sources = [];
      return n;
    };
    audio.timbre = 'guitar';
    const guitar = await count(audio.play(NOTE));
    audio.timbre = 'organ';
    const organ = await count(audio.play(NOTE));
    expect(guitar).not.toBe(organ);
    expect(await count(audio.play(NOTE, 'guitar'))).toBe(guitar);
    expect(await count(audio.playExtra(NOTE, 'guitar'))).toBe(guitar);
    expect(audio.current).toBe('organ');
  });

  it('未下载的采样乐器：先用同类合成音色发声并开始下载', async () => {
    const urls: string[] = [];
    vi.stubGlobal('OfflineAudioContext', class {});
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return new Promise(() => {});
    });
    const audio = await freshEngine();
    audio.timbre = 'sampled-guitar';
    const p = audio.play(NOTE);
    resumeGate?.();
    expect(await p).toBe(0.5);
    expect(sources.some((s) => s.started)).toBe(true);
    expect(audio.sampler.state).toBe('loading');
    expect(audio.samplerStatus('sampled').state).toBe('idle');
    expect(urls[0]).toMatch(/tonejs-instruments\/samples\/guitar-acoustic\/E2\.mp3$/);
  });

  it('声源结束后断开连接（长时间练习不累积节点）', async () => {
    const audio = await freshEngine();
    const p = audio.play(NOTE);
    resumeGate?.();
    await p;
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) s.onended?.();
    expect(sources.every((s) => s.disconnected)).toBe(true);
  });
});
