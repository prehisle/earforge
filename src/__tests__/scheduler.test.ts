// 边播边排程的队列：时间窗、预建预算、后台一次建完、取消。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOOKAHEAD, PREFILL, Pump, TICK_MS, type Job } from '../audio/scheduler';

describe('Pump', () => {
  let now = 0;
  let ran: number[] = [];
  const jobs = (ts: number[]): Job[] => ts.map((t) => ({ t, run: () => ran.push(t) }));
  beforeEach(() => {
    now = 0;
    ran = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += TICK_MS / 1000;
      vi.advanceTimersByTime(TICK_MS);
    }
  };

  it('开始时同步建好时间窗内的音，不预建更远的', () => {
    const done = vi.fn();
    const p = new Pump(jobs([0.05, 0.1, LOOKAHEAD - 0.01, LOOKAHEAD + 0.01, 1]), () => now, done);
    p.start();
    expect(ran).toEqual([0.05, 0.1, LOOKAHEAD - 0.01]);
    expect(p.pending).toBe(2);
    expect(done).not.toHaveBeenCalled();
  });

  it('之后每轮在预算内预建，最远到 PREFILL 秒；全部建完时回调一次', () => {
    const done = vi.fn();
    const p = new Pump(jobs([0, 0.5, 1, PREFILL + 0.5, 3]), () => now, done);
    p.start();
    tick();
    expect(ran).toEqual([0, 0.5, 1]);
    tick(Math.ceil(((3 - PREFILL) * 1000) / TICK_MS) + 2);
    expect(ran).toEqual([0, 0.5, 1, PREFILL + 0.5, 3]);
    expect(p.done).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('flush 立即建完剩余；cancel 后不再建', () => {
    const a = new Pump(jobs([0, 5, 9]), () => now, () => {});
    a.start();
    a.flush();
    expect(ran).toEqual([0, 5, 9]);
    ran = [];
    const done = vi.fn();
    const b = new Pump(jobs([0, 5, 9]), () => now, done);
    b.start();
    b.cancel();
    b.flush();
    tick(400);
    expect(ran).toEqual([0]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('音频时钟停住（上下文被挂起）时不往前建，恢复后接着建', () => {
    const p = new Pump(jobs([0, 2, 4]), () => now, () => {});
    p.start();
    const frozen = now;
    for (let i = 0; i < 100; i++) vi.advanceTimersByTime(TICK_MS);
    expect(ran).toEqual([0]);
    now = frozen;
    tick(200);
    expect(ran).toEqual([0, 2, 4]);
  });
});
