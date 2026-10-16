// 分享链接的落地页：打开带 #s=<code> 的网址时显示组合内容，可直接开始练习、保存到「我的组合」或返回首页。
// 名称是用户输入的文本，只作为文本渲染（React 转义）。
import { useState } from 'react';
import type { PracticeSet } from '../engine/practiceSet';
import type { Store } from '../engine/progress';
import { toPracticeSet, type SharedSet } from '../engine/shareLink';
import { exerciseById } from '../exercises';
import { joinList } from '../i18n';
import { useT } from '../i18n/react';

interface Props {
  /** 解析出的组合；null 表示链接无效 */
  set: SharedSet | null;
  store: Store;
  onStart(set: PracticeSet): void;
  onSave(set: PracticeSet): void;
  onHome(): void;
}

export function SharedSetPage({ set, store, onStart, onSave, onHome }: Props) {
  const t = useT();
  const [saved, setSaved] = useState(false);
  // 同一个页面里开始与保存用同一个组合（同一 id），避免保存两份
  const [local] = useState(() => (set ? toPracticeSet(set, t('share.untitled')) : null));

  if (!set || !local)
    return (
      <main className="page shared">
        <header className="topbar">
          <h1>{t('share.invalidTitle')}</h1>
        </header>
        <section className="panel">
          <p>{t('share.invalidBody')}</p>
          <div className="shared-actions">
            <button className="primary" onClick={onHome}>
              {t('share.home')}
            </button>
          </div>
        </section>
      </main>
    );

  return (
    <main className="page shared">
      <header className="topbar">
        <button className="ghost" onClick={onHome} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <h1>{t('share.title')}</h1>
      </header>
      <section className="panel" aria-labelledby="shared-name">
        <h2 id="shared-name" className="shared-name">
          {set.name || t('share.untitled')}
        </h2>
        <p className="muted">
          {t('share.count', { n: set.count })} · {set.seed !== undefined ? t('share.fixed') : t('share.random')}
        </p>
        <ul className="shared-parts">
          {set.parts.map((p, i) => {
            const ex = exerciseById[p.ex];
            const opts = (ex.options ?? []).flatMap((o) => {
              const v = o.values.find((x) => x.id === p.options[o.id]);
              return v && v.id !== o.default ? [t('share.option', { k: o.label, v: v.label })] : [];
            });
            return (
              <li key={i}>
                <strong>{ex.title}</strong>
                {opts.length > 0 && <span className="muted"> · {joinList(opts)}</span>}
                <div className="muted">{joinList(p.items.map((it) => ex.itemLabel(it, store.settings)))}</div>
              </li>
            );
          })}
        </ul>
        <div className="shared-actions">
          <button className="primary big" onClick={() => onStart(local)}>
            {t('share.start')}
          </button>
          <button
            disabled={saved}
            onClick={() => {
              onSave(local);
              setSaved(true);
            }}
          >
            {saved ? t('share.saved') : t('share.save')}
          </button>
          <button className="ghost" onClick={onHome}>
            {t('share.home')}
          </button>
        </div>
      </section>
    </main>
  );
}
