// 麦克风监听器的生命周期：等待授权期间被停止时，授权完成后必须立刻关掉麦克风。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PitchListener } from '../audio/pitch';

function fakeMic() {
  const track = { stop: vi.fn() };
  let grant: () => void = () => {};
  const getUserMedia = vi.fn(
    () =>
      new Promise((r) => {
        grant = () => r({ getTracks: () => [track] });
      }),
  );
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const created = vi.fn();
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        created();
      }
    },
  );
  return { track, grant: () => grant(), created };
}

describe('PitchListener', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('授权完成前调用 stop：授权后立即停止音轨，不创建分析上下文', async () => {
    const mic = fakeMic();
    const l = new PitchListener();
    const started = l.start(() => {});
    l.stop();
    mic.grant();
    await started;
    expect(mic.track.stop).toHaveBeenCalled();
    expect(mic.created).not.toHaveBeenCalled();
  });

  it('创建上下文失败时也关掉麦克风并抛出', async () => {
    const mic = fakeMic();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('no audio');
        }
      },
    );
    const l = new PitchListener();
    const started = l.start(() => {});
    mic.grant();
    await expect(started).rejects.toThrow('no audio');
    expect(mic.track.stop).toHaveBeenCalled();
  });
});
