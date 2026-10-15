// MIDI 键盘输入：封装 Web MIDI API，监听所有输入设备的 note-on，并跟踪设备热插拔。
// 浏览器不支持或用户拒绝授权时静默降级（只更新状态，不抛错）。

export type MidiState = 'off' | 'pending' | 'unsupported' | 'denied' | 'ready';

export interface MidiStatus {
  state: MidiState;
  /** 已连接的输入设备名 */
  devices: string[];
}

/** 按下琴键：MIDI 音高与力度（0..1） */
export type NoteListener = (note: number, velocity: number) => void;

class MidiInput {
  private access: MIDIAccess | null = null;
  private requesting: Promise<void> | null = null;
  private enabled = false;
  private notes = new Set<NoteListener>();
  private watchers = new Set<() => void>();
  status: MidiStatus = { state: 'off', devices: [] };

  /** 开启监听。首次调用会请求 MIDI 权限，重复调用无副作用。 */
  async enable(): Promise<void> {
    this.enabled = true;
    if (this.access) {
      this.bind();
      return;
    }
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
      this.setStatus({ state: 'unsupported', devices: [] });
      return;
    }
    this.setStatus({ state: 'pending', devices: [] });
    this.requesting ??= navigator.requestMIDIAccess().then(
      (access) => {
        this.access = access;
        // 设备插拔：重新绑定所有输入
        access.onstatechange = () => this.bind();
        this.bind();
      },
      () => {
        this.requesting = null;
        this.setStatus({ state: 'denied', devices: [] });
      },
    );
    await this.requesting;
  }

  /** 关闭监听（Web MIDI 无法释放权限，只解绑消息处理）。 */
  disable(): void {
    this.enabled = false;
    if (this.access) for (const input of this.access.inputs.values()) input.onmidimessage = null;
    this.setStatus({ state: 'off', devices: [] });
  }

  private bind(): void {
    if (!this.access || !this.enabled) return;
    const devices: string[] = [];
    for (const input of this.access.inputs.values()) {
      if (input.state === 'disconnected') continue;
      input.onmidimessage = (e) => e.data && this.handleMessage(e.data);
      devices.push(input.name || '未命名设备');
    }
    this.setStatus({ state: 'ready', devices });
  }

  /** 解析一条原始 MIDI 消息；只处理 note-on（力度为 0 的 note-on 视为 note-off）。也用于测试与模拟。 */
  handleMessage(data: ArrayLike<number>): void {
    if (!this.enabled || data.length < 3) return;
    const cmd = data[0] & 0xf0;
    if (cmd !== 0x90 || data[2] === 0) return;
    for (const fn of this.notes) fn(data[1], data[2] / 127);
  }

  /** 订阅琴键按下，返回取消订阅函数。 */
  onNote(fn: NoteListener): () => void {
    this.notes.add(fn);
    return () => void this.notes.delete(fn);
  }

  /** 订阅状态变化（供 useSyncExternalStore 使用）。 */
  subscribe = (fn: () => void): (() => void) => {
    this.watchers.add(fn);
    return () => void this.watchers.delete(fn);
  };

  getStatus = (): MidiStatus => this.status;

  private setStatus(s: MidiStatus): void {
    const same = s.state === this.status.state && s.devices.join('\n') === this.status.devices.join('\n');
    if (same) return;
    this.status = s;
    for (const fn of this.watchers) fn();
  }
}

export const midi = new MidiInput();
