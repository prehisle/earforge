// 音频引擎：纯 Web Audio 合成的类钢琴音色与节奏打击音，无需下载采样，可离线使用。
// 另有可选的采样钢琴（'sampled'），按需从 CDN 下载；未就绪或下载失败时回退到合成钢琴。

import { midiToFreq } from '../music/theory';
import { loadSamples, pickSample } from './sampler';

export type Timbre = 'piano' | 'epiano' | 'sine' | 'sampled';
type SynthTimbre = Exclude<Timbre, 'sampled'>;

export type SamplerState = 'idle' | 'loading' | 'ready' | 'error';
export interface SamplerStatus {
  state: SamplerState;
  progress: number; // 0..1
}

export interface NoteEvent {
  notes: number[]; // MIDI
  time: number; // 相对开始的秒数
  dur: number; // 秒
  velocity?: number; // 0..1
  /** 音色类别：缺省为乐音；'perc' 为节奏音（木鱼起音 + 按时值持续的固定音高），'click' 为节拍器（此两类忽略 notes） */
  kind?: 'note' | 'perc' | 'click';
  /** 节拍器重拍（仅 kind 为 'click' 时有效） */
  accent?: boolean;
}

/** 页面从后台回到前台时回调（移动端切后台会挂起 AudioContext）。 */
export function watchVisibility(fn: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const h = () => {
    if (document.visibilityState === 'visible') fn();
  };
  document.addEventListener('visibilitychange', h);
  window.addEventListener('pageshow', h);
  return () => {
    document.removeEventListener('visibilitychange', h);
    window.removeEventListener('pageshow', h);
  };
}

/** 下一次触摸/点击/按键时回调一次（iOS 只允许在用户手势里恢复音频）。 */
function resumeOnNextGesture(fn: () => void): void {
  const events = ['pointerdown', 'keydown', 'touchend'] as const;
  const h = () => {
    for (const e of events) window.removeEventListener(e, h, true);
    fn();
  };
  for (const e of events) window.addEventListener(e, h, { capture: true, passive: true });
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private gestureWait = false;
  private master: GainNode | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  /** 每次 play / stopAll 加一：等待 resume 期间被取代或被停止的播放不再安排 */
  private gen = 0;
  timbre: Timbre = 'piano';
  volume = 0.8;
  private samples: Map<number, AudioBuffer> | null = null;
  private loading: Promise<boolean> | null = null;
  private status: SamplerStatus = { state: 'idle', progress: 0 };
  private listeners = new Set<(s: SamplerStatus) => void>();

  get context(): AudioContext {
    // 'closed'：个别移动浏览器长时间切到后台后会关闭上下文，重建一个（已解码的采样可跨上下文使用）
    if (!this.ctx || this.ctx.state === 'closed') {
      if (!this.ctx) watchVisibility(() => this.wake());
      this.active.clear();
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.context;
    if (ctx.state === 'running') return;
    // iOS Safari 切回前台后上下文可能处于 'interrupted'，不在用户手势里 resume() 可能一直不返回：
    // 最多等一会儿就继续（声音会在上下文恢复后发出），不让播放调用卡住
    await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 600))]);
  }

  /** 页面回到前台：尝试恢复被系统挂起的上下文；不成功则等下一次触摸/按键（用户手势）再恢复。 */
  private wake(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    ctx.resume().catch(() => {});
    if (this.gestureWait) return;
    this.gestureWait = true;
    resumeOnNextGesture(() => {
      this.gestureWait = false;
      if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => {});
    });
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  stopAll(): void {
    this.gen++;
    for (const src of this.active) {
      try {
        src.stop();
      } catch {
        /* 已停止 */
      }
    }
    this.active.clear();
  }

  /** 采样加载状态 */
  get sampler(): SamplerStatus {
    return this.status;
  }

  /** 订阅采样加载状态，返回取消订阅函数 */
  onSampler(fn: (s: SamplerStatus) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private setStatus(s: SamplerStatus): void {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  /** 下载并解码采样钢琴（可重复调用，只下载一次；失败后再次调用会重试）。成功返回 true。 */
  loadSampler(): Promise<boolean> {
    if (this.samples) return Promise.resolve(true);
    if (this.loading) return this.loading;
    this.setStatus({ state: 'loading', progress: 0 });
    // 尚无 AudioContext 时（如启动时预加载、还没有用户手势）用离线上下文解码，AudioBuffer 可跨上下文使用
    const decoder = this.ctx ?? new OfflineAudioContext(1, 1, 48000);
    this.loading = loadSamples(decoder, (progress) => this.setStatus({ state: 'loading', progress }))
      .then((m) => {
        this.samples = m;
        this.setStatus({ state: 'ready', progress: 1 });
        return true;
      })
      .catch((e: unknown) => {
        console.warn('采样钢琴加载失败，回退到合成钢琴', e);
        this.setStatus({ state: 'error', progress: 0 });
        return false;
      })
      .finally(() => (this.loading = null));
    return this.loading;
  }

  /** 播放一组事件，返回总时长（秒）。会先停止正在播放的声音。 */
  async play(events: NoteEvent[]): Promise<number> {
    this.stopAll();
    const gen = this.gen;
    await this.resume();
    // 等待期间又调用了 play / stopAll（如离开页面）：这次播放作废
    if (gen !== this.gen) return 0;
    return this.schedule(events);
  }

  /** 叠加播放一组事件（不停止正在播放的声音），返回总时长（秒）。stopAll 同样能停止它。 */
  async playExtra(events: NoteEvent[]): Promise<number> {
    const gen = this.gen;
    await this.resume();
    if (gen !== this.gen) return 0;
    return this.schedule(events);
  }

  private schedule(events: NoteEvent[]): number {
    const ctx = this.context;
    const start = ctx.currentTime + 0.05;
    let end = 0;
    for (const ev of events) {
      if (ev.kind === 'click') this.click(start + ev.time, ev.accent ?? false, ev.velocity ?? 0.7);
      else if (ev.kind === 'perc') {
        this.perc(start + ev.time, ev.velocity ?? 0.7);
        this.sustain(start + ev.time, ev.dur, ev.velocity ?? 0.7);
      }
      else for (const n of ev.notes) this.voice(n, start + ev.time, ev.dur, ev.velocity ?? 0.7);
      end = Math.max(end, ev.time + ev.dur);
    }
    return end;
  }

  private voice(midi: number, t: number, dur: number, vel: number): void {
    if (this.timbre !== 'sampled') return this.synth(midi, t, dur, vel, this.timbre);
    // 采样未就绪：先用合成钢琴，后台继续加载（失败过则不自动重试，等用户在设置里重选）
    if (!this.samples) {
      if (this.status.state === 'idle') void this.loadSampler();
      return this.synth(midi, t, dur, vel, 'piano');
    }
    const pick = pickSample(midi);
    const buf = pick && this.samples.get(pick.sample);
    if (!pick || !buf) return this.synth(midi, t, dur, vel, 'piano');

    const ctx = this.context;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pick.rate;
    const out = ctx.createGain();
    // 力度 → 增益（略带曲线，弱奏更弱）
    const peak = 1.6 * vel ** 1.5; // 采样峰值约 0.25，与合成钢琴响度相当
    const release = 0.15; // 松开踏板：约 0.15 秒淡出
    out.gain.setValueAtTime(peak, t);
    out.gain.setValueAtTime(peak, t + dur);
    out.gain.setTargetAtTime(0, t + dur, release / 4);
    src.connect(out).connect(this.master!);
    src.start(t);
    src.stop(t + dur + release + 0.05);
    this.track(src);
  }

  private synth(midi: number, t: number, dur: number, vel: number, timbre: SynthTimbre): void {
    const ctx = this.context;
    const f = midiToFreq(midi);
    const out = ctx.createGain();
    out.connect(this.master!);

    // 高音衰减更快，低音更长，接近真实钢琴
    const decay = Math.max(0.6, 3.2 - (midi - 48) * 0.035);
    const release = 0.12;
    const stopAt = t + dur + release;
    const peak = vel * 0.32 * Math.min(1, 1.25 - (midi - 60) * 0.006);

    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(peak, t + 0.006);
    out.gain.setTargetAtTime(peak * 0.25, t + 0.006, decay * 0.35);
    out.gain.setTargetAtTime(0, t + dur, release / 3);

    const partials = this.partials(timbre);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.5;
    const bright = Math.min(16000, f * (6 + vel * 10));
    filter.frequency.setValueAtTime(bright, t);
    filter.frequency.setTargetAtTime(Math.max(f * 2, 800), t + 0.01, decay * 0.25);
    filter.connect(out);

    for (const [ratio, amp, detune] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      // 轻微非谐性（钢琴弦的特性）
      osc.frequency.value = f * ratio * (1 + 0.0004 * ratio * ratio);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(filter);
      osc.start(t);
      osc.stop(stopAt + 0.05);
      this.track(osc);
    }

    if (timbre === 'piano') {
      // 击弦噪声
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = Math.min(8000, f * 4);
      const ng = ctx.createGain();
      ng.gain.value = vel * 0.15;
      noise.connect(nf).connect(ng).connect(out);
      noise.start(t);
      this.track(noise);
    }
  }

  /** 节拍器嘀嗒：短促的正弦脉冲，重拍音高更高、更响。 */
  private click(t: number, accent: boolean, vel: number): void {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = accent ? 1760 : 1320;
    const g = ctx.createGain();
    const peak = vel * (accent ? 0.5 : 0.32);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.06);
    this.track(osc);
  }

  /** 节奏音的持续部分：柔和的固定音高，按时值持续，让长音与休止能听出区别。 */
  private sustain(t: number, dur: number, vel: number): void {
    const ctx = this.context;
    const out = ctx.createGain();
    out.connect(this.master!);
    const hold = Math.max(0.06, dur * 0.88);
    const level = vel * 0.16;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(level, t + 0.01);
    out.gain.setValueAtTime(level, t + hold - 0.03);
    out.gain.linearRampToValueAtTime(0, t + hold);
    for (const [f, amp] of [
      [587.33, 1],
      [1174.66, 0.18],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + hold + 0.02);
      this.track(osc);
    }
  }

  /** 木鱼：向下扫频的三角波 + 带通噪声的敲击声，固定音高、约 0.1 秒衰减。 */
  private perc(t: number, vel: number): void {
    const ctx = this.context;
    const out = ctx.createGain();
    out.connect(this.master!);
    const peak = vel * 0.7;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(peak, t + 0.002);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

    for (const [f, type, amp] of [
      [880, 'triangle', 1],
      [1320, 'sine', 0.35],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f * 1.25, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.015);
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.16);
      this.track(osc);
    }

    const len = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 2500;
    nf.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.value = 0.6;
    noise.connect(nf).connect(ng).connect(out);
    noise.start(t);
    this.track(noise);
  }

  private partials(timbre: SynthTimbre): [number, number, number][] {
    switch (timbre) {
      case 'sine':
        return [[1, 1, 0]];
      case 'epiano':
        return [
          [1, 1, 0],
          [2, 0.25, 0],
          [3, 0.08, 0],
          [7, 0.03, 0],
        ];
      case 'piano':
      default:
        return [
          [1, 1, -2],
          [1, 0.5, 3],
          [2, 0.45, 0],
          [3, 0.22, 0],
          [4, 0.12, 0],
          [5, 0.07, 0],
          [6, 0.04, 0],
        ];
    }
  }

  private track(src: AudioScheduledSourceNode): void {
    this.active.add(src);
    src.onended = () => {
      this.active.delete(src);
      // 断开已结束的声源：其后的增益/滤波节点不再有输入，可被回收
      src.disconnect();
    };
  }
}

export const audio = new AudioEngine();

// 开发模式下挂到 window 方便调试
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { audio: AudioEngine }).audio = audio;
