import { useEffect, useSyncExternalStore } from 'react';
import { playExtra } from '../audio/extra';
import { midi, type MidiStatus } from '../audio/midi';

/** MIDI 键盘的连接状态 */
export function useMidiStatus(): MidiStatus {
  return useSyncExternalStore(midi.subscribe, midi.getStatus);
}

/** 按设置开关 MIDI 输入，并把按下的琴键即时发声（叠加播放，不打断题目）。在 App 顶层调用一次。 */
export function useMidiInput(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void midi.enable();
    const off = midi.onNote((note, velocity) => {
      void playExtra([{ notes: [note], time: 0, dur: 0.9, velocity: 0.35 + velocity * 0.55 }]);
    });
    return () => {
      off();
      midi.disable();
    };
  }, [enabled]);
}
