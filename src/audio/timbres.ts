// 音色：每种合成音色的描述数据 + 把「一个音」搭成 Web Audio 节点的构建函数。
// engine.ts 只负责调度（何时、哪个音色、接到哪条总线），具体怎么发声都在这里。
// 全部为实时合成，无需下载，离线（PWA）可用。采样乐器见 sampler.ts。

/** 合成音色（离线可用） */
export const SYNTH_TIMBRES = ['piano', 'epiano', 'sine', 'organ', 'guitar', 'strings', 'flute', 'marimba'] as const;
export type SynthTimbre = (typeof SYNTH_TIMBRES)[number];

/** 采样音色（按需下载）：sampled 为采样钢琴（沿用旧取值），其余来自 tonejs-instruments */
export const SAMPLED_TIMBRES = ['sampled', 'sampled-guitar', 'sampled-violin', 'sampled-flute'] as const;
export type SampledTimbre = (typeof SAMPLED_TIMBRES)[number];

export type Timbre = SynthTimbre | SampledTimbre;
/** 设置里的音色：具体音色，或 'random'（每题随机换一种乐器） */
export type TimbreSetting = Timbre | 'random';
export const TIMBRE_SETTINGS = [...SYNTH_TIMBRES, ...SAMPLED_TIMBRES, 'random'] as const satisfies readonly TimbreSetting[];

/** 随机音色的候选（合成乐器；纯音不算乐器，不参与）。已下载就绪的采样乐器另外加入。 */
export const RANDOM_POOL: readonly SynthTimbre[] = ['piano', 'epiano', 'organ', 'guitar', 'strings', 'flute', 'marimba'];

export function isSampled(t: TimbreSetting): t is SampledTimbre {
  return (SAMPLED_TIMBRES as readonly string[]).includes(t);
}

/**
 * 随机选一种音色：候选为 RANDOM_POOL 加上已就绪的采样乐器，尽量不与上一题相同。
 * 未下载的采样乐器绝不会被选中（选中后要等下载，题目会先用合成音色发声，前后不一致）。
 */
export function pickRandomTimbre(prev: Timbre | null, loaded: readonly SampledTimbre[] = [], rand: () => number = Math.random): Timbre {
  const pool: Timbre[] = [...RANDOM_POOL, ...loaded.filter((t) => isSampled(t))];
  const choices = pool.length > 1 ? pool.filter((t) => t !== prev) : pool;
  return choices[Math.min(choices.length - 1, Math.floor(rand() * choices.length))];
}

/** 分音：[频率倍数, 振幅, 失谐（音分）] */
export type PartialSpec = readonly [ratio: number, amp: number, detune: number];

/**
 * 发声模型：
 * - struck：钢琴类，起音后衰减到约 1/4 并维持，滤波器随之变暗（原合成钢琴的做法）
 * - sustain：持续音（风琴、弦乐、长笛），按时值保持音量，松开后淡出
 * - mallet：槌击，每个（非谐）分音各自按指数衰减，不受时值影响
 * - pluck：拨弦，Karplus-Strong 预先算好的波形（自然衰减），时值结束时止音
 */
export type VoiceModel = 'struck' | 'sustain' | 'mallet' | 'pluck';

export interface SynthDef {
  model: VoiceModel;
  /** 振荡器波形（缺省 sine） */
  wave?: OscillatorType;
  partials: readonly PartialSpec[];
  /** 力度为 1、中央 C 附近的峰值增益：各音色按听感响度平衡（见 e2e/scenarios/timbres.mjs 的测量） */
  peak: number;
  /** 起音时间（秒） */
  attack: number;
  /** 松开后的淡出时间（秒） */
  release: number;
  /** 弦的非谐性系数：第 n 分音频率乘以 1 + k·n² */
  stretch?: number;
  /** 低通滤波：截止频率 = 基频 × mult，限制在 [min, max] 内 */
  lowpass?: { mult: number; min: number; max: number; q: number };
  /** 颤音：起音 delay 秒后逐渐加深到 cents 音分 */
  vibrato?: { rate: number; cents: number; delay: number };
  /** 噪声：hammer 击弦噪声（钢琴），breath 气声（长笛，持续 + 起音时的「噗」） */
  noise?: { kind: 'hammer' | 'breath'; gain: number };
  /** mallet：各分音的衰减时间常数相对基音的比例 */
  partialDecay?: readonly number[];
  /** 和弦扫弦：从低到高每个音依次晚这么多秒（同时拨响的噪声起音叠加会让峰值过高，也更像真吉他） */
  strum?: number;
}

export const SYNTH_DEFS: Record<SynthTimbre, SynthDef> = {
  piano: {
    model: 'struck',
    partials: [
      [1, 1, -2],
      [1, 0.5, 3],
      [2, 0.45, 0],
      [3, 0.22, 0],
      [4, 0.12, 0],
      [5, 0.07, 0],
      [6, 0.04, 0],
    ],
    peak: 0.32,
    attack: 0.006,
    release: 0.12,
    stretch: 0.0004,
    noise: { kind: 'hammer', gain: 0.15 },
  },
  epiano: {
    model: 'struck',
    partials: [
      [1, 1, 0],
      [2, 0.25, 0],
      [3, 0.08, 0],
      [7, 0.03, 0],
    ],
    peak: 0.32,
    attack: 0.006,
    release: 0.12,
    stretch: 0.0004,
  },
  sine: { model: 'struck', partials: [[1, 1, 0]], peak: 0.32, attack: 0.006, release: 0.12, stretch: 0.0004 },
  // 风琴：拉杆式的整数倍分音（16′ 8′ 4′ 2⅔′ 2′ 1⅓′ 1′），按住多久响多久
  organ: {
    model: 'sustain',
    partials: [
      [0.5, 0.4, 0],
      [1, 1, 0],
      [2, 0.6, 0],
      [3, 0.32, 0],
      [4, 0.3, 0],
      [6, 0.12, 0],
      [8, 0.1, 0],
    ],
    peak: 0.15,
    attack: 0.012,
    release: 0.07,
    lowpass: { mult: 14, min: 3000, max: 12000, q: 0.5 },
  },
  // 木吉他：Karplus-Strong 拨弦（波形由 karplusStrong 生成，分音不用）
  guitar: {
    model: 'pluck',
    partials: [],
    peak: 2.3,
    attack: 0.002,
    release: 0.2,
    strum: 0.012,
    lowpass: { mult: 12, min: 2500, max: 9000, q: 0.5 },
  },
  // 弦乐合奏：三支互相失谐的锯齿波、低通变暗，慢起音 + 轻颤音
  strings: {
    model: 'sustain',
    wave: 'sawtooth',
    partials: [
      [1, 1, -9],
      [1, 1, 0],
      [1, 1, 8],
    ],
    peak: 0.2,
    attack: 0.22,
    release: 0.35,
    lowpass: { mult: 5, min: 1400, max: 6000, q: 0.6 },
    vibrato: { rate: 5.3, cents: 7, delay: 0.25 },
  },
  // 长笛：近似正弦（少量 2、3 次谐波）+ 气声噪声 + 轻颤音
  flute: {
    model: 'sustain',
    partials: [
      [1, 1, 0],
      [2, 0.16, 0],
      [3, 0.05, 0],
    ],
    peak: 0.2,
    attack: 0.07,
    release: 0.12,
    vibrato: { rate: 5, cents: 10, delay: 0.2 },
    noise: { kind: 'breath', gain: 0.07 },
  },
  // 马林巴 / 槌击：非谐分音 1、3.9、9.2，高分音很快消失，只剩「咚」的基音
  marimba: {
    model: 'mallet',
    partials: [
      [1, 1, 0],
      [3.93, 0.32, 0],
      [9.24, 0.1, 0],
    ],
    partialDecay: [1, 0.22, 0.08],
    peak: 0.55,
    attack: 0.002,
    release: 0.05,
  },
};

/** 低音更响一点、高音略收（原合成钢琴的音区平衡） */
export const keyScale = (midi: number) => Math.min(1, 1.25 - (midi - 60) * 0.006);

/** 槌击基音的衰减时间常数（秒）：低音更长 */
export const malletDecay = (midi: number) => Math.min(0.9, Math.max(0.15, 0.5 - (midi - 60) * 0.012));

/** 拨弦的 T60（衰减 60 dB 的时间，秒）：低音弦更长 */
export const pluckT60 = (midi: number) => Math.min(4.5, Math.max(1.2, 4.5 - (midi - 40) * 0.07));

/** 和弦扫弦的间隔（秒）：采样乐器按其回退的合成音色算；不扫弦的音色为 0 */
export function strumOf(timbre: SynthTimbre): number {
  return SYNTH_DEFS[timbre].strum ?? 0;
}

/** 一个音大约持续多久（秒，含尾音）：用于离线渲染时估计长度 */
export function voiceTail(timbre: SynthTimbre, midi: number, dur: number): number {
  const def = SYNTH_DEFS[timbre];
  if (def.model === 'mallet') return malletDecay(midi) * 7;
  if (def.model === 'sustain') return sustainEnvelope(def.attack, dur).hold + def.release * 2;
  return dur + def.release + 0.1;
}

/** 可复现的伪随机数（mulberry32）：同一音高的拨弦波形每次相同，便于测试 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PluckOptions {
  /** 衰减 60 dB 的时间（秒） */
  t60: number;
  /** 生成的长度（秒） */
  seconds: number;
  /** 激励噪声的亮度 0..1（越小越闷） */
  brightness?: number;
  /** 拨弦位置（弦长比例）：去掉该位置为波节的谐波 */
  position?: number;
  seed?: number;
}

/**
 * Karplus-Strong 拨弦（纯函数）：返回峰值归一化到 1 的波形，以及让音高精确的播放速率。
 * 延迟线取整数长度 N，平均滤波再引入半个采样的延迟，实际周期 N + 0.5；
 * 播放时乘以 rate = freq·(N + 0.5)/sampleRate 校正到准确频率（练耳不能跑调）。
 */
/** 拨弦延迟线的整数长度（实际周期再加半个采样） */
export const pluckDelay = (freq: number, sampleRate: number) => Math.max(2, Math.floor(sampleRate / freq - 0.5));

export function karplusStrong(freq: number, sampleRate: number, o: PluckOptions): { data: Float32Array<ArrayBuffer>; rate: number } {
  const n = pluckDelay(freq, sampleRate);
  const period = n + 0.5;
  const rate = (freq * period) / sampleRate;
  const len = Math.max(n + 2, Math.floor(o.seconds * sampleRate));
  const out = new Float32Array(len);
  const rand = seededRandom(o.seed ?? 1);
  // 激励：一阶低通的白噪声（亮度）+ 拨弦位置的梳状滤波，再去直流
  const b = Math.min(1, Math.max(0.05, o.brightness ?? 0.6));
  const exc = new Float64Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += b * (rand() * 2 - 1 - lp);
    exc[i] = lp;
  }
  const shift = Math.max(1, Math.round(n * (o.position ?? 0.13)));
  let mean = 0;
  for (let i = 0; i < n; i++) {
    out[i] = exc[i] - (i >= shift ? exc[i - shift] : 0);
    mean += out[i];
  }
  mean /= n;
  for (let i = 0; i < n; i++) out[i] -= mean;
  // 每个周期的损耗：基音在 t60 秒内衰减 60 dB
  const rho = 0.001 ** (period / (sampleRate * o.t60));
  for (let i = n; i < len; i++) out[i] = rho * 0.5 * (out[i - n] + (i > n ? out[i - n - 1] : 0));
  // 峰值归一化，末尾 30 毫秒淡出（避免截断的爆音）
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const fade = Math.min(len, Math.floor(sampleRate * 0.03));
  for (let i = 0; i < len; i++) {
    out[i] /= peak || 1;
    if (i >= len - fade) out[i] *= (len - i) / fade;
  }
  return { data: out, rate };
}

/**
 * 总线末端的软限幅曲线（WaveShaper 用，输入先乘以 1/range）：|x| < 0.8 原样通过（线性段完全无失真），
 * 之上用 tanh 平滑压到 0.99 以内。压缩器的起音有几毫秒，多音和弦叠加的瞬时峰值会超过 1 而削波破音，这里兜底。
 */
export function softClipCurve(n = 4097, range = 2): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * range;
    const a = Math.abs(u);
    c[i] = Math.sign(u) * (a < 0.8 ? a : 0.8 + 0.19 * Math.tanh((a - 0.8) / 0.19));
  }
  return c;
}
export const SOFT_CLIP_RANGE = 2;

// ───── 构建函数：把一个音搭成节点，接到 dest ─────

/** 发声的去处：上下文、输出节点、登记声源（stopAll 用） */
export interface VoiceBus {
  ctx: BaseAudioContext;
  out: AudioNode;
  track(src: AudioScheduledSourceNode): void;
}

/** 每个上下文共用一段 1 秒的白噪声（循环播放作气声） */
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

/**
 * 拨弦波形缓存：按采样率与延迟线长度（同一长度的音高只差播放速率）。
 * 低音一份可达约 670 KB，只保留最近用过的这么多份（LRU）；淘汰的下次按同一种子重新生成，声音不变。
 */
export const PLUCK_CACHE_MAX = 24;
const pluckCache = new Map<string, { buf: AudioBuffer; period: number }>();
/** 当前缓存的拨弦波形份数（测试用） */
export const pluckCacheSize = () => pluckCache.size;
export function pluckBuffer(ctx: BaseAudioContext, midi: number, f: number): { buf: AudioBuffer; rate: number } {
  const sr = ctx.sampleRate;
  // 同一延迟线长度的音高共用一份波形（只差播放速率）；直接用 f 生成，延迟线长度与这里算的一致
  const n = pluckDelay(f, sr);
  const key = `${sr}:${n}`;
  let hit = pluckCache.get(key);
  // Map 按插入顺序迭代：命中的移到末尾，最久未用的在最前
  if (hit) pluckCache.delete(key);
  else {
    const t60 = pluckT60(midi);
    const { data } = karplusStrong(f, sr, { t60, seconds: Math.min(3.5, t60), brightness: 0.4, seed: n });
    const buf = ctx.createBuffer(1, data.length, sr);
    buf.getChannelData(0).set(data);
    hit = { buf, period: n + 0.5 };
    if (pluckCache.size >= PLUCK_CACHE_MAX) pluckCache.delete(pluckCache.keys().next().value!);
  }
  pluckCache.set(key, hit);
  return { buf: hit.buf, rate: (f * hit.period) / sr };
}

/** 振荡器高于奈奎斯特频率会折叠成杂音：跳过这些分音 */
const audible = (ctx: BaseAudioContext, freq: number) => freq < ctx.sampleRate * 0.45;

/** 颤音：一个 LFO 接到各振荡器的 detune（音分），delay 秒后在 0.3 秒内加深 */
function vibrato(bus: VoiceBus, oscs: OscillatorNode[], v: NonNullable<SynthDef['vibrato']>, t: number, stopAt: number): void {
  const { ctx } = bus;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = v.rate;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.setValueAtTime(0, t + v.delay);
  depth.gain.linearRampToValueAtTime(v.cents, t + v.delay + 0.3);
  lfo.connect(depth);
  for (const o of oscs) depth.connect(o.detune);
  lfo.start(t);
  lfo.stop(stopAt);
  bus.track(lfo);
}

/** 用合成音色发出一个音。f 为基频（Hz），t 为开始时刻，dur 为时值，vel 为力度 0..1。 */
export function buildVoice(bus: VoiceBus, timbre: SynthTimbre, midi: number, f: number, t: number, dur: number, vel: number): void {
  const def = SYNTH_DEFS[timbre];
  switch (def.model) {
    case 'struck':
      return struck(bus, def, midi, f, t, dur, vel);
    case 'sustain':
      return sustained(bus, def, midi, f, t, dur, vel);
    case 'mallet':
      return mallet(bus, def, midi, f, t, vel);
    case 'pluck':
      return pluck(bus, def, midi, f, t, dur, vel);
  }
}

/** 钢琴类：与 0.7 版的合成钢琴 / 电钢琴 / 纯音完全相同 */
function struck(bus: VoiceBus, def: SynthDef, midi: number, f: number, t: number, dur: number, vel: number): void {
  const { ctx } = bus;
  const out = ctx.createGain();
  out.connect(bus.out);

  // 高音衰减更快，低音更长，接近真实钢琴
  const decay = Math.max(0.6, 3.2 - (midi - 48) * 0.035);
  const release = def.release;
  const stopAt = t + dur + release;
  const peak = vel * def.peak * keyScale(midi);

  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(peak, t + def.attack);
  out.gain.setTargetAtTime(peak * 0.25, t + def.attack, decay * 0.35);
  out.gain.setTargetAtTime(0, t + dur, release / 3);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const bright = Math.min(16000, f * (6 + vel * 10));
  filter.frequency.setValueAtTime(bright, t);
  filter.frequency.setTargetAtTime(Math.max(f * 2, 800), t + 0.01, decay * 0.25);
  filter.connect(out);

  const k = def.stretch ?? 0;
  for (const [ratio, amp, detune] of def.partials) {
    // 轻微非谐性（钢琴弦的特性）
    const freq = f * ratio * (1 + k * ratio * ratio);
    if (!audible(ctx, freq)) continue;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(stopAt + 0.05);
    bus.track(osc);
  }

  if (def.noise?.kind === 'hammer') {
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
    ng.gain.value = vel * def.noise.gain;
    noise.connect(nf).connect(ng).connect(out);
    noise.start(t);
    bus.track(noise);
  }
}

/**
 * 持续音的包络时刻（相对音头，秒）：attack 为起音时长，hold 为开始淡出的时刻。
 * 起音一般不超过时值的一半（至少 10 ms）；比 10 ms 还短的音起音就等于时值（至少 2 ms），
 * 保证先升到峰值再淡出——起音若比时值长，淡出会被随后的起音斜坡盖掉，一直保持满音量到被硬切断而爆音。
 */
export function sustainEnvelope(attack: number, dur: number): { attack: number; hold: number } {
  const a = Math.max(0.002, Math.min(attack, Math.max(0.01, dur * 0.5), dur));
  return { attack: a, hold: Math.max(dur, a) };
}

/** 持续音：起音 → 按时值保持 → 淡出。很短的音把起音压缩到时值的一半以内。 */
function sustained(bus: VoiceBus, def: SynthDef, midi: number, f: number, t: number, dur: number, vel: number): void {
  const { ctx } = bus;
  const out = ctx.createGain();
  out.connect(bus.out);
  const peak = vel * def.peak * keyScale(midi);
  const { attack, hold } = sustainEnvelope(def.attack, dur);
  const stopAt = t + hold + def.release * 2;
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(peak, t + attack);
  out.gain.setValueAtTime(peak, t + hold);
  out.gain.setTargetAtTime(0, t + hold, def.release / 3);

  let dest: AudioNode = out;
  if (def.lowpass) {
    const lp = def.lowpass;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = lp.q;
    const cut = Math.min(lp.max, Math.max(lp.min, f * lp.mult));
    // 慢起音的音色（弦乐）滤波器随起音打开：先闷后亮，像弓子咬弦
    filter.frequency.setValueAtTime(attack > 0.1 ? cut * 0.5 : cut, t);
    filter.frequency.linearRampToValueAtTime(cut, t + attack);
    filter.connect(out);
    dest = filter;
  }

  const oscs: OscillatorNode[] = [];
  for (const [ratio, amp, detune] of def.partials) {
    if (!audible(ctx, f * ratio * (def.wave === 'sawtooth' ? 2 : 1))) continue;
    const osc = ctx.createOscillator();
    osc.type = def.wave ?? 'sine';
    osc.frequency.value = f * ratio;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(stopAt);
    bus.track(osc);
    oscs.push(osc);
  }
  if (def.vibrato) vibrato(bus, oscs, def.vibrato, t, stopAt);

  if (def.noise?.kind === 'breath') {
    // 气声：循环白噪声经带通，持续的轻气声 + 起音时较强的「噗」
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(9000, f * 2.5);
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    const level = def.noise.gain / def.peak; // 相对 out 的增益（out 已乘以 peak）
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(level * 4, t + Math.min(0.02, attack));
    ng.gain.setTargetAtTime(level, t + Math.min(0.02, attack), 0.04);
    src.connect(bp).connect(ng).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(stopAt);
    bus.track(src);
  }
}

/** 槌击：每个分音各自衰减，基音的衰减时间随音区变化；不随时值止音（槌击乐器没有制音）。 */
function mallet(bus: VoiceBus, def: SynthDef, midi: number, f: number, t: number, vel: number): void {
  const { ctx } = bus;
  const out = ctx.createGain();
  out.gain.value = vel * def.peak * keyScale(midi);
  out.connect(bus.out);
  const tau = malletDecay(midi);
  const stopAt = t + tau * 7;
  def.partials.forEach(([ratio, amp, detune], i) => {
    if (!audible(ctx, f * ratio)) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * ratio;
    osc.detune.value = detune;
    const g = ctx.createGain();
    // 力度越大高分音越多（槌子越硬）
    const a = i === 0 ? amp : amp * (0.5 + vel * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + def.attack);
    g.gain.setTargetAtTime(0, t + def.attack, tau * (def.partialDecay?.[i] ?? 1));
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(stopAt);
    bus.track(osc);
  });
}

/** 拨弦：Karplus-Strong 波形 + 力度控制的低通（轻拨更闷），时值结束时止音。 */
function pluck(bus: VoiceBus, def: SynthDef, midi: number, f: number, t: number, dur: number, vel: number): void {
  const { ctx } = bus;
  const { buf, rate } = pluckBuffer(ctx, midi, f);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const lp = def.lowpass!;
  filter.Q.value = lp.q;
  filter.frequency.value = Math.min(lp.max, Math.max(lp.min, f * lp.mult * (0.5 + vel * 0.5)));
  const out = ctx.createGain();
  const peak = vel * def.peak * keyScale(midi);
  out.gain.setValueAtTime(peak, t);
  out.gain.setValueAtTime(peak, t + dur);
  out.gain.setTargetAtTime(0, t + dur, def.release / 3);
  src.connect(filter).connect(out).connect(bus.out);
  src.start(t);
  src.stop(Math.min(t + buf.duration / rate, t + dur + def.release * 2));
  bus.track(src);
}
