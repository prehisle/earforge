import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, MAX_SHIFT, SAMPLE_HIGH, SAMPLE_LOW, SAMPLE_NOTES, pickSample, sampleFile } from '../audio/sampler';

describe('采样文件名', () => {
  it.each([
    [21, 'A0.mp3'],
    [24, 'C1.mp3'],
    [36, 'C2.mp3'],
    [39, 'Ds2.mp3'],
    [42, 'Fs2.mp3'],
    [45, 'A2.mp3'],
    [60, 'C4.mp3'],
    [69, 'A4.mp3'],
    [96, 'C7.mp3'],
    [108, 'C8.mp3'],
  ])('MIDI %i → %s', (m, f) => expect(sampleFile(m)).toBe(f));

  it('非小三度采样点没有文件', () => {
    for (const m of [61, 62, 64, 65, 67, 68, 70, 71]) expect(sampleFile(m)).toBeNull();
    expect(sampleFile(60.5)).toBeNull();
  });

  it('C2 到 C7 共 21 个采样，均有文件名', () => {
    expect(SAMPLE_NOTES).toHaveLength(21);
    expect(SAMPLE_NOTES[0]).toBe(SAMPLE_LOW);
    expect(SAMPLE_NOTES.at(-1)).toBe(SAMPLE_HIGH);
    const files = SAMPLE_NOTES.map(sampleFile);
    expect(files.every((f) => f !== null)).toBe(true);
    expect(new Set(files).size).toBe(21);
  });
});

describe('选取采样', () => {
  it('采样点本身不移调', () => {
    for (const n of SAMPLE_NOTES) expect(pickSample(n)).toEqual({ sample: n, file: sampleFile(n), rate: 1 });
  });

  it('其他音高取最近采样，速率 = 2^(偏移/12)', () => {
    expect(pickSample(61)).toMatchObject({ sample: 60, file: 'C4.mp3' });
    expect(pickSample(61)!.rate).toBeCloseTo(2 ** (1 / 12));
    expect(pickSample(62)).toMatchObject({ sample: 63, file: 'Ds4.mp3' });
    expect(pickSample(62)!.rate).toBeCloseTo(2 ** (-1 / 12));
    expect(pickSample(70)).toMatchObject({ sample: 69, file: 'A4.mp3' });
    expect(pickSample(71)).toMatchObject({ sample: 72, file: 'C5.mp3' });
  });

  it('采样吉他：按各采样实测的音高偏差反向校正（偏低的采样放快、偏高的放慢）', () => {
    const g = INSTRUMENTS['sampled-guitar'];
    for (const n of g.notes) {
      const cents = g.tune![n];
      expect(Math.abs(cents)).toBeLessThan(10);
      expect(pickSample(n, g)!.rate).toBeCloseTo(2 ** (-cents / 1200), 12);
      expect(pickSample(n + 1, g)!.rate).toBeCloseTo(2 ** ((100 - cents) / 1200), 12);
    }
    expect(pickSample(55, g)!.rate).toBeGreaterThan(1); // G3 偏低 7.2 音分
    expect(pickSample(64, g)!.rate).toBeLessThan(1); // E4 偏高 5.6 音分
    // 没有校正表的乐器不变
    expect(pickSample(60, INSTRUMENTS['sampled-violin'])!.rate).toBe(1);
  });

  it('覆盖范围内移调不超过 ±1.5 半音', () => {
    for (let m = SAMPLE_LOW - 1; m <= SAMPLE_HIGH + 1; m += 0.25) {
      const p = pickSample(m)!;
      expect(p).not.toBeNull();
      expect(Math.abs(m - p.sample)).toBeLessThanOrEqual(MAX_SHIFT);
      expect(p.rate).toBeCloseTo(2 ** ((m - p.sample) / 12));
    }
  });

  it('边界：B1 / C#7 仍可用，再往外返回 null（回退合成钢琴）', () => {
    expect(pickSample(35)).toMatchObject({ sample: 36, file: 'C2.mp3' });
    expect(pickSample(34.5)).toMatchObject({ sample: 36 });
    expect(pickSample(97)).toMatchObject({ sample: 96, file: 'C7.mp3' });
    expect(pickSample(97.5)).toMatchObject({ sample: 96 });
    expect(pickSample(34)).toBeNull();
    expect(pickSample(98)).toBeNull();
    expect(pickSample(21)).toBeNull();
    expect(pickSample(NaN)).toBeNull();
  });
});
