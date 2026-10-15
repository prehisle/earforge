import { useRef } from 'react';
import { audio, type Timbre } from '../audio/engine';
import { SAMPLE_SIZE_MB } from '../audio/sampler';
import type { Store } from '../engine/progress';
import { DEFAULT_SETTINGS, type Settings } from '../engine/types';
import { NAMING_LABELS, type NamingSystem } from '../music/theory';
import { SamplerStatus } from './SamplerStatus';
import { MidiSection } from './MidiSection';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange(v: T): void;
}) {
  return (
    <div className="seg wrap">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPage({ store, update, onBack }: Props) {
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
        st.daily = data.daily ?? {};
        st.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      });
      alert('导入成功');
    } catch {
      alert('文件格式不正确');
    }
  };

  return (
    <main className="page">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← 返回
        </button>
        <h1>设置</h1>
        <span />
      </header>

      <section className="panel">
        <div className="field">
          <label>唱名 / 音名显示</label>
          <Seg<NamingSystem>
            value={s.naming}
            options={Object.entries(NAMING_LABELS) as [NamingSystem, string][]}
            onChange={(v) => set('naming', v)}
          />
        </div>
        <div className="field">
          <label>调性</label>
          <Seg
            value={s.keyMode}
            options={[
              ['random', '随机调（推荐，训练相对音感）'],
              ['C', '固定 C 调'],
            ]}
            onChange={(v) => set('keyMode', v)}
          />
        </div>
        <div className="field">
          <label>音色</label>
          <Seg<Timbre>
            value={s.timbre}
            options={[
              ['piano', '钢琴'],
              ['epiano', '电钢琴'],
              ['sine', '纯音'],
              ['sampled', `采样钢琴（需下载约 ${SAMPLE_SIZE_MB} MB）`],
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
          <label>音量 {Math.round(s.volume * 100)}%</label>
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
          <label>演唱音区（视唱练习）</label>
          <Seg
            value={s.voice}
            options={[
              ['low', '低音区（男声）'],
              ['high', '高音区（女声/童声）'],
            ]}
            onChange={(v) => set('voice', v)}
          />
        </div>
        <div className="field">
          <label>答对后自动下一题</label>
          <Seg
            value={s.autoNext ? 'on' : 'off'}
            options={[
              ['on', '开'],
              ['off', '关'],
            ]}
            onChange={(v) => set('autoNext', v === 'on')}
          />
        </div>
      </section>

      <section className="panel">
        <div className="field">
          <label>每日目标（题）</label>
          <Seg
            value={String(s.dailyGoal)}
            options={['10', '20', '30', '50', '100'].map((v) => [v, v] as [string, string])}
            onChange={(v) => set('dailyGoal', Number(v))}
          />
        </div>
        <div className="field">
          <label>今日训练每组题数</label>
          <Seg
            value={String(s.mixSize)}
            options={['10', '20', '30', '40'].map((v) => [v, v] as [string, string])}
            onChange={(v) => set('mixSize', Number(v))}
          />
        </div>
      </section>

      <section className="panel">
        <div className="field">
          <label>数据（仅保存在本机浏览器）</label>
          <div className="seg wrap">
            <button onClick={exportData}>导出备份</button>
            <button onClick={() => file.current?.click()}>导入备份</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm('确定清空全部练习记录？此操作不可撤销。'))
                  update((st) => {
                    st.exercises = {};
                    st.daily = {};
                  });
              }}
            >
              清空记录
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

      <MidiSection on={s.midi} onToggle={(v) => set('midi', v)} />
    </main>
  );
}
