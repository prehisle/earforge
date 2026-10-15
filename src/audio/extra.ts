// 叠加播放：不停止当前声音（用于 MIDI 琴键即时发声）。
import { audio, type NoteEvent } from './engine';

export function playExtra(events: NoteEvent[]): Promise<number> {
  return audio.playExtra(events);
}
