import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { isSampled } from '../audio/timbres';
import { loadStore, refreshStore, STORE_KEY, updateStore, type Store } from '../engine/progress';
import { setLocale, translate } from '../i18n';

/**
 * 全局存储：同步地在最新副本上修改并持久化（调用方可立即读取修改结果），并同步音频设置与界面语言。
 * 多标签页安全：修改前先读取其他标签页写入的数据（见 progress.ts 的 refreshStore）。
 */
export function useStore(): [Store, (fn: (s: Store) => void) => void] {
  const [store, setStore] = useState<Store>(() => {
    const s = loadStore();
    // 练习生成器读取模块级语言：在首次渲染之前设好
    setLocale(s.settings.lang);
    return s;
  });
  const latest = useRef(store);

  useEffect(() => {
    audio.timbre = store.settings.timbre;
    audio.setVolume(store.settings.volume);
    // 已选采样乐器：启动时后台预加载（离线时由 service worker 缓存提供）；失败后的重试由设置页发起
    const timbre = store.settings.timbre;
    if (isSampled(timbre) && audio.samplerStatus(timbre).state === 'idle') void audio.loadSampler(timbre);
  }, [store.settings.timbre, store.settings.volume]);

  // <html lang> 与标题随界面语言变化
  useEffect(() => {
    const lang = store.settings.lang;
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = translate(lang, 'app.title');
  }, [store.settings.lang]);

  // 其他标签页写入后（storage 事件只发给其他标签页）：换成最新数据，界面随之刷新
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORE_KEY) return;
      const s = refreshStore();
      if (!s) return;
      latest.current = s;
      setLocale(s.settings.lang);
      setStore(s);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn: (s: Store) => void) => {
    // 修改前先看其他标签页是否写过（storage 事件是异步的，可能还没到）：在最新数据上修改，不覆盖对方的记录
    const next = updateStore(latest.current, fn);
    latest.current = next;
    // 先切换模块级语言，再触发重新渲染
    setLocale(next.settings.lang);
    setStore(next);
  }, []);

  return [store, update];
}
