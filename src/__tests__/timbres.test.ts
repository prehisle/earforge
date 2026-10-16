// 音色描述数据与纯函数（拨弦波形、随机音色）的正确性；Web Audio 部分由 e2e/scenarios/timbres.mjs 实际渲染检查。
import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, noteFile, pickSample } from '../audio/sampler';
import {
  RANDOM_POOL,
  SAMPLED_TIMBRES,
  SYNTH_DEFS,
  SYNTH_TIMBRES,
  TIMBRE_SETTINGS,
  isSampled,
  karplusStrong,
  malletDecay,
  pickRandomTimbre,
  PLUCK_CACHE_MAX,
  pluckBuffer,
  pluckCacheSize,
  pluckDelay,
  pluckT60,
  seededRandom,
  softClipCurve,
  sustainEnvelope,
  voiceTail,
  type SampledTimbre,
} from '../audio/timbres';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';

describe('音色定义', () => {
  it('每种合成音色都有定义，增益有限且为正，时间参数为正', () => {
    expect(Object.keys(SYNTH_DEFS).sort()).toEqual([...SYNTH_TIMBRES].sort());
    for (const id of SYNTH_TIMBRES) {
      const d = SYNTH_DEFS[id];
      // 拨弦波形峰值归一化到 1、但能量集中在起音，增益要大一些
      expect(Number.isFinite(d.peak) && d.peak > 0 && d.peak < (d.model === 'pluck' ? 4 : 1), id).toBe(true);
      expect(d.attack, id).toBeGreaterThan(0);
      expect(d.release, id).toBeGreaterThan(0);
      if (d.model !== 'pluck') expect(d.partials.length, id).toBeGreaterThan(0);
      for (const [ratio, amp, detune] of d.partials) {
        expect(ratio > 0 && Number.isFinite(ratio), id).toBe(true);
        expect(amp > 0 && amp <= 1, id).toBe(true);
        expect(Number.isFinite(detune), id).toBe(true);
      }
      if (d.lowpass) expect(d.lowpass.min).toBeLessThan(d.lowpass.max);
      if (d.vibrato) expect(d.vibrato.rate > 0 && d.vibrato.cents > 0 && d.vibrato.delay >= 0, id).toBe(true);
      if (d.model === 'mallet') expect(d.partialDecay).toHaveLength(d.partials.length);
    }
  });

  it('钢琴、电钢琴、纯音保持原来的分音', () => {
    expect(SYNTH_DEFS.piano.partials).toEqual([
      [1, 1, -2],
      [1, 0.5, 3],
      [2, 0.45, 0],
      [3, 0.22, 0],
      [4, 0.12, 0],
      [5, 0.07, 0],
      [6, 0.04, 0],
    ]);
    expect(SYNTH_DEFS.sine.partials).toEqual([[1, 1, 0]]);
    for (const id of ['piano', 'epiano', 'sine'] as const) expect(SYNTH_DEFS[id]).toMatchObject({ model: 'struck', peak: 0.32, attack: 0.006, release: 0.12 });
  });

  it('持续音按时值持续，槌击与拨弦自然衰减', () => {
    for (const id of ['organ', 'strings', 'flute'] as const) {
      expect(SYNTH_DEFS[id].model).toBe('sustain');
      expect(voiceTail(id, 60, 4)).toBeGreaterThan(4);
    }
    expect(SYNTH_DEFS.marimba.model).toBe('mallet');
    expect(SYNTH_DEFS.guitar.model).toBe('pluck');
    // 槌击不随时值延长：4 秒的音也只响一两秒
    expect(voiceTail('marimba', 60, 4)).toBeLessThan(4);
    expect(malletDecay(40)).toBeGreaterThan(malletDecay(84));
    expect(pluckT60(40)).toBeGreaterThan(pluckT60(84));
  });

  it('马林巴的分音非谐（1、3.9、9.2）', () => {
    expect(SYNTH_DEFS.marimba.partials.map((p) => p[0])).toEqual([1, 3.93, 9.24]);
  });

  it('设置取值 = 合成 + 采样 + 随机，各有中英文名称', () => {
    expect(TIMBRE_SETTINGS).toEqual([...SYNTH_TIMBRES, ...SAMPLED_TIMBRES, 'random']);
    for (const id of TIMBRE_SETTINGS) {
      expect(zh[`settings.timbre.${id}`], id).toBeTruthy();
      expect(en[`settings.timbre.${id}`], id).toBeTruthy();
    }
  });
});

describe('软限幅', () => {
  it('0.8 以内完全线性，之上单调且不超过 0.99', () => {
    const c = softClipCurve(4097, 2);
    const at = (u: number) => c[Math.round(((u / 2 + 1) / 2) * 4096)];
    for (const u of [-0.75, -0.5, 0, 0.3, 0.79]) expect(at(u)).toBeCloseTo(u, 3);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    expect(Math.max(...c.map(Math.abs))).toBeLessThan(0.99 + 1e-6);
    expect(at(1.2)).toBeLessThan(0.99);
    expect(at(1.2)).toBeGreaterThan(0.9);
  });
});

describe('随机音色', () => {
  it('只从离线乐器中选，不含纯音与未下载的采样乐器', () => {
    const seen = new Set<string>();
    const rand = seededRandom(7);
    let prev = null as ReturnType<typeof pickRandomTimbre> | null;
    for (let i = 0; i < 500; i++) {
      const t = pickRandomTimbre(prev, [], rand);
      expect(RANDOM_POOL).toContain(t);
      expect(isSampled(t)).toBe(false);
      expect(t).not.toBe(prev);
      seen.add(t);
      prev = t;
    }
    expect(seen.size).toBe(RANDOM_POOL.length);
    expect(seen.has('sine')).toBe(false);
  });

  it('已下载就绪的采样乐器加入候选', () => {
    const loaded: SampledTimbre[] = ['sampled-guitar'];
    const seen = new Set<string>();
    const rand = seededRandom(3);
    for (let i = 0; i < 500; i++) seen.add(pickRandomTimbre(null, loaded, rand));
    expect(seen.has('sampled-guitar')).toBe(true);
    for (const id of SAMPLED_TIMBRES) if (id !== 'sampled-guitar') expect(seen.has(id)).toBe(false);
  });

  it('rand 取到边界值也不越界', () => {
    expect(RANDOM_POOL).toContain(pickRandomTimbre(null, [], () => 0));
    expect(RANDOM_POOL).toContain(pickRandomTimbre(null, [], () => 0.9999999));
  });
});

describe('Karplus-Strong 拨弦', () => {
  const rms = (a: Float32Array, from = 0, to = a.length) => {
    let s = 0;
    for (let i = from; i < to; i++) s += a[i] * a[i];
    return Math.sqrt(s / (to - from));
  };

  it.each([40, 52, 60, 72, 84, 96])('MIDI %i：有限、非静音、峰值归一化、逐渐衰减', (midi) => {
    const sr = 48000;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const { data, rate } = karplusStrong(f, sr, { t60: pluckT60(midi), seconds: 1.5, seed: midi });
    expect(data.length).toBe(1.5 * sr);
    expect(data.every(Number.isFinite)).toBe(true);
    const peak = data.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    expect(peak).toBeCloseTo(1, 5);
    const head = rms(data, 0, sr * 0.1);
    const tail = rms(data, sr * 1.2, sr * 1.4);
    expect(head).toBeGreaterThan(0.05);
    expect(tail).toBeLessThan(head * 0.7);
    // 播放速率校正：整数延迟线带来的误差在 ±3% 以内（高音延迟线短，误差大一些）
    expect(Math.abs(rate - 1)).toBeLessThan(0.03);
  });

  it('同一种子结果相同（可复现）', () => {
    const a = karplusStrong(220, 44100, { t60: 2, seconds: 0.2, seed: 5 }).data;
    const b = karplusStrong(220, 44100, { t60: 2, seconds: 0.2, seed: 5 }).data;
    expect(a).toEqual(b);
  });

  it('校正后的音高准确：自相关的周期 × 速率 = 采样率 / 频率', () => {
    const sr = 48000;
    const f = 261.63;
    const { data, rate } = karplusStrong(f, sr, { t60: 3, seconds: 0.5, seed: 1 });
    // 在 0.1–0.3 秒间找自相关最大的延迟
    const from = sr * 0.1;
    const n = sr * 0.2;
    let best = 0;
    let bestLag = 0;
    for (let lag = 100; lag < 300; lag++) {
      let s = 0;
      for (let i = from; i < from + n; i++) s += data[i] * data[i + lag];
      if (s > best) {
        best = s;
        bestLag = lag;
      }
    }
    // 抛物线插值求精确周期：应为整数延迟 + 0.5；播放时乘以 rate 后频率误差 < 1 音分
    const r = (lag: number) => {
      let s = 0;
      for (let i = from; i < from + n; i++) s += data[i] * data[i + lag];
      return s;
    };
    const [a, b, c] = [r(bestLag - 1), r(bestLag), r(bestLag + 1)];
    const period = bestLag + (0.5 * (a - c)) / (a - 2 * b + c);
    expect(period).toBeCloseTo(pluckDelay(f, sr) + 0.5, 1);
    expect(Math.abs(1200 * Math.log2(((sr / period) * rate) / f))).toBeLessThan(1);
  });
});

describe('持续音包络', () => {
  const sustainDefs = SYNTH_TIMBRES.map((id) => SYNTH_DEFS[id]).filter((d) => d.model === 'sustain');

  it.each([0, 0.001, 0.005, 0.008, 0.012, 0.02, 0.1, 0.5, 2])('时值 %f 秒：先升到峰值再淡出，不会满音量保持到被切断', (dur) => {
    for (const d of sustainDefs) {
      const { attack, hold } = sustainEnvelope(d.attack, dur);
      expect(attack).toBeGreaterThan(0);
      expect(attack).toBeLessThanOrEqual(d.attack);
      // 起音结束不晚于开始淡出（否则淡出被起音斜坡盖掉）
      expect(attack).toBeLessThanOrEqual(hold);
      expect(hold).toBeGreaterThanOrEqual(dur);
      expect(hold).toBeLessThanOrEqual(Math.max(dur, 0.002));
    }
  });

  it('正常时值的音不变：起音用音色自己的设定', () => {
    for (const d of sustainDefs) expect(sustainEnvelope(d.attack, 1)).toEqual({ attack: d.attack, hold: 1 });
  });
});

describe('拨弦波形缓存', () => {
  it('有上限（LRU）：最近用过的不重建，最久未用的被淘汰后按原样重建', () => {
    let built = 0;
    const ctx = {
      sampleRate: 48000,
      createBuffer: (_c: number, len: number) => {
        built++;
        const d = new Float32Array(len);
        return { getChannelData: () => d };
      },
    } as unknown as BaseAudioContext;
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const play = (m: number) => pluckBuffer(ctx, m, hz(m)).buf;
    const first = play(40);
    // 吉他整个音域（每个音的延迟线长度都不同）
    for (let m = 41; m <= 88; m++) play(m);
    expect(built).toBe(49);
    expect(pluckCacheSize()).toBe(PLUCK_CACHE_MAX);
    // 最近的仍在缓存里
    const n = built;
    play(88);
    play(88 - PLUCK_CACHE_MAX + 1);
    expect(built).toBe(n);
    // 最早的已被淘汰：重建（同一种子，内容相同）
    const again = play(40);
    expect(built).toBe(n + 1);
    expect(again).not.toBe(first);
    expect(again.getChannelData(0)).toEqual(first.getChannelData(0));
    expect(pluckCacheSize()).toBe(PLUCK_CACHE_MAX);
  });
});

describe('采样乐器', () => {
  it('每个采样乐器都有升序、可命名的采样点与有效参数', () => {
    expect(Object.keys(INSTRUMENTS).sort()).toEqual([...SAMPLED_TIMBRES].sort());
    for (const id of SAMPLED_TIMBRES) {
      const inst = INSTRUMENTS[id];
      expect(inst.notes.length, id).toBeGreaterThan(5);
      expect([...inst.notes].sort((a, b) => a - b)).toEqual(inst.notes);
      for (const n of inst.notes) expect(noteFile(n), id).toMatch(/^[A-G]s?\d\.mp3$/);
      expect(inst.gain > 0 && inst.release > 0 && inst.sizeMb > 0 && inst.maxShift > 0, id).toBe(true);
      expect(SYNTH_TIMBRES).toContain(inst.fallback);
      expect(inst.base).toMatch(/^https:\/\/.+\/$/);
    }
  });

  it('文件名：升号写作 s', () => {
    expect(noteFile(40)).toBe('E2.mp3');
    expect(noteFile(46)).toBe('As2.mp3');
    expect(noteFile(49)).toBe('Cs3.mp3');
    expect(noteFile(60.5)).toBeNull();
  });

  it('覆盖范围内移调不超过 maxShift，范围外回退（返回 null）', () => {
    for (const id of SAMPLED_TIMBRES) {
      const inst = INSTRUMENTS[id];
      const lo = inst.notes[0];
      const hi = inst.notes.at(-1)!;
      for (let m = lo; m <= hi; m += 0.5) {
        const p = pickSample(m, inst);
        expect(p, `${id} ${m}`).not.toBeNull();
        expect(Math.abs(m - p!.sample)).toBeLessThanOrEqual(inst.maxShift);
      }
      expect(pickSample(lo - inst.maxShift - 0.5, inst)).toBeNull();
      expect(pickSample(hi + inst.maxShift + 0.5, inst)).toBeNull();
    }
    // 吉他采样到 C#5，最高可移到 E5
    expect(pickSample(76, INSTRUMENTS['sampled-guitar'])).toMatchObject({ sample: 73, file: 'Cs5.mp3' });
  });
});
