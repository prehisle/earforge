// 成绩链接的「用时」：不计页面在后台（切到别的应用、锁屏、切换标签页）的时间。
import { describe, expect, it } from 'vitest';
import { activeClock } from '../engine/activeClock';

describe('activeClock', () => {
  it('不计页面隐藏期间的时间', () => {
    let now = 1000;
    let hidden = false;
    const c = activeClock(() => now, () => hidden);
    now += 60_000;
    hidden = true;
    c.update();
    now += 3_600_000; // 切到后台一小时
    hidden = false;
    c.update();
    now += 120_000;
    expect(c.activeMs()).toBe(180_000);
  });

  it('创建时就在后台、重复通知、结束时仍在后台', () => {
    let now = 0;
    let hidden = true;
    const c = activeClock(() => now, () => hidden);
    now = 5_000;
    hidden = false;
    c.update();
    c.update(); // 重复的 visible 通知不影响
    now = 65_000;
    hidden = true;
    c.update();
    c.update();
    now = 999_000;
    expect(c.activeMs()).toBe(60_000);
  });
});
