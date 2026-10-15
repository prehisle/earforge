import type { NoteEvent } from '../audio/engine';
import type { Settings } from '../engine/types';
import { MAJOR_SCALE, cadence, mod, randInt } from '../music/theory';

/** 选主音（MIDI）。固定 C 调时为 C4，否则在 G3..F♯4 之间随机。 */
export function chooseTonic(settings: Settings): number {
  return settings.keyMode === 'C' ? 60 : randInt(55, 66);
}

export function cadenceEvents(tonic: number, beat = 0.55): NoteEvent[] {
  return cadence(tonic).map((notes, i) => ({
    notes,
    time: i * beat,
    dur: i === 3 ? beat * 1.6 : beat * 0.95,
    velocity: 0.55,
  }));
}

export function melodyEvents(notes: number[], beat = 0.6, start = 0): NoteEvent[] {
  return notes.map((n, i) => ({ notes: [n], time: start + i * beat, dur: beat * 0.95 }));
}

/**
 * 解决到主音的级进路径（Functional Ear Trainer 的核心方法）：
 * do 以下的 re/mi/fa 向下解决，sol/la/ti 向上解决，变化音先进到相邻的自然音级。
 */
export function resolutionPath(note: number, tonic: number): number[] {
  const deg = mod(note - tonic, 12);
  if (deg === 0) return [note];
  const up = deg >= 6;
  const target = up ? note + (12 - deg) : note - deg;
  const path = [note];
  const step = up ? 1 : -1;
  for (let m = note + step; up ? m <= target : m >= target; m += step) {
    if (MAJOR_SCALE.includes(mod(m - tonic, 12))) path.push(m);
  }
  return path;
}

export function resolutionEvents(note: number, tonic: number): NoteEvent[] {
  return melodyEvents(resolutionPath(note, tonic), 0.38);
}
