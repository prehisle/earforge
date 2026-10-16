import { useRef } from 'react';
import { audio, type NoteEvent } from '../audio/engine';
import { INSTRUMENTS } from '../audio/sampler';
import { isSampled, SAMPLED_TIMBRES, SYNTH_TIMBRES, type TimbreSetting } from '../audio/timbres';
import { importBackup, today, type Store } from '../engine/progress';
import { type Notation, type Settings } from '../engine/types';
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
  /** 打开「关于与帮助」 */
  onAbout(): void;
}

/** 音色分组：合成（离线）/ 采样（需下载）/ 随机 */
const TIMBRE_GROUPS: ['synth' | 'sampled' | 'random', readonly TimbreSetting[]][] = [
  ['synth', SYNTH_TIMBRES],
  ['sampled', SAMPLED_TIMBRES],
  ['random', ['random']],
];

/** 换音色时的试听：分解和弦后接一个四音和弦 */
const PREVIEW: NoteEvent[] = [
  { notes: [60], time: 0, dur: 0.28 },
  { notes: [64], time: 0.3, dur: 0.28 },
  { notes: [67], time: 0.6, dur: 0.28 },
  { notes: [60, 64, 67, 72], time: 0.9, dur: 1.2 },
];

export function SettingsPage({ store, update, onBack, onOnboard, onAbout }: Props) {
  const t = useT();
  const s = store.settings;
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((st) => void (st.settings[k] = v));

  const pickTimbre = (v: TimbreSetting) => {
    set('timbre', v);
    audio.timbre = v;
    // 随机：先抽一种乐器试听
    audio.newQuestion();
    if (!isSampled(v) || audio.samplerStatus(v).state === 'ready') void audio.play(PREVIEW);
    // 首次选采样乐器：趁用户手势启动音频，再下载，完成后试听（失败时回退合成音色试听）
    else {
      void audio.resume();
      void audio.loadSampler(v).then(() => {
        if (audio.timbre === v) void audio.play(PREVIEW);
      });
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `earforge-${today()}.json`;
    a.click();
    // 立即撤销会让部分浏览器（Safari、旧版 Firefox）取消下载
    const url = a.href;
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importData = async (f: File) => {
    try {
      const data: unknown = JSON.parse(await f.text());
      // 格式不对时 importBackup 抛错：update 在副本上修改，抛错时不会保存
      update((st) => importBackup(st, data));
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
          {/* 首调 / 固定调等术语：给出当前选项的一句说明（与新手引导一致） */}
          <p className="muted onboard-note">{t(`naming.${s.naming}.desc`)}</p>
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
          <label id="settings-timbre">{t('settings.timbre')}</label>
          <div className="timbre-groups" role="group" aria-labelledby="settings-timbre">
            {TIMBRE_GROUPS.map(([group, ids]) => (
              <div key={group} className="timbre-group" role="group" aria-labelledby={`timbre-group-${group}`}>
                <span id={`timbre-group-${group}`} className="muted timbre-group-label">
                  {t(`settings.timbre.group.${group}`)}
                </span>
                <Seg<TimbreSetting>
                  value={s.timbre}
                  options={ids.map((id) => [
                    id,
                    isSampled(id)
                      ? t('settings.timbre.size', { name: t(`settings.timbre.${id}`), mb: INSTRUMENTS[id].sizeMb })
                      : t(`settings.timbre.${id}`),
                  ])}
                  onChange={pickTimbre}
                />
              </div>
            ))}
          </div>
          {s.timbre === 'random' && <p className="muted onboard-note">{t('settings.timbre.randomNote')}</p>}
          <SamplerStatus timbre={s.timbre} />
        </div>
        <div className="field">
          <label htmlFor="settings-vol">{t('settings.volume', { pct: Math.round(s.volume * 100) })}</label>
          <input
            id="settings-vol"
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
                  // 「全部练习记录」：曲库跟唱成绩与考试历史也一并清空（原来会留在首页与曲库里）
                  // 练习组合是用户自己编排的内容，不算练习记录，保留
                  update((st) => {
                    st.exercises = {};
                    st.daily = {};
                    st.songs = {};
                    st.exams = [];
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
            onChange={(e) => {
              const f = e.target.files?.[0];
              // 清空选择：再次选同一个文件也会触发 change
              e.target.value = '';
              if (f) void importData(f);
            }}
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

      <section className="panel">
        <div className="field">
          <label>{t('about.title')}</label>
          <div className="seg wrap">
            <button onClick={onAbout}>{t('about.open')}</button>
          </div>
          <p className="muted onboard-note">{t('about.openNote')}</p>
        </div>
      </section>
    </main>
  );
}
