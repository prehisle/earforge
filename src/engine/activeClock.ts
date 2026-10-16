// 练习用时（成绩链接里的「用时」）：从创建起计时，不计页面在后台的时间（切到别的应用、锁屏、切换标签页）。
// 页面可见性变化时调用 update；时钟与可见性可注入，便于测试。

export interface ActiveClock {
  /** 页面可见性变化时调用（重复调用无妨） */
  update(): void;
  /** 到现在为止页面可见的累计毫秒数 */
  activeMs(): number;
}

export function activeClock(
  now: () => number = Date.now,
  isHidden: () => boolean = () => typeof document !== 'undefined' && document.hidden,
): ActiveClock {
  let active = 0;
  /** 最近一次变为可见的时间；在后台时为 null */
  let since: number | null = isHidden() ? null : now();
  return {
    update() {
      const hidden = isHidden();
      if (hidden && since !== null) {
        active += now() - since;
        since = null;
      } else if (!hidden && since === null) since = now();
    },
    activeMs: () => active + (since === null ? 0 : now() - since),
  };
}
