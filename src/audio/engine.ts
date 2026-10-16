// 音频引擎：负责调度（何时、用哪种音色、接到哪条总线）；各音色怎么发声见 timbres.ts（纯 Web Audio 合成，
// 无需下载，离线可用）。另有可选的采样乐器（sampler.ts），按需从 CDN 下载；未就绪或下载失败时回退到同类合成音色。

import { midiToFreq } from '../music/theory';
import { INSTRUMENTS, loadSamples, pickSample } from './sampler';
import {
  buildVoice,
  isSampled,
  pickRandomTimbre,
  SAMPLED_TIMBRES,
  softClipCurve,
  SOFT_CLIP_RANGE,
  strumOf,
  voiceTail,
  type SampledTimbre,
  type Timbre,
  type TimbreSetting,
  type VoiceBus,
} from './timbres';

export type { SampledTimbre, SynthTimbre, Timbre, TimbreSetting } from './timbres';

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

/** 一个采样乐器的下载状态与解码好的采样 */
interface Bank {
  samples: Map<number, AudioBuffer> | null;
  loading: Promise<boolean> | null;
  status: SamplerStatus;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private gestureWait = false;
  private master: GainNode | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  /** 每次 play / stopAll 加一：等待 resume 期间被取代或被停止的播放不再安排 */
  private gen = 0;
  /** 设置里的音色（可为 'random'） */
  timbre: TimbreSetting = 'piano';
  volume = 0.8;
  /** 随机音色模式下本题抽到的音色 */
  private picked: Timbre = pickRandomTimbre(null);
  private banks = new Map<SampledTimbre, Bank>(
    SAMPLED_TIMBRES.map((id) => [id, { samples: null, loading: null, status: { state: 'idle', progress: 0 } }]),
  );
  private listeners = new Set<(s: SamplerStatus) => void>();

  get context(): AudioContext {
    // 'closed'：个别移动浏览器长时间切到后台后会关闭上下文，重建一个（已解码的采样可跨上下文使用）
    if (!this.ctx || this.ctx.state === 'closed') {
      const first = !this.ctx;
      this.active.clear();
      // 先新建（可能抛错）再注册前台回调：失败后重试时不会重复注册
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      if (first) watchVisibility(() => this.wake());
      this.master = masterChain(this.ctx, this.volume);
    }
    return this.ctx;
  }

  /**
   * 预热：提前创建音频上下文与总线（新建 AudioContext 在手机上要上百毫秒）。
   * 打开练习类页面后在空闲时调用，点「开始」出第一题时就不必同步等它；不支持 Web Audio 的环境什么也不做。
   */
  warmUp(): void {
    if (this.ctx && this.ctx.state !== 'closed') return;
    if (typeof AudioContext === 'undefined') return;
    try {
      void this.context;
    } catch {
      // 新建失败（硬件上下文用尽、浏览器限制等）：预热只是优化，真正播放时会再建一次
    }
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

  // ───── 音色 ─────

  /** 实际发声的音色：随机模式下为本题抽到的音色 */
  get current(): Timbre {
    return this.timbre === 'random' ? this.picked : this.timbre;
  }

  /** 已下载就绪的采样乐器 */
  get loadedSampled(): SampledTimbre[] {
    return SAMPLED_TIMBRES.filter((id) => this.banks.get(id)!.samples);
  }

  /**
   * 新的一题开始（练习页出题、考试换题时调用）：随机音色模式下重新抽一种乐器（不与上一题相同），
   * 本题的播放、重听与选项试听都用它。返回抽到的音色；不是随机模式时返回 null。
   */
  newQuestion(): Timbre | null {
    if (this.timbre !== 'random') return null;
    this.picked = pickRandomTimbre(this.picked, this.loadedSampled);
    return this.picked;
  }

  // ───── 采样乐器 ─────

  /** 采样加载状态：当前选中的采样乐器（没选采样乐器时为采样钢琴） */
  get sampler(): SamplerStatus {
    return this.samplerStatus(isSampled(this.timbre) ? this.timbre : 'sampled');
  }

  samplerStatus(id: SampledTimbre): SamplerStatus {
    return this.banks.get(id)!.status;
  }

  /** 订阅采样加载状态（任一乐器变化都会回调），返回取消订阅函数 */
  onSampler(fn: (s: SamplerStatus) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private setStatus(bank: Bank, s: SamplerStatus): void {
    bank.status = s;
    for (const fn of this.listeners) fn(s);
  }

  /** 下载并解码采样乐器（可重复调用，只下载一次；失败后再次调用会重试）。成功返回 true。缺省为当前选中的采样乐器。 */
  loadSampler(id: SampledTimbre = isSampled(this.timbre) ? this.timbre : 'sampled'): Promise<boolean> {
    const bank = this.banks.get(id)!;
    if (bank.samples) return Promise.resolve(true);
    if (bank.loading) return bank.loading;
    this.setStatus(bank, { state: 'loading', progress: 0 });
    // 尚无 AudioContext 时（如启动时预加载、还没有用户手势）用离线上下文解码，AudioBuffer 可跨上下文使用
    const decoder = this.ctx ?? new OfflineAudioContext(1, 1, 48000);
    // 任一采样失败后整体即告失败，但其余下载仍在进行：之后的进度回调不能把「失败」改回「加载中」
    let settled = false;
    const onProgress = (progress: number) => !settled && this.setStatus(bank, { state: 'loading', progress });
    bank.loading = loadSamples(decoder, onProgress, INSTRUMENTS[id])
      .then((m) => {
        settled = true;
        bank.samples = m;
        this.setStatus(bank, { state: 'ready', progress: 1 });
        return true;
      })
      .catch((e: unknown) => {
        settled = true;
        console.warn(`采样（${id}）加载失败，回退到合成音色`, e);
        this.setStatus(bank, { state: 'error', progress: 0 });
        return false;
      })
      .finally(() => (bank.loading = null));
    return bank.loading;
  }

  // ───── 播放 ─────

  /**
   * 播放一组事件，返回总时长（秒）。会先停止正在播放的声音。
   * timbre：指定乐器（如考试回顾重放某题当时的乐器）；默认用当前音色。
   */
  async play(events: NoteEvent[], timbre: Timbre = this.current): Promise<number> {
    this.stopAll();
    const gen = this.gen;
    await this.resume();
    // 等待期间又调用了 play / stopAll（如离开页面）：这次播放作废
    if (gen !== this.gen) return 0;
    return this.schedule(this.bus(), events, this.context.currentTime + 0.05, timbre);
  }

  /** 叠加播放一组事件（不停止正在播放的声音），返回总时长（秒）。stopAll 同样能停止它。 */
  async playExtra(events: NoteEvent[], timbre: Timbre = this.current): Promise<number> {
    const gen = this.gen;
    await this.resume();
    if (gen !== this.gen) return 0;
    return this.schedule(this.bus(), events, this.context.currentTime + 0.05, timbre);
  }

  /**
   * 离线渲染一组事件（与实时播放同样的总线：音量 → 压缩器），返回单声道 AudioBuffer。
   * 用于 e2e 测量各音色的响度与峰值、导出 WAV 试听；不影响正在播放的声音。
   */
  async renderOffline(events: NoteEvent[], timbre: Timbre = this.current, sampleRate = 48000): Promise<AudioBuffer> {
    const synth = isSampled(timbre) ? INSTRUMENTS[timbre].fallback : timbre;
    let end = 0.5;
    for (const ev of events) {
      end = Math.max(end, ev.time + ev.dur + 0.3);
      for (const n of ev.notes) end = Math.max(end, ev.time + voiceTail(synth, n, ev.dur));
    }
    const ctx = new OfflineAudioContext(1, Math.ceil((end + 0.3) * sampleRate), sampleRate);
    const out = masterChain(ctx, this.volume);
    this.schedule({ ctx, out, track: () => {} }, events, 0, timbre);
    return ctx.startRendering();
  }

  /** 实时播放的总线 */
  private bus(): VoiceBus {
    return { ctx: this.context, out: this.master!, track: (src) => this.track(src) };
  }

  private schedule(bus: VoiceBus, events: NoteEvent[], start: number, timbre: Timbre): number {
    const strum = strumOf(isSampled(timbre) ? INSTRUMENTS[timbre].fallback : timbre);
    let end = 0;
    for (const ev of events) {
      const vel = ev.velocity ?? 0.7;
      // 节拍器与节奏音不随音色变化
      if (ev.kind === 'click') click(bus, start + ev.time, ev.accent ?? false, vel);
      else if (ev.kind === 'perc') {
        perc(bus, start + ev.time, vel);
        percSustain(bus, start + ev.time, ev.dur, vel);
      } else if (strum && ev.notes.length > 1)
        // 吉他和弦：从低到高依次拨响
        [...ev.notes].sort((a, b) => a - b).forEach((n, i) => this.voice(bus, timbre, n, start + ev.time + i * strum, ev.dur, vel));
      else for (const n of ev.notes) this.voice(bus, timbre, n, start + ev.time, ev.dur, vel);
      end = Math.max(end, ev.time + ev.dur);
    }
    return end;
  }

  private voice(bus: VoiceBus, timbre: Timbre, midi: number, t: number, dur: number, vel: number): void {
    const f = midiToFreq(midi);
    if (!isSampled(timbre)) return buildVoice(bus, timbre, midi, f, t, dur, vel);
    const inst = INSTRUMENTS[timbre];
    const bank = this.banks.get(timbre)!;
    // 采样未就绪：先用同类合成音色，后台继续加载（失败过则不自动重试，等用户在设置里重选）
    if (!bank.samples) {
      if (bank.status.state === 'idle') void this.loadSampler(timbre);
      return buildVoice(bus, inst.fallback, midi, f, t, dur, vel);
    }
    const pick = pickSample(midi, inst);
    const buf = pick && bank.samples.get(pick.sample);
    if (!pick || !buf) return buildVoice(bus, inst.fallback, midi, f, t, dur, vel);

    const { ctx } = bus;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pick.rate;
    const out = ctx.createGain();
    // 力度 → 增益（略带曲线，弱奏更弱）；各乐器的 gain 已按合成钢琴的响度校准
    const peak = inst.gain * vel ** 1.5;
    const release = inst.release; // 松开：淡出
    out.gain.setValueAtTime(peak, t);
    out.gain.setValueAtTime(peak, t + dur);
    out.gain.setTargetAtTime(0, t + dur, release / 4);
    src.connect(out).connect(bus.out);
    src.start(t);
    src.stop(t + dur + release + 0.05);
    bus.track(src);
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

const clipCurve = softClipCurve(4097, SOFT_CLIP_RANGE);

/** 总线：音量 → 压缩器 → 软限幅 → 输出。返回音量节点（各音接到这里）。 */
function masterChain(ctx: BaseAudioContext, volume: number): GainNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  const master = ctx.createGain();
  master.gain.value = volume;
  const pre = ctx.createGain();
  pre.gain.value = 1 / SOFT_CLIP_RANGE;
  const clip = ctx.createWaveShaper();
  clip.curve = clipCurve;
  master.connect(comp).connect(pre).connect(clip).connect(ctx.destination);
  return master;
}

/** 节拍器嘀嗒：短促的正弦脉冲，重拍音高更高、更响。 */
function click(bus: VoiceBus, t: number, accent: boolean, vel: number): void {
  const { ctx } = bus;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = accent ? 1760 : 1320;
  const g = ctx.createGain();
  const peak = vel * (accent ? 0.5 : 0.32);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(g).connect(bus.out);
  osc.start(t);
  osc.stop(t + 0.06);
  bus.track(osc);
}

/** 节奏音的持续部分：柔和的固定音高，按时值持续，让长音与休止能听出区别。 */
function percSustain(bus: VoiceBus, t: number, dur: number, vel: number): void {
  const { ctx } = bus;
  const out = ctx.createGain();
  out.connect(bus.out);
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
    bus.track(osc);
  }
}

/** 木鱼：向下扫频的三角波 + 带通噪声的敲击声，固定音高、约 0.1 秒衰减。 */
function perc(bus: VoiceBus, t: number, vel: number): void {
  const { ctx } = bus;
  const out = ctx.createGain();
  out.connect(bus.out);
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
    bus.track(osc);
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
  bus.track(noise);
}

export const audio = new AudioEngine();

// 开发模式下挂到 window 方便调试；e2e（__EARFORGE_TEST__）用 __earforgeAudio 离线渲染各音色、测量响度
if (typeof window !== 'undefined') {
  const w = window as unknown as { audio?: AudioEngine; __earforgeAudio?: AudioEngine; __EARFORGE_TEST__?: boolean };
  if (import.meta.env.DEV) w.audio = audio;
  if (w.__EARFORGE_TEST__) w.__earforgeAudio = audio;
}
