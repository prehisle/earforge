// 边播边排程（lookahead scheduler）：一次性把整题几十个音的节点全建好，在低端设备上是一个上百毫秒的长任务
// （创建振荡器 / 增益 / 滤波节点本身就慢），出题时界面会卡一下。这里把「建节点」按音头时刻排队，
// 每 TICK_MS 毫秒建好未来 LOOKAHEAD 秒内要响的音；空闲时在 BUDGET_MS 的预算内再往后多建一些（最多 PREFILL 秒），
// 主线程偶尔被占用也不会迟到。各音的发声时刻在入队时就已算定（绝对的 AudioContext 时间），与何时建节点无关。

/** 一个待建的音：t 为音头的 AudioContext 时刻，run 建好它的全部节点 */
export interface Job {
  t: number;
  run: () => void;
}

/** 必须建好的时间窗（秒）：音头早于 现在 + LOOKAHEAD 的音本轮一定建好 */
export const LOOKAHEAD = 0.2;
/** 轮询间隔（毫秒） */
export const TICK_MS = 25;
/** 每轮在必建之外，额外往后预建所用的时间预算（毫秒）：远小于 50 ms 的长任务阈值 */
export const BUDGET_MS = 4;
/** 预建最远到 现在 + PREFILL 秒：主线程被占用几百毫秒也不会迟到；更远的等播到附近再建（停止 / 重播时少做无用功） */
export const PREFILL = 1.5;

export class Pump {
  private i = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cancelled = false;

  private readonly jobs: readonly Job[];
  private readonly clock: () => number;
  private readonly onDone: (p: Pump) => void;

  /**
   * jobs：按 t 升序（相同时刻保持原顺序）。clock：当前 AudioContext 时间。
   * onDone：全部建完或被取消时调用一次（引擎据此从活动列表里移除）。
   */
  constructor(jobs: readonly Job[], clock: () => number, onDone: (p: Pump) => void) {
    this.jobs = jobs;
    this.clock = clock;
    this.onDone = onDone;
  }

  get done(): boolean {
    return this.cancelled || this.i >= this.jobs.length;
  }

  /** 剩余未建的音数（测试用） */
  get pending(): number {
    return this.cancelled ? 0 : this.jobs.length - this.i;
  }

  /** 开始：立即（同步）建好时间窗内的音——第一个音在 50 ms 后就要响，不能等定时器；其余交给定时器。 */
  start(): void {
    this.step(0);
  }

  /** 建好时间窗内的音，再在 budgetMs 内往后预建；没建完则安排下一轮。 */
  private step(budgetMs: number): void {
    this.timer = undefined;
    if (this.done) return this.finish();
    const now = this.clock();
    const t0 = performance.now();
    while (this.i < this.jobs.length) {
      const job = this.jobs[this.i];
      const due = job.t < now + LOOKAHEAD;
      if (!due && (job.t >= now + PREFILL || performance.now() - t0 >= budgetMs)) break;
      this.i++;
      job.run();
    }
    if (this.done) return this.finish();
    this.timer = setTimeout(() => this.step(BUDGET_MS), TICK_MS);
  }

  /** 立即建好剩下的全部（页面转入后台：定时器会被节流到一秒一次甚至暂停，来不及边播边建） */
  flush(): void {
    if (this.done) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    while (this.i < this.jobs.length) this.jobs[this.i++].run();
    this.finish();
  }

  /** 取消：尚未建的音不再发声（已建的由引擎的 stopAll 停止） */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.onDone(this);
  }

  private finish(): void {
    if (this.cancelled) return;
    this.cancelled = true; // 之后的 flush / cancel 不再生效
    this.onDone(this);
  }
}
