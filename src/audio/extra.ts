// 叠加播放的薄适配层：音频引擎提供 playExtra（不停止当前声音、叠加播放、返回时长）后直接转发，
// 在此之前用 audio.play 兜底（会打断正在播放的声音）。

import { audio, type NoteEvent } from './engine';

type WithExtra = typeof audio & { playExtra?: (events: NoteEvent[]) => Promise<number> };

export function playExtra(events: NoteEvent[]): Promise<number> {
  const a = audio as WithExtra;
  return a.playExtra ? a.playExtra(events) : audio.play(events);
}
