import type { NoteEvent } from '../audio/engine';
import type { Level, OptionDef, Settings } from '../engine/types';
import { DEGREES, MAJOR, MODES, cadence, mod, modeById, randInt, type ModeDef } from '../music/theory';

/** 选主音（MIDI）。固定 C 调时为 C4，否则在 G3..F♯4 之间随机。 */
export function chooseTonic(settings: Settings): number {
  return settings.keyMode === 'C' ? 60 : randInt(55, 66);
}

export function cadenceEvents(tonic: number, mode: ModeDef = MAJOR, beat = 0.55): NoteEvent[] {
  const chords = cadence(tonic, mode);
  return chords.map((notes, i) => ({
    notes,
    time: i * beat,
    dur: i === chords.length - 1 ? beat * 1.6 : beat * 0.95,
    velocity: 0.55,
  }));
}

// ───────────── 调式选项与考点 id ─────────────

/** 调性类练习共用的「调式」选项。scoped：各调式分别记录级别与自选考点。 */
export const MODE_OPTION: OptionDef = {
  id: 'mode',
  label: '调式',
  values: MODES.map((m) => ({ id: m.id, label: m.name })),
  default: 'major',
  scoped: true,
};

export const modeOf = (options: Record<string, string>): ModeDef => modeById(options.mode);

/**
 * 考点 id：大调沿用旧 id（如 'd4'、'IV'），其他调式加前缀（如 'minor:d3'、'dorian:IV'）。
 * 同一音级在不同调式里功能不同，掌握度分开统计；旧进度数据无需迁移。
 */
export function modeItem(mode: ModeDef, id: string): string {
  return mode.id === 'major' ? id : `${mode.id}:${id}`;
}

/** 考点所属调式（无前缀为大调）。 */
export function itemMode(item: string): ModeDef {
  return item.includes(':') ? modeById(item.slice(0, item.indexOf(':'))) : MAJOR;
}

/** 去掉调式前缀。 */
export function bareItem(item: string): string {
  return item.slice(item.indexOf(':') + 1);
}

/** 由半音层级生成级别：首层直接列出，之后各层前加「+」；第 chromaticFrom 层起为变化音，用简谱显示。 */
export function degreeLevels(mode: ModeDef, layers: number[][], chromaticFrom: number, sep = ' · '): Level[] {
  return layers.map((layer, i) => {
    const names = layer.map((d) => (i >= chromaticFrom ? DEGREES[d].jianpu : DEGREES[d].movableDo));
    const name = i >= chromaticFrom ? `+ 变化音 ${names.join(' ')}` : `${i ? '+ ' : ''}${names.join(sep)}`;
    return { name, items: layer.map((d) => modeItem(mode, `d${d}`)) };
  });
}

export function melodyEvents(notes: number[], beat = 0.6, start = 0): NoteEvent[] {
  return notes.map((n, i) => ({ notes: [n], time: start + i * beat, dur: beat * 0.95 }));
}

/**
 * 解决到主音的级进路径（Functional Ear Trainer 的核心方法）：
 * do 以下的 re/mi/fa 向下解决，sol/la/ti 向上解决，沿途只经过所选调式的自然音级，
 * 变化音先进到相邻的自然音级。
 */
export function resolutionPath(note: number, tonic: number, mode: ModeDef = MAJOR): number[] {
  const deg = mod(note - tonic, 12);
  if (deg === 0) return [note];
  const up = deg >= 6;
  const target = up ? note + (12 - deg) : note - deg;
  const path = [note];
  const step = up ? 1 : -1;
  for (let m = note + step; up ? m <= target : m >= target; m += step) {
    if (mode.scale.includes(mod(m - tonic, 12))) path.push(m);
  }
  return path;
}

export function resolutionEvents(note: number, tonic: number, mode: ModeDef = MAJOR): NoteEvent[] {
  return melodyEvents(resolutionPath(note, tonic, mode), 0.38);
}

/** 事件整体后移 by 秒。 */
export function shiftEvents(events: NoteEvent[], by: number): NoteEvent[] {
  return events.map((e) => ({ ...e, time: e.time + by }));
}

/** 事件序列的结束时刻（秒）。 */
export function eventsEnd(events: NoteEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.time + e.dur), 0);
}

/** 单音 + 它到 do 的解决（对比试听用；do 本身不再重复）。 */
export function noteWithResolution(note: number, tonic: number, mode: ModeDef = MAJOR): NoteEvent[] {
  const head: NoteEvent[] = [{ notes: [note], time: 0, dur: 1.4 }];
  const res = resolutionEvents(note, tonic, mode);
  return res.length > 1 ? [...head, ...shiftEvents(res, eventsEnd(head) + 0.1)] : head;
}

/** 按相对主音的音级把 MIDI 音映射到选项（不区分八度）；选项 id 形如 'd4' / 'minor:d3'。 */
export function degreeMidiAnswer(choiceIds: string[], tonic: number): (midi: number) => string | null {
  return (midi) => choiceIds.find((id) => Number(bareItem(id).slice(1)) === mod(midi - tonic, 12)) ?? null;
}
