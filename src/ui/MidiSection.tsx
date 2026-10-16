import type { MidiStatus } from '../audio/midi';
import { joinList } from '../i18n';
import { useT, type TFunc } from '../i18n/react';
import { useMidiStatus } from './useMidi';

function describe(on: boolean, st: MidiStatus, t: TFunc): string {
  if (!on) return t('midi.off');
  switch (st.state) {
    case 'unsupported':
      return t('midi.unsupported');
    case 'denied':
      return t('midi.denied');
    case 'ready':
      return st.devices.length ? t('midi.devices', { devices: joinList(st.devices) }) : t('midi.noDevice');
    default:
      return t('midi.pending');
  }
}

/** 设置页的「MIDI 键盘」区块 */
export function MidiSection({ on, onToggle }: { on: boolean; onToggle(v: boolean): void }) {
  const t = useT();
  const st = useMidiStatus();
  const connected = on && st.state === 'ready' && st.devices.length > 0;
  return (
    <section className="panel">
      <div className="field">
        <label>
          {t('midi.title')} {connected && <span className="midi-badge">{t('midi.connected')}</span>}
        </label>
        <div className="seg wrap">
          {(
            [
              ['on', t('common.on')],
              ['off', t('common.off')],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={on === (v === 'on') ? 'on' : ''} aria-pressed={on === (v === 'on')} onClick={() => onToggle(v === 'on')}>
              {label}
            </button>
          ))}
        </div>
        <p className="muted midi-status">{describe(on, st, t)}</p>
      </div>
    </section>
  );
}
