import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { loadStore, saveStore, type Store } from '../engine/progress';

/** 全局存储：同步地在最新副本上修改并持久化（调用方可立即读取修改结果），并同步音频设置。 */
export function useStore(): [Store, (fn: (s: Store) => void) => void] {
  const [store, setStore] = useState<Store>(loadStore);
  const latest = useRef(store);

  useEffect(() => {
    audio.timbre = store.settings.timbre;
    audio.setVolume(store.settings.volume);
  }, [store.settings.timbre, store.settings.volume]);

  const update = useCallback((fn: (s: Store) => void) => {
    const next = structuredClone(latest.current);
    fn(next);
    latest.current = next;
    saveStore(next);
    setStore(next);
  }, []);

  return [store, update];
}
