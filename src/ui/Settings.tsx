import { useRef } from 'react';
import { audio, type Timbre } from '../audio/engine';
import { SAMPLE_SIZE_MB } from '../audio/sampler';
import { sanitizeDaily, type Store } from '../engine/progress';
import { sanitizeExams } from '../engine/examHistory';
import { DEFAULT_SETTINGS, type Notation, type Settings } from '../engine/types';
import { useT } from '../i18n/react';
import { NAMING_SYSTEMS, namingLabel, type NamingSystem } from '../music/theory';
import { SamplerStatus } from './SamplerStatus';
import { MidiSection } from './MidiSection';
import { LangSwitch, Seg } from './Seg';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
  /** 重新查看新手引导 */
  onOnboard(): void;
}

export function SettingsPage({ store, update, onBack, onOnboard }: Props) {
  const t = useT();
  const s = store.settings;
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((st) => void (st.settings[k] = v));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `earforge-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as Store;
      if (data.version !== 1 || !data.exercises) throw new Error();
      update((st) => {
        st.exercises = data.exercises;
        st.daily = sanitizeDaily(data.daily);
        if (data.exams) st.exams = sanitizeExams(data.exams);
        st.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      });
      alert(t('settings.importOk'));
    } catch {
      alert(t('settings.importBad'));
    }
  };

  return (
    <main className="page">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          {t('common.back')}
        </button>
        <h1>{t('settings.title')}</h1>
        <span />
      </header>

      <section className="panel">
        <div className="field">
          <label>{t('lang.label')}</label>
          <LangSwitch value={s.lang} onChange={(v) => set('lang', v)} />
        </div>
      </section>

      <section className="panel">
        <div className="field">
          <label>{t('settings.naming')}</label>
          <Seg<NamingSystem>
            value={s.naming}
            options={NAMING_SYSTEMS.map((n) => [n, namingLabel(n)])}
            onChange={(v) => set('naming', v)}
          />
        </div>
        <div className="field">
          <label>{t('settings.staff')}</label>
          <Seg<Notation>
            value={s.notation}
            options={[
              ['both', t('settings.notation.both')],
              ['staff', t('settings.notation.staff')],
              ['jianpu', t('settings.notation.jianpu')],
            ]}
            onChange={(v) => set('notation', v)}
          />
        </div>
        <div className="field">
          <label>{t('settings.key')}</label>
          <Seg
            value={s.keyMode}
            options={[
              ['random', t('settings.key.random')],
              ['C', t('settings.key.C')],
            ]}
            onChange={(v) => set('keyMode', v)}
          />
        </div>
        <div className="field">
          <label>{t('settings.timbre')}</label>
          <Seg<Timbre>
            value={s.timbre}
            options={[
              ['piano', t('settings.timbre.piano')],
              ['epiano', t('settings.timbre.epiano')],
              ['sine', t('settings.timbre.sine')],
              ['sampled', t('settings.timbre.sampled', { mb: SAMPLE_SIZE_MB })],
            ]}
            onChange={(v) => {
              set('timbre', v);
              audio.timbre = v;
              const chord = [{ notes: [60, 64, 67], time: 0, dur: 1 }];
              if (v !== 'sampled' || audio.sampler.state === 'ready') void audio.play(chord);
              // 首次选采样：趁用户手势启动音频，再下载，完成后试听（失败时回退合成钢琴试听）
              else {
                void audio.resume();
                void audio.loadSampler().then(() => {
                  if (audio.timbre === 'sampled') void audio.play(chord);
                });
              }
            }}
          />
          <SamplerStatus />
        </div>
        <div className="field">
          <label>{t('settings.volume', { pct: Math.round(s.volume * 100) })}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            onChange={(e) => set('volume', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>{t('settings.voice')}</label>
          <Seg
            value={s.voice}
            options={[
              ['low', t('settings.voice.low')],
              ['high', t('settings.voice.high')],
            ]}
            onChange={(v) => set('voice', v)}
          />
        </div>
        <div className="field">
          <label>{t('settings.autoNext')}</label>
          <Seg
            value={s.autoNext ? 'on' : 'off'}
            options={[
              ['on', t('common.on')],
              ['off', t('common.off')],
            ]}
            onChange={(v) => set('autoNext', v === 'on')}
          />
        </div>
      </section>

      <section className="panel">
        <div className="field">
          <label>{t('settings.dailyGoal')}</label>
          <Seg
            value={String(s.dailyGoal)}
            options={['10', '20', '30', '50', '100'].map((v) => [v, v] as [string, string])}
            onChange={(v) => set('dailyGoal', Number(v))}
          />
        </div>
        <div className="field">
          <label>{t('settings.mixSize')}</label>
          <Seg
            value={String(s.mixSize)}
            options={['10', '20', '30', '40'].map((v) => [v, v] as [string, string])}
            onChange={(v) => set('mixSize', Number(v))}
          />
        </div>
      </section>

      <section className="panel">
        <div className="field">
          <label>{t('settings.data')}</label>
          <div className="seg wrap">
            <button onClick={exportData}>{t('settings.export')}</button>
            <button onClick={() => file.current?.click()}>{t('settings.import')}</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm(t('settings.clearConfirm')))
                  update((st) => {
                    st.exercises = {};
                    st.daily = {};
                  });
              }}
            >
              {t('settings.clear')}
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
          />
        </div>
      </section>

      <section className="panel">
        <div className="field">
          <label>{t('settings.onboard')}</label>
          <div className="seg wrap">
            <button onClick={onOnboard}>{t('settings.onboardAgain')}</button>
          </div>
          <p className="muted onboard-note">{t('settings.onboardNote')}</p>
        </div>
      </section>

      <MidiSection on={s.midi} onToggle={(v) => set('midi', v)} />
    </main>
  );
}
