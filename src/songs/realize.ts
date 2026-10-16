// 把首调记写的旋律落到具体的调与歌者音区：音高、五线谱、播放事件、伴奏与标签。纯函数。

import type { NoteEvent } from '../audio/engine';
import { chooseClef, keyFifths, pitchStep, spellSimple, spellWithLetter, type Pitch, type Score } from '../music/notation';
import { MAJOR, MODE_BY_ID, mod, nameInSystem, prefersFlat, type ModeDef, type NamingSystem } from '../music/theory';
import { barLength, beatLength, beatsPerBar, parseMelody, semiSpan, type ParsedMelody, type SongNote } from './format';
import type { SongDef, SongTag } from './library';

export type Voice = 'low' | 'high';

/** 歌者的舒适音区（MIDI，含两端）：低声部 G2–E4，高声部 G3–E5。 */
export const VOICE_RANGE: Record<Voice, [number, number]> = { low: [43, 64], high: [55, 76] };

/** 一首歌最多跨多宽（八度 + 纯四度）。 */
export const MAX_SPAN = 17;

const cache = new Map<string, ParsedMelody>();
/** 解析（带缓存）。 */
export function melodyOf(song: SongDef): ParsedMelody {
  let m = cache.get(song.id);
  if (!m) {
    m = parseMelody(song.melody);
    cache.set(song.id, m);
  }
  return m;
}

export function modeOfSong(song: SongDef): ModeDef {
  return song.mode === 'minor' ? MODE_BY_ID.minor : MAJOR;
}

/** 主音相对 do 的半音数：小调按 la 作主音书写。 */
export function tonicSemi(song: SongDef): number {
  return song.mode === 'minor' ? 9 : 0;
}

/** 落到某调某声部时 do 的 MIDI 值，以及超出音区的半音数（0 表示完全落在音区内）。 */
export function placeSong(song: SongDef, tonicPc: number, voice: Voice): { doMidi: number; overflow: number } {
  const m = melodyOf(song);
  const semis = m.notes.flatMap((n) => (n.semi === null ? [] : [n.semi]));
  const lo = Math.min(...semis);
  const hi = Math.max(...semis);
  const [L, H] = VOICE_RANGE[voice];
  const doPc = mod(tonicPc - tonicSemi(song), 12);
  let best = { doMidi: 0, overflow: Infinity, off: Infinity };
  for (let d = doPc + 24; d <= 96; d += 12) {
    const overflow = Math.max(0, L - (d + lo)) + Math.max(0, d + hi - H);
    // 平手时让旋律中心靠近音区中心
    const off = Math.abs(d + (lo + hi) / 2 - (L + H) / 2);
    if (overflow < best.overflow || (overflow === best.overflow && off < best.off)) best = { doMidi: d, overflow, off };
  }
  return { doMidi: best.doMidi, overflow: best.overflow };
}

/** 能完全落在该声部音区内的调（主音音级）。 */
export function fittingKeys(song: SongDef, voice: Voice): number[] {
  return [...Array(12).keys()].filter((pc) => placeSong(song, pc, voice).overflow === 0);
}

/** 随机选一个合适的调（都不合适时取超出最少的）。 */
export function randomKey(song: SongDef, voice: Voice, rand = Math.random): number {
  const fit = fittingKeys(song, voice);
  if (fit.length) return fit[Math.floor(rand() * fit.length)];
  const all = [...Array(12).keys()].sort((a, b) => placeSong(song, a, voice).overflow - placeSong(song, b, voice).overflow);
  return all[0];
}

/** 一首歌在具体调、声部下的实现。 */
export interface Realized {
  song: SongDef;
  tonicPc: number;
  mode: ModeDef;
  /** 与 melody.notes 一一对应；休止为 null */
  midis: (number | null)[];
  notes: SongNote[];
  /** 超出音区的半音数 */
  overflow: number;
  /** 总长（四分音符），从弱起开始 */
  length: number;
}

export function realize(song: SongDef, tonicPc: number, voice: Voice): Realized {
  const m = melodyOf(song);
  const { doMidi, overflow } = placeSong(song, tonicPc, voice);
  const last = m.notes[m.notes.length - 1];
  return {
    song,
    tonicPc,
    mode: modeOfSong(song),
    midis: m.notes.map((n) => (n.semi === null ? null : doMidi + n.semi)),
    notes: m.notes,
    overflow,
    length: last.start + last.dur,
  };
}

/** 在调中拼写：字母由简谱音级决定（#2 写作升 re 而非降 mi），do 的字母随调号的升降习惯。 */
export function spellNote(midi: number, digit: number, r: Realized): Pitch {
  const doPc = mod(r.tonicPc - tonicSemi(r.song), 12);
  const flat = keyFifths(r.tonicPc, r.mode) < 0 || (keyFifths(r.tonicPc, r.mode) === 0 && prefersFlat(r.tonicPc, r.mode));
  const doLetter = spellSimple(doPc, flat).letter;
  return spellWithLetter(midi, (doLetter + digit - 1) % 7);
}

/** 记谱时整体移动的八度：落在大谱表时尽量移到单一谱表（演唱不计八度）。 */
export function displayShift(midis: number[], voice: Voice): number {
  const steps = (shift: number) => midis.map((m) => pitchStep(spellSimple(m + shift)));
  if (chooseClef(steps(0)) !== 'grand') return 0;
  const order = voice === 'low' ? [-12, 12] : [12, -12];
  return order.find((s) => chooseClef(steps(s)) !== 'grand') ?? 0;
}

/** 生成五线谱（含时值、拍号、弱起与唱名歌词）。 */
export function songScore(r: Realized, naming: NamingSystem, voice: Voice, withLyrics = true): Score {
  const pitched = r.midis.filter((m): m is number => m !== null);
  const shift = displayShift(pitched, voice);
  return {
    notes: r.notes.map((n, i) => {
      const m = r.midis[i];
      return m === null ? [] : [spellNote(m + shift, n.digit, r)];
    }),
    fifths: keyFifths(r.tonicPc, r.mode),
    stems: true,
    durs: r.notes.map((n) => n.dur),
    meter: r.song.meter,
    pickup: r.song.pickup,
    lyrics: withLyrics ? solfege(r, naming) : undefined,
  };
}

/** 每个音的唱名（按用户的命名体系），休止为空串。 */
export function solfege(r: Realized, naming: NamingSystem): string[] {
  return r.midis.map((m) => (m === null ? '' : nameInSystem(m, r.tonicPc, naming, r.mode)));
}

/** 每个四分音符多少秒（bpm 以拍为单位，6/8 一拍 = 附点四分）。 */
export function secPerQuarter(meter: [number, number], bpm: number): number {
  return 60 / bpm / beatLength(meter);
}

/** 各音的时间窗（秒，相对旋律开始）。 */
export function noteTimes(r: Realized, bpm: number): { start: number; end: number }[] {
  const q = secPerQuarter(r.song.meter, bpm);
  return r.notes.map((n) => ({ start: n.start * q, end: (n.start + n.dur) * q }));
}

/** 旋律的播放事件（从 offset 秒开始）。 */
export function melodyEvents(r: Realized, bpm: number, offset = 0): NoteEvent[] {
  const q = secPerQuarter(r.song.meter, bpm);
  return r.notes.flatMap((n, i) => {
    const m = r.midis[i];
    if (m === null) return [];
    return [{ notes: [m], time: offset + n.start * q, dur: Math.max(0.08, n.dur * q * 0.94), velocity: 0.7 }];
  });
}

/** 预备拍：一整小节，重拍更响。返回事件与时长（秒）。 */
export function countIn(meter: [number, number], bpm: number, offset = 0): { events: NoteEvent[]; dur: number } {
  const n = beatsPerBar(meter);
  const beat = 60 / bpm;
  const events: NoteEvent[] = Array.from({ length: n }, (_, i) => ({
    kind: 'click',
    notes: [],
    time: offset + i * beat,
    dur: 0.05,
    accent: i === 0,
    velocity: 0.9,
  }));
  return { events, dur: n * beat };
}

/** 整首歌期间的节拍器：按小节网格打拍（弱起时从小节中相应的拍开始），只打落在旋律之内的拍。 */
export function songClicks(r: Realized, bpm: number, offset: number): NoteEvent[] {
  const bl = beatLength(r.song.meter);
  const per = beatsPerBar(r.song.meter);
  const q = secPerQuarter(r.song.meter, bpm);
  const first = (r.song.pickup ?? 0) - barLength(r.song.meter); // 弱起所在小节的第一拍（可能为负）
  const out: NoteEvent[] = [];
  for (let j = 0; first + j * bl < r.length - 1e-9; j++) {
    const pos = first + j * bl;
    if (pos < -1e-9) continue;
    out.push({ kind: 'click', notes: [], time: offset + pos * q, dur: 0.05, accent: j % per === 0, velocity: 0.3 });
  }
  return out;
}

// ───────────── 伴奏：每小节一个柔和的主 / 下属 / 属和弦 ─────────────

type Fn = 'I' | 'IV' | 'V';

/** 和弦音（相对主音的半音），属和弦一律用导音（和声小调）。 */
function chordTones(fn: Fn, minor: boolean): number[] {
  if (fn === 'I') return minor ? [0, 3, 7] : [0, 4, 7];
  if (fn === 'IV') return minor ? [5, 8, 0] : [5, 9, 0];
  return [7, 11, 2];
}

/** 为每个完整小节选和弦：按时值加权数小节里的和弦音，平手时取主和弦。 */
export function barChords(r: Realized): (Fn | null)[] {
  const minor = r.song.mode === 'minor';
  const bl = barLength(r.song.meter);
  const pickup = r.song.pickup ?? 0;
  const nBars = Math.ceil((r.length - pickup) / bl - 1e-9);
  const out: (Fn | null)[] = [];
  for (let b = 0; b < nBars; b++) {
    const from = pickup + b * bl;
    const to = from + bl;
    const weight: Record<Fn, number> = { I: 0.01, IV: 0, V: 0 };
    r.notes.forEach((n, i) => {
      const m = r.midis[i];
      if (m === null) return;
      const overlap = Math.min(to, n.start + n.dur) - Math.max(from, n.start);
      if (overlap <= 0) return;
      const rel = mod(m - r.tonicPc, 12);
      // 强拍上的音权重更高
      const w = overlap * (Math.abs(n.start - from) < 1e-9 ? 1.5 : 1);
      for (const fn of ['I', 'IV', 'V'] as Fn[]) if (chordTones(fn, minor).includes(rel)) weight[fn] += w;
    });
    // 最后一小节回到主和弦
    out.push(b === nBars - 1 ? 'I' : (['I', 'IV', 'V'] as Fn[]).reduce((a, f) => (weight[f] > weight[a] ? f : a), 'I'));
  }
  return out;
}

/** 伴奏事件：和弦放在旋律最低音下方。 */
export function accompanimentEvents(r: Realized, bpm: number, offset = 0): NoteEvent[] {
  const q = secPerQuarter(r.song.meter, bpm);
  const bl = barLength(r.song.meter);
  const pickup = r.song.pickup ?? 0;
  const minor = r.song.mode === 'minor';
  const lowest = Math.min(...r.midis.filter((m): m is number => m !== null));
  // 主音落在旋律最低音下方 5..16 个半音
  let root = lowest - 5 - mod(lowest - 5 - r.tonicPc, 12);
  if (root > lowest - 5) root -= 12;
  return barChords(r).flatMap((fn, b) => {
    if (!fn) return [];
    const tones = chordTones(fn, minor).map((t) => root + t + (fn !== 'I' && t > 7 ? -12 : 0));
    const notes = [...new Set(tones)].sort((a, b) => a - b);
    return [{ notes, time: offset + (pickup + b * bl) * q, dur: bl * q * 0.96, velocity: 0.28 }];
  });
}

/** 给出调性：主和弦 + 第一个音。返回事件与时长（秒）。 */
export function keyHintEvents(r: Realized): { events: NoteEvent[]; dur: number } {
  const first = r.midis.find((m): m is number => m !== null)!;
  // 主和弦放在第一个音附近（不高于它一个八度）
  let root = first - mod(first - r.tonicPc, 12);
  if (first - root < 5) root -= 12;
  const third = r.song.mode === 'minor' ? 3 : 4;
  return {
    events: [
      { notes: [root, root + third, root + 7], time: 0, dur: 1.1, velocity: 0.55 },
      { notes: [first], time: 1.25, dur: 0.9, velocity: 0.75 },
    ],
    dur: 2.3,
  };
}

// ───────────── 标签 ─────────────

/** 由旋律自动判断的标签，加上曲目自带的标签。 */
export function songTags(song: SongDef): SongTag[] {
  const m = melodyOf(song);
  const tags = new Set<SongTag>(song.tags ?? []);
  const pitched = m.notes.filter((n) => n.semi !== null);
  const ivs = pitched.slice(1).map((n, i) => Math.abs(n.semi! - pitched[i].semi!));
  const moves = ivs.filter((x) => x > 0);
  if (moves.length && moves.filter((x) => x <= 2).length / moves.length >= 0.75) tags.add('step');
  if (ivs.some((x) => x >= 5)) tags.add('leap');
  // 附点：附点八分，或单拍子里的附点四分（6/8 的附点四分是一拍，不算）
  if (m.notes.some((n) => n.dur === 0.75 || (n.dur === 1.5 && song.meter[1] !== 8))) tags.add('dotted');
  if (m.notes.some((n) => (n.dur * 4) % 2 === 1)) tags.add('sixteenth');
  if (song.pickup) tags.add('pickup');
  const bl = barLength(song.meter);
  const pickup = song.pickup ?? 0;
  if (m.notes.some((n) => {
    const rel = n.start - pickup;
    const barEnd = pickup + (Math.floor(rel / bl + 1e-9) + 1) * bl;
    return rel >= 0 && n.start + n.dur > barEnd + 1e-9;
  }))
    tags.add('tie');
  if (m.notes.some((n) => n.semi === null)) tags.add('rest');
  if (song.mode === 'minor') tags.add('minor');
  if (song.meter[1] === 8) tags.add('compound');
  if (m.notes.some((n) => n.alt !== 0)) tags.add('chromatic');
  return TAG_ORDER.filter((t) => tags.has(t));
}

export const TAG_ORDER: SongTag[] = ['step', 'leap', 'dotted', 'sixteenth', 'pickup', 'tie', 'rest', 'minor', 'compound', 'chromatic', 'pentatonic'];

export { semiSpan };
