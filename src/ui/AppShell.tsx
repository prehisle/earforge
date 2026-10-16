// 应用外壳：渲染出错时的兜底界面（重新加载 / 导出备份）、存储写入失败的提示、按需加载页面时的占位。
// 放在 App 之外（main.tsx），不依赖 LocaleContext：语言取模块级的当前语言（useStore 首次渲染前已设好）。

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { backupJson, onStorageStatus, storageOk, today } from '../engine/progress';
import { t } from '../i18n';
import { useT } from '../i18n/react';

/** 把数据下载为 JSON 文件（与设置页的「导出备份」格式相同）。 */
function downloadBackup(json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `earforge-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 按需加载的页面拉取失败（多半是离线且还没缓存，或刚发布了新版本）。 */
function isChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError/i.test(msg);
}

interface BoundaryState {
  error: unknown;
}

/** 渲染出错时不白屏：说明数据安全，提供导出备份与重新加载。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('EarForge render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const backup = backupJson();
    return (
      <div className="app">
        <main className="crash" role="alert">
          <h1>{t('app.crashTitle')}</h1>
          <p>{isChunkError(error) ? t('app.crashOffline') : t('app.crashBody')}</p>
          <div className="crash-actions">
            <button className="primary" onClick={() => location.reload()}>
              {t('app.crashReload')}
            </button>
            {backup && <button onClick={() => downloadBackup(backup)}>{t('app.crashExport')}</button>}
          </div>
          <details>
            <summary>Error</summary>
            <pre>{error instanceof Error ? `${error.name}: ${error.message}` : String(error)}</pre>
          </details>
        </main>
      </div>
    );
  }
}

/** 存储写入失败时的温和提示（不打断练习，可关闭；恢复成功后自动消失）。 */
export function StorageNotice() {
  const [ok, setOk] = useState(storageOk);
  const [dismissed, setDismissed] = useState(false);
  useEffect(
    () =>
      onStorageStatus((v) => {
        setOk(v);
        if (!v) setDismissed(false);
      }),
    [],
  );
  if (ok || dismissed) return null;
  return (
    <div className="storage-notice" role="status">
      <span>{t('app.storageFail')}</span>
      <button onClick={() => setDismissed(true)}>{t('app.storageDismiss')}</button>
    </div>
  );
}

/**
 * 读屏播报答题反馈（答对/答错、升级）：练习页的反馈块是答完才挂载的，新挂载的节点不一定会被读出，
 * 这里用一个常驻的 polite 播报区，监听反馈块出现时把其中的结论文字放进去。
 */
export function FeedbackAnnouncer() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    let timer = 0;
    const seen = new WeakSet<Element>();
    const obs = new MutationObserver(() => {
      const parts: string[] = [];
      for (const el of root.querySelectorAll('.feedback, .levelup')) {
        if (seen.has(el)) continue;
        seen.add(el);
        const strong = el.querySelector(':scope > strong');
        const explain = el.querySelector(':scope > span');
        parts.push(
          el.classList.contains('levelup') ? (el.textContent ?? '') : [strong?.textContent, explain?.textContent].filter(Boolean).join(' '),
        );
      }
      const text = parts.filter(Boolean).join(' ').trim();
      if (!text) return;
      // 先清空再写入：同样的文字（连续答对）也会再次播报
      setMsg('');
      clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(text), 50);
    });
    obs.observe(root, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {msg}
    </div>
  );
}

/** 按需加载页面时的占位（通常一闪而过；离线时由 service worker 缓存提供）。 */
export function PageLoading() {
  const t = useT();
  return (
    <main className="page-loading" aria-busy="true">
      <p className="muted">{t('app.loading')}</p>
    </main>
  );
}
