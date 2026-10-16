import { useEffect, useRef, useState } from 'react';
import { exerciseById } from '../exercises';
import type { Store } from '../engine/progress';
import type { PracticeSet } from '../engine/practiceSet';
import { copyName, deleteSet, duplicateSet, listSets, setsFull } from '../engine/sets';
import { SETS_MAX } from '../engine/setRunner';
import { SET_TEMPLATES } from '../engine/setTemplates';
import { shareUrl } from '../engine/shareLink';
import { useT } from '../i18n/react';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  onBack(): void;
  /** 新建（可指定模板 id） */
  onNew(template?: string): void;
  onEdit(id: string): void;
  onRun(id: string): void;
}

/** 组合的分享链接；编码出错（不应发生：保存的组合都已规范化）时为 null */
function setLink(set: PracticeSet): string | null {
  try {
    const { id, created, ...shared } = set;
    void id;
    void created;
    return shareUrl(shared);
  } catch {
    return null;
  }
}

/** 已保存的练习组合：开始、编辑、复制、分享、删除；没有组合时从模板开始。 */
export function SetsPage({ store, update, onBack, onNew, onEdit, onRun }: Props) {
  const t = useT();
  const sets = listSets(store);
  // 已存满：不能新建 / 复制（保存时不会悄悄删掉最早的组合）
  const full = setsFull(store);
  const duplicate = (set: PracticeSet, name: string) => {
    const copy = copyName(
      name,
      sets.map((x) => x.name),
      (nm, n) => (n > 1 ? t('sets.copySuffixN', { name: nm, n }) : t('sets.copySuffix', { name: nm })),
    );
    update((s) => void duplicateSet(s, set.id, copy));
  };
  // 分享：复制成功的提示，或复制失败时显示链接让用户手动复制
  const [shared, setShared] = useState<{ id: string; url: string; manual: boolean } | null>(null);

  const share = async (set: PracticeSet, url: string) => {
    const name = set.name || t('sets.untitled');
    // 手机上用系统分享面板
    if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // 用户取消
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared({ id: set.id, url, manual: false });
    } catch {
      setShared({ id: set.id, url, manual: true });
    }
  };

  const remove = (set: PracticeSet) => {
    if (!confirm(t('sets.deleteConfirm', { name: set.name || t('sets.untitled') }))) return;
    update((s) => deleteSet(s, set.id));
  };

  return (
    <main className="page sets">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{t('sets.title')}</h1>
        </div>
        <span className="topbar-spacer" />
      </header>

      <p className="sets-intro muted">{t('sets.intro')}</p>

      <div className="sets-new">
        <button className="primary" onClick={() => onNew()} disabled={full}>
          {t('sets.new')}
        </button>
      </div>
      {full && (
        <p className="sets-full muted" role="status">
          {t('sets.full', { n: SETS_MAX })}
        </p>
      )}

      {sets.length === 0 ? (
        <p className="sets-empty muted">{t('sets.empty')}</p>
      ) : (
        <ul className="set-list">
          {sets.map((set) => {
            const name = set.name || t('sets.untitled');
            const url = setLink(set);
            return (
              <li key={set.id} className="set-item">
                <div className="set-item-head">
                  <h2>{name}</h2>
                  <p className="muted">
                    {t('sets.meta', {
                      n: set.count,
                      mods: set.parts.map((p) => `${exerciseById[p.ex].icon} ${exerciseById[p.ex].title}`).join(' · '),
                    })}
                    {set.seed !== undefined && ` · ${t('sets.seeded')}`}
                  </p>
                </div>
                <div className="set-actions">
                  <button className="primary" onClick={() => onRun(set.id)}>
                    {t('sets.start')}
                  </button>
                  <button onClick={() => onEdit(set.id)}>{t('sets.edit')}</button>
                  <button onClick={() => duplicate(set, name)} disabled={full}>
                    {t('sets.duplicate')}
                  </button>
                  <button onClick={url ? () => void share(set, url) : undefined} disabled={!url}>
                    {t('sets.share')}
                  </button>
                  <button className="danger" onClick={() => remove(set)}>
                    {t('sets.delete')}
                  </button>
                </div>
                {shared?.id === set.id && (
                  <ShareNote url={shared.url} manual={shared.manual} fixed={set.seed !== undefined} onClose={() => setShared(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section>
        <h2 className="group-title">{t('sets.fromTemplate')}</h2>
        <div className="seg wrap set-templates">
          {SET_TEMPLATES.map((tpl) => (
            <button key={tpl.id} onClick={() => onNew(tpl.id)} disabled={full}>
              {tpl.icon} {t(tpl.name)}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

/** 分享结果：已复制的提示；复制失败时显示可全选的链接 */
function ShareNote({ url, manual, fixed, onClose }: { url: string; manual: boolean; fixed: boolean; onClose(): void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (manual) input.current?.select();
  }, [manual]);
  return (
    <div className="set-share" role="status">
      {manual ? (
        <label className="set-share-manual">
          <span>{t('sets.copyManual')}</span>
          <input ref={input} type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : (
        <span>{t('sets.copied')}</span>
      )}
      {fixed && <span className="set-share-fixed">{t('sets.sharedFixed')}</span>}
      <button className="ghost" onClick={onClose}>
        {t('sets.close')}
      </button>
    </div>
  );
}
