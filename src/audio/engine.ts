// 音频引擎：纯 Web Audio 合成的类钢琴音色，无需下载采样，可离线使用。

import { midiToFreq } from '../music/theory';

export type Timbre = 'piano' | 'epiano' | 'sine';

export interface NoteEvent {
  notes: number[]; // MIDI
  time: number; // 相对开始的秒数
  dur: number; // 秒
  velocity?: number; // 0..1
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  timbre: Timbre = 'piano';
  volume = 0.8;

  get context(): AudioContext {
    if (!this.ctx) {
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
    if (ctx.state !== 'running') await ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  stopAll(): void {
    for (const src of this.active) {
      try {
        src.stop();
      } catch {
        /* 已停止 */
      }
    }
    this.active.clear();
  }

  /** 播放一组事件，返回总时长（秒）。会先停止正在播放的声音。 */
  async play(events: NoteEvent[]): Promise<number> {
    await this.resume();
    this.stopAll();
    const ctx = this.context;
    const start = ctx.currentTime + 0.05;
    let end = 0;
    for (const ev of events) {
      for (const n of ev.notes) this.voice(n, start + ev.time, ev.dur, ev.velocity ?? 0.7);
      end = Math.max(end, ev.time + ev.dur);
    }
    return end;
  }

  private voice(midi: number, t: number, dur: number, vel: number): void {
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

    const partials = this.partials();
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

    if (this.timbre === 'piano') {
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

  private partials(): [number, number, number][] {
    switch (this.timbre) {
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
    src.onended = () => this.active.delete(src);
  }
}

export const audio = new AudioEngine();
