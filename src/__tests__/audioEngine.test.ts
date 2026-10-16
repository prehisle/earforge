// 音频引擎的调度竞态与节点回收：用最小的假 AudioContext 驱动（node 环境没有 Web Audio）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
