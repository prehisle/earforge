import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { storedLocale } from './engine/progress';
import { getLocale, loadLocale, onLocaleLoaded } from './i18n';
import { ErrorBoundary, FeedbackAnnouncer, StorageNotice } from './ui/AppShell';

const root = createRoot(document.getElementById('root')!);
const render = () =>
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
        <StorageNotice />
        <FeedbackAnnouncer />
      </ErrorBoundary>
    </StrictMode>,
  );

// 英文词典是单独的分块（见 i18n/index.ts）：界面为英文时先加载完再首次渲染（加载失败或超过 3 秒也照常渲染，暂时回退为中文）；
// 运行中切换到英文而词典此时才加载完时，重新渲染整个应用（中文界面下的后台预取不触发渲染）
const initial = storedLocale();
let rendered = initial !== 'en';
onLocaleLoaded(() => {
  if (rendered && getLocale() !== 'en') return;
  rendered = true;
  render();
});
/** 英文词典迟迟没加载完（网络很差、请求卡住）时不再等待：先用中文渲染，加载完成后再切换为英文 */
const LOCALE_WAIT = 3000;
if (!rendered) {
  const fallback = () => {
    if (rendered) return;
    rendered = true;
    render();
  };
  loadLocale('en').catch(fallback);
  setTimeout(fallback, LOCALE_WAIT);
} else {
  render();
  // 首屏之后后台预取英文词典，切换语言时立即可用
  setTimeout(() => loadLocale('en').catch(() => {}), 0);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
}
