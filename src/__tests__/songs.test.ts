import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStore } from '../engine/progress';
import { barLength, beatLength, parseMelody } from '../songs/format';
import { SONG_COUNT } from '../songs/count';
import { SONGS, songById } from '../songs/library';
import {
  MAX_SPAN,
  VOICE_RANGE,
  accompanimentEvents,
  barChords,
  fittingKeys,
  melodyOf,
  noteTimes,
  placeSong,
  fitsTreble8vb,
  randomKey,
  realize,
  songClicks,
  songScore,
  songTags,
  spellNote,
  type Voice,
} from '../songs/realize';
import { recordPractice, recordSing } from '../songs/results';
import { centsOff, scoreSinging, type PitchFrame } from '../songs/scoring';
import { pitchName } from '../music/notation';

const VOICES: Voice[] = ['low', 'high'];

describe('旋律记法', () => {
  it('解析音级、八度、升降与时值', () => {
    const m = parseMelody("1 #4_ b7,_ 1'. 0_ | 5 - -_ 3__ 3__ |");
    expect(m.notes.map((n) => n.semi)).toEqual([0, 6, -2, 12, null, 7, 4, 4]);
    expect(m.notes.map((n) => n.dur)).toEqual([1, 0.5, 0.5, 1.5, 0.5, 2.5, 0.25, 0.25]);
    expect(m.bars).toEqual([4, 3]);
    expect(m.notes[5].start).toBe(4);
    expect(m.notes[5].bar).toBe(1);
  });

  it('附点八分与跨小节延长', () => {
    const m = parseMelody('1._ 2__ 3 - | - 4 |');
    expect(m.notes.map((n) => n.dur)).toEqual([0.75, 0.25, 3, 1]);
    expect(m.bars).toEqual([3, 2]);
  });

  it('非法记号报错', () => {
    expect(() => parseMelody('1 8 |')).toThrow();
    expect(() => parseMelody('- 1 |')).toThrow();
    expect(() => parseMelody("#0 |")).toThrow();
  });
});

describe('曲库数据', () => {
  it('至少 40 首，id 不重复，每级都有', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(40);
    expect(SONG_COUNT).toBe(SONGS.length); // 首页入口卡片用的曲目数
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
    for (const lv of [1, 2, 3, 4, 5]) expect(SONGS.filter((s) => s.level === lv).length).toBeGreaterThanOrEqual(5);
    expect(songById['twinkle'].title.zh).toBe('小星星');
  });

  it('每首都有中英文标题与出处', () => {
    for (const s of SONGS) {
      expect(s.title.zh.trim(), s.id).not.toBe('');
      expect(s.title.en.trim(), s.id).not.toBe('');
      expect(s.source.zh.trim(), s.id).not.toBe('');
      expect(s.source.en.trim(), s.id).not.toBe('');
      expect(s.title.en, s.id).not.toMatch(/[一-鿿]/);
      expect(s.source.en, s.id).not.toMatch(/[一-鿿]/);
    }
  });

  it.each(SONGS.map((s) => [s.id, s] as const))('%s：小节时值与拍号、弱起相符，末小节补足弱起', (_, s) => {
    const m = parseMelody(s.melody);
    const bl = barLength(s.meter);
    const pickup = s.pickup ?? 0;
    const bars = [...m.bars];
    if (pickup) expect(bars.shift()).toBeCloseTo(pickup);
    const last = bars.pop()!;
    for (const [i, b] of bars.entries()) expect(b, `第 ${i + 1} 小节`).toBeCloseTo(bl);
    expect(last + pickup, '末小节 + 弱起').toBeCloseTo(bl);
    // 以音结尾（不以休止开头）
    expect(m.notes[0].semi !== null || m.notes.length > 1).toBe(true);
    expect(m.notes.some((n) => n.semi !== null)).toBe(true);
  });

  it.each(SONGS.map((s) => [s.id, s] as const))('%s：音域不超过八度加四度，两种声部都有合适的调', (_, s) => {
    const semis = melodyOf(s).notes.flatMap((n) => (n.semi === null ? [] : [n.semi]));
    expect(Math.max(...semis) - Math.min(...semis)).toBeLessThanOrEqual(MAX_SPAN);
    for (const v of VOICES) {
      expect(fittingKeys(s, v).length).toBeGreaterThanOrEqual(3);
      for (let k = 0; k < 5; k++) {
        const pc = randomKey(s, v);
        const r = realize(s, pc, v);
        const ms = r.midis.filter((x): x is number => x !== null);
        expect(Math.min(...ms)).toBeGreaterThanOrEqual(VOICE_RANGE[v][0]);
        expect(Math.max(...ms)).toBeLessThanOrEqual(VOICE_RANGE[v][1]);
      }
    }
  });

  it('任意调都能落位（不合适的调超出量有限）', () => {
    for (const s of SONGS)
      for (const v of VOICES)
        for (let pc = 0; pc < 12; pc++) expect(placeSong(s, pc, v).overflow, `${s.id} ${v} ${pc}`).toBeLessThanOrEqual(8);
  });

  it('自动标签', () => {
    expect(songTags(songById['d3-2'])).toContain('compound');
    expect(songTags(songById['greensleeves'])).toEqual(expect.arrayContaining(['minor', 'pickup', 'dotted', 'chromatic']));
    expect(songTags(songById['d5-2'])).toContain('sixteenth');
    expect(songTags(songById['d3-5'])).toContain('tie');
    expect(songTags(songById['my-bonnie'])).toContain('tie');
    expect(songTags(songById['d1-1'])).toContain('step');
    expect(songTags(songById['d1-1'])).not.toContain('leap');
    expect(songTags(songById['d5-1'])).toContain('leap');
    expect(songTags(songById['d2-6'])).toContain('pentatonic');
    expect(songTags(songById['d2-5'])).toContain('rest');
    expect(songTags(songById['silent-night'])).not.toContain('dotted');
  });
});

describe('移调与记谱', () => {
  it('小星星在 C 大调高声部：C4 起', () => {
    const r = realize(songById['twinkle'], 0, 'high');
    expect(r.midis.slice(0, 4)).toEqual([60, 60, 67, 67]);
  });

  it('小调按 la 主音：A 小调的绿袖子从 A 开始', () => {
    const r = realize(songById['greensleeves'], 9, 'high');
    expect(r.midis[0]! % 12).toBe(9);
    const sc = songScore(r, 'movable', 'high');
    expect(sc.fifths).toBe(0);
    // 升 sol 写作 G♯，升 fa 写作 F♯
    const names = sc.notes.flatMap((g) => g.map((p) => pitchName(p, false)));
    expect(names).toContain('G♯');
    expect(names).toContain('F♯');
    expect(sc.lyrics![0]).toBe('do');
  });

  it('变化辅助音按简谱音级拼写（升 re 写 D♯）', () => {
    const r = realize(songById['d5-5'], 0, 'high');
    const i = r.notes.findIndex((n) => n.digit === 2 && n.alt === 1);
    expect(pitchName(spellNote(r.midis[i]!, 2, r), false)).toBe('D♯');
  });

  it('五线谱包含时值、拍号、弱起与唱名', () => {
    const s = songById['oh-susanna'];
    const r = realize(s, 2, 'low');
    const sc = songScore(r, 'jianpu', 'low');
    expect(sc.durs!.length).toBe(sc.notes.length);
    expect(sc.lyrics!.length).toBe(sc.notes.length);
    expect(sc.meter).toEqual([4, 4]);
    expect(sc.pickup).toBe(1);
    expect(sc.lyrics!.slice(0, 3)).toEqual(['1', '2', '3']);
  });

  it('低声部用八度高音谱号（实际音高不变），高声部不用', () => {
    const r = realize(songById['twinkle'], 7, 'low'); // G 大调低声部
    const sc = songScore(r, 'movable', 'low');
    expect(sc.clef).toBe('treble8vb');
    // 记的是实际音高（不做显示移位）
    expect(sc.notes.flat().map((p) => p.midi)).toEqual(r.midis.filter((m) => m !== null));
    expect(Math.min(...r.midis.filter((m): m is number => m !== null))).toBeLessThan(60);
    const hi = songScore(realize(songById['twinkle'], 0, 'high'), 'movable', 'high');
    expect(hi.clef).toBeUndefined();
    let fit = 0;
    let total = 0;
    const miss: string[] = [];
    for (const s of SONGS)
      for (const k of fittingKeys(s, 'low')) {
        total++;
        if (fitsTreble8vb(realize(s, k, 'low').midis.filter((m): m is number => m !== null))) fit++;
        else miss.push(`${s.id}@${k}`);
      }
    // 曲库里每首歌在低声部的每个合适的调上都能用八度高音谱号
    expect(miss).toEqual([]);
    expect(fit).toBe(total);
  });

  it('休止为空音组与空歌词', () => {
    const r = realize(songById['d2-5'], 0, 'high');
    const sc = songScore(r, 'movable', 'high');
    const i = sc.notes.findIndex((g) => g.length === 0);
    expect(i).toBeGreaterThan(0);
    expect(sc.lyrics![i]).toBe('');
  });

  it('节拍器按小节网格，弱起从相应拍开始', () => {
    const s = songById['my-bonnie']; // 3/4，弱起一拍
    const r = realize(s, 0, 'high');
    const clicks = songClicks(r, 60, 0);
    expect(clicks[0].time).toBeCloseTo(0);
    expect(clicks[0].accent).toBe(false);
    expect(clicks[1].accent).toBe(true);
    expect(clicks.length).toBe(Math.round(r.length));
    // 6/8 一拍为附点四分
    expect(beatLength([6, 8])).toBe(1.5);
    const row = realize(songById['row-your-boat'], 0, 'high');
    expect(songClicks(row, 60, 0).length).toBe(16);
  });

  it('伴奏：每小节一个和弦，结尾回到主和弦', () => {
    const r = realize(songById['twinkle'], 0, 'high');
    const ch = barChords(r);
    expect(ch.length).toBe(12);
    expect(ch[0]).toBe('I');
    expect(ch[ch.length - 1]).toBe('I');
    expect(ch[2]).toBe('IV'); // 4 4 3 3
    expect(ch[3]).toBe('V'); // 2 2 1 -
    const ev = accompanimentEvents(r, 90);
    const low = Math.min(...r.midis.filter((m): m is number => m !== null));
    for (const e of ev) expect(Math.max(...e.notes)).toBeLessThan(low);
  });
});

describe('跟唱评分', () => {
  const song = songById['d1-1'];
  const r = realize(song, 0, 'high');
  const bpm = 60;
  const times = noteTimes(r, bpm);
  const targets = r.notes.map((_, i) => ({ ...times[i], midi: r.midis[i] }));

  /** 合成音高轨迹：每 20ms 一帧，sing(i) 返回第 i 个音唱的 MIDI（null 为不出声）。 */
  const track = (sing: (i: number, target: number) => number | null, lag = 0): PitchFrame[] => {
    const frames: PitchFrame[] = [];
    const end = times[times.length - 1].end;
    for (let t = 0; t < end; t += 0.02) {
      const i = times.findIndex((w) => t >= w.start && t < w.end);
      const tgt = r.midis[i];
      frames.push({ t: t + lag, midi: tgt === null || i < 0 ? null : sing(i, tgt) });
    }
    return frames;
  };

  it('唱准得满分', () => {
    const res = scoreSinging(targets, track((_, m) => m + 0.1));
    expect(res.accuracy).toBe(100);
    expect(res.notes.every((n) => n.ok)).toBe(true);
    expect(res.notes[0].cents).toBe(10);
  });

  it('不计八度', () => {
    expect(scoreSinging(targets, track((_, m) => m - 12)).accuracy).toBe(100);
    expect(centsOff(48.3, 60)).toBeCloseTo(30);
  });

  it('偏 60 音分算唱错，偏 40 音分算唱准', () => {
    expect(scoreSinging(targets, track((_, m) => m + 0.6)).accuracy).toBe(0);
    expect(scoreSinging(targets, track((_, m) => m - 0.4)).accuracy).toBe(100);
  });

  it('唱错的音与没唱的音', () => {
    const res = scoreSinging(
      targets,
      track((i, m) => (i === 1 ? m + 2 : i === 2 ? null : m)),
    );
    expect(res.notes[1].ok).toBe(false);
    expect(res.notes[1].cents).toBe(200);
    expect(res.notes[2].ok).toBe(false);
    expect(res.notes[2].cents).toBeNull();
    expect(res.correct).toBe(res.total - 2);
    expect(res.accuracy).toBe(Math.round(((res.total - 2) / res.total) * 100));
  });

  it('起音稍晚（100ms）仍算唱准', () => {
    expect(scoreSinging(targets, track((_, m) => m, 0.1)).accuracy).toBe(100);
  });

  it('休止不计分', () => {
    const r2 = realize(songById['d2-5'], 0, 'high');
    const t2 = noteTimes(r2, 80).map((w, i) => ({ ...w, midi: r2.midis[i] }));
    const res = scoreSinging(t2, []);
    expect(res.total).toBe(r2.midis.filter((m) => m !== null).length);
    expect(res.notes.filter((n) => n.ok === null).length).toBe(r2.midis.filter((m) => m === null).length);
  });
});

describe('曲库记录', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('旧数据没有 songs 字段时补上空记录', () => {
    mem.set('earforge:v1', JSON.stringify({ version: 1, settings: {}, exercises: {}, daily: {} }));
    expect(loadStore().songs).toEqual({});
    expect(loadStore().settings.onboarded).toBe(true);
  });

  it('记录最高分、次数，不影响每日题数', () => {
    const s = loadStore();
    recordSing(s, 'twinkle', 60, 1000);
    recordSing(s, 'twinkle', 90, 2000);
    recordSing(s, 'twinkle', 70, 3000);
    recordPractice(s, 'mary-lamb', 4000);
    expect(s.songs!.twinkle).toEqual({ best: 90, attempts: 3, practiced: 0, last: 3000, lastScore: 70 });
    expect(s.songs!['mary-lamb'].practiced).toBe(1);
    expect(s.daily).toEqual({});
  });
});
