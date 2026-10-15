import type { MidiStatus } from '../audio/midi';
import { useMidiStatus } from './useMidi';

function describe(on: boolean, st: MidiStatus): string {
  if (!on) return '已关闭。开启后可以直接在 MIDI 键盘上弹出答案（调内音级、旋律听写、音程识别）';
  switch (st.state) {
    case 'unsupported':
      return '当前浏览器不支持 Web MIDI，请使用 Chrome 或 Edge';
    case 'denied':
      return '未获得 MIDI 权限，请在浏览器的网站设置中允许后重新开启';
    case 'ready':
      return st.devices.length ? `已连接：${st.devices.join('、')}` : '未检测到设备，连接键盘后会自动识别';
    default:
      return '正在请求 MIDI 权限…';
  }
}

/** 设置页的「MIDI 键盘」区块 */
export function MidiSection({ on, onToggle }: { on: boolean; onToggle(v: boolean): void }) {
  const st = useMidiStatus();
  const connected = on && st.state === 'ready' && st.devices.length > 0;
  return (
    <section className="panel">
      <div className="field">
        <label>MIDI 键盘 {connected && <span className="midi-badge">🎹 已连接</span>}</label>
        <div className="seg wrap">
          {(
            [
              ['on', '开'],
              ['off', '关'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={on === (v === 'on') ? 'on' : ''} onClick={() => onToggle(v === 'on')}>
              {label}
            </button>
          ))}
        </div>
        <p className="muted midi-status">{describe(on, st)}</p>
      </div>
    </section>
  );
}
