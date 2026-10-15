import { useSyncExternalStore } from 'react';
import { audio } from '../audio/engine';

/** 采样钢琴的下载进度与来源说明（设置页音色选项下方） */
export function SamplerStatus() {
  const st = useSyncExternalStore(
    (cb) => audio.onSampler(cb),
    () => audio.sampler,
  );
  return (
    <div className="sampler-status">
      {st.state === 'loading' && (
        <>
          <span className="muted">正在下载采样… {Math.round(st.progress * 100)}%</span>
          <span className="meter" role="progressbar" aria-valuenow={Math.round(st.progress * 100)}>
            <span className="meter-fill" style={{ width: `${st.progress * 100}%` }} />
          </span>
        </>
      )}
      {st.state === 'ready' && <span className="muted">采样已就绪</span>}
      {st.state === 'error' && <span className="error-text">下载失败，暂用合成钢琴；联网后重新点选可重试</span>}
      <small className="muted">
        采样钢琴来源：Salamander Grand Piano，作者 Alexander Holm，许可证{' '}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
          CC BY 3.0
        </a>
        ，经 Tone.js 托管
      </small>
    </div>
  );
}
