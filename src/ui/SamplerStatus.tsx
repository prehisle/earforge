import { useSyncExternalStore } from 'react';
import { audio } from '../audio/engine';
import { useT } from '../i18n/react';

/** 采样钢琴的下载进度与来源说明（设置页音色选项下方） */
export function SamplerStatus() {
  const t = useT();
  const st = useSyncExternalStore(
    (cb) => audio.onSampler(cb),
    () => audio.sampler,
  );
  return (
    <div className="sampler-status">
      {st.state === 'loading' && (
        <>
          <span className="muted">{t('sampler.loading', { pct: Math.round(st.progress * 100) })}</span>
          <span className="meter" role="progressbar" aria-valuenow={Math.round(st.progress * 100)}>
            <span className="meter-fill" style={{ width: `${st.progress * 100}%` }} />
          </span>
        </>
      )}
      {st.state === 'ready' && <span className="muted">{t('sampler.ready')}</span>}
      {st.state === 'error' && <span className="error-text">{t('sampler.error')}</span>}
      <small className="muted">
        {t('sampler.credit')}{' '}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
          CC BY 3.0
        </a>
        {t('sampler.hosted')}
      </small>
    </div>
  );
}
