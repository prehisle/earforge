import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { loadStore, saveStore, type Store } from '../engine/progress';
import { setLocale, translate } from '../i18n';

/** 全局存储：同步地在最新副本上修改并持久化（调用方可立即读取修改结果），并同步音频设置与界面语言。 */
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
    // 已选采样钢琴：启动时后台预加载（离线时由 service worker 缓存提供）；失败后的重试由设置页发起
    if (store.settings.timbre === 'sampled' && audio.sampler.state === 'idle') void audio.loadSampler();
  }, [store.settings.timbre, store.settings.volume]);

  // <html lang> 与标题随界面语言变化
  useEffect(() => {
    const lang = store.settings.lang;
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = translate(lang, 'app.title');
  }, [store.settings.lang]);

  const update = useCallback((fn: (s: Store) => void) => {
    const next = structuredClone(latest.current);
    fn(next);
    latest.current = next;
    // 先切换模块级语言，再触发重新渲染
    setLocale(next.settings.lang);
    saveStore(next);
    setStore(next);
  }, []);

  return [store, update];
}
