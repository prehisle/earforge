// 实时音高检测：YIN 算法（de Cheveigné & Kawahara, 2002）。

import { freqToMidi } from '../music/theory';

export interface PitchResult {
  freq: number;
  midi: number; // 浮点 MIDI，可算音分偏差
  clarity: number; // 0..1，越大越可信
}

/** 对一帧 PCM 做 YIN 检测，失败返回 null。 */
export function detectPitch(buf: Float32Array, sampleRate: number, threshold = 0.12): PitchResult | null {
  const n = buf.length;
  const half = Math.floor(n / 2);

  // 能量门限：太安静就不检测
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null;

  const minTau = Math.floor(sampleRate / 1200); // 最高约 1200Hz
  const maxTau = Math.min(half - 1, Math.floor(sampleRate / 60)); // 最低约 60Hz
  const d = new Float32Array(maxTau + 1);

  // 差分函数
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // 累积均值归一化
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // 绝对阈值：找第一个低于阈值的局部最小
  let tauEst = -1;
  for (let tau = Math.max(2, minTau); tau < maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst < 0) return null;

  // 抛物线插值
  let better = tauEst;
  if (tauEst > 0 && tauEst < maxTau) {
    const s0 = cmnd[tauEst - 1];
    const s1 = cmnd[tauEst];
    const s2 = cmnd[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) better = tauEst + (s2 - s0) / denom;
  }

  const freq = sampleRate / better;
  return { freq, midi: freqToMidi(freq), clarity: 1 - cmnd[tauEst] };
}

/** 麦克风监听器：持续回调检测到的音高。 */
export class PitchListener {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;

  async start(onPitch: (p: PitchResult | null) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const sr = this.ctx.sampleRate;
    const loop = () => {
      analyser.getFloatTimeDomainData(buf);
      onPitch(detectPitch(buf, sr));
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = null;
    this.ctx = null;
  }
}
