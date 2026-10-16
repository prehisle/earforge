import { useSyncExternalStore } from 'react';
import { audio } from '../audio/engine';
import { isSampled, type TimbreSetting } from '../audio/timbres';
import { useT } from '../i18n/react';

const CC_BY = 'https://creativecommons.org/licenses/by/3.0/';

/** 采样乐器的下载进度（选中采样乐器时）与来源说明（设置页音色选项下方） */
export function SamplerStatus({ timbre }: { timbre: TimbreSetting }) {
  const t = useT();
  const id = isSampled(timbre) ? timbre : null;
  const st = useSyncExternalStore(
    (cb) => audio.onSampler(cb),
    () => (id ? audio.samplerStatus(id) : null),
  );
  return (
    <div className="sampler-status">
      {st?.state === 'loading' && (
        <>
          <span className="muted">{t('sampler.loading', { pct: Math.round(st.progress * 100) })}</span>
          <span className="meter" role="progressbar" aria-label={t('sampler.loading', { pct: Math.round(st.progress * 100) })} aria-valuenow={Math.round(st.progress * 100)}>
            <span className="meter-fill" style={{ width: `${st.progress * 100}%` }} />
          </span>
        </>
      )}
      {st?.state === 'ready' && <span className="muted">{t('sampler.ready')}</span>}
      {st?.state === 'error' && <span className="error-text">{t('sampler.error')}</span>}
      <small className="muted">
        {t('sampler.credit')}{' '}
        <a href={CC_BY} target="_blank" rel="noreferrer">
          CC BY 3.0
        </a>
        {t('sampler.hosted')}
      </small>
      <small className="muted">
        {t('sampler.creditInstruments')}{' '}
        <a href={CC_BY} target="_blank" rel="noreferrer">
          CC BY 3.0
        </a>
      </small>
    </div>
  );
}
