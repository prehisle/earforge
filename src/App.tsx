import { useEffect, useState } from 'react';
import { exerciseById } from './exercises';
import { ExamPage } from './ui/Exam';
import { translate } from './i18n';
import { LocaleContext } from './i18n/react';
import { Home } from './ui/Home';
import { MixedPractice } from './ui/Mixed';
import { Practice } from './ui/Practice';
import type { PracticeSet } from './engine/practiceSet';
import { saveSet, findSet } from './engine/sets';
import { hasSharedSet, readSharedSet, type SharedSet } from './engine/shareLink';
import { SharedSetPage } from './ui/SharedSet';
import { AboutPage, Onboarding, SetBuilder, SetRun, SetsPage, SettingsPage, SongLibrary, SongPractice, StatsPage } from './ui/lazyPages';
import { useMidiInput } from './ui/useMidi';
import { useStore } from './ui/useStore';

type Route =
  | { page: 'home' }
  | { page: 'practice'; id: string; focus?: string[] }
  | { page: 'mix'; round: number }
  | { page: 'stats' }
  | { page: 'settings' }
  | { page: 'songs' }
  | { page: 'song'; id: string }
  | { page: 'exam' }
  | { page: 'about'; from: 'home' | 'settings' }
  // 练习组合：列表、新建/编辑（可带模板）、练习（已保存的按 id，或直接给出未保存的组合，如分享链接里的）
  | { page: 'sets' }
  | { page: 'setEdit'; id?: string; template?: string }
  | { page: 'setRun'; id?: string; set?: PracticeSet; round?: number }
  // 分享链接（set 为 null 表示链接无效）
  | { page: 'shared'; set: SharedSet | null };

/** 网址带 #s= 时进入分享落地页 */
function sharedRoute(): Route | null {
  return hasSharedSet(location.href) ? { page: 'shared', set: readSharedSet(location.href) } : null;
}

export default function App() {
  const [store, update] = useStore();
  const [route, setRoute] = useState<Route>(() => sharedRoute() ?? { page: 'home' });
  // 通过分享链接进来的新用户：先看分享的组合，回到首页时再显示新手引导
  const [postponeOnboard, setPostponeOnboard] = useState(() => route.page === 'shared');
  const home = () => {
    setPostponeOnboard(false);
    setRoute({ page: 'home' });
  };
  useShareLinks((r) => {
    setPostponeOnboard(true);
    setRoute(r);
    window.scrollTo(0, 0);
  });
  // 从设置页重新查看新手引导（不清空进度）
  const [rerun, setRerun] = useState(false);
  useMidiInput(store.settings.midi);

  const lang = store.settings.lang;

  if ((!store.settings.onboarded && !postponeOnboard) || rerun)
    return (
      <LocaleContext.Provider value={lang}>
        <div className="app">
          <Onboarding
            store={store}
            update={update}
            onDone={() => {
              setRerun(false);
              home();
              window.scrollTo(0, 0);
            }}
          />
        </div>
      </LocaleContext.Provider>
    );

  return (
    <LocaleContext.Provider value={lang}>
      <div className="app">
        {route.page === 'home' && (
          <Home
            store={store}
            onOpen={(id) => setRoute({ page: 'practice', id })}
            onMix={() => setRoute({ page: 'mix', round: 0 })}
            onStats={() => setRoute({ page: 'stats' })}
            onSettings={() => setRoute({ page: 'settings' })}
            onSongs={() => setRoute({ page: 'songs' })}
            onExam={() => setRoute({ page: 'exam' })}
            onSets={() => setRoute({ page: 'sets' })}
            onAbout={() => setRoute({ page: 'about', from: 'home' })}
          />
        )}
        {route.page === 'practice' && (
          <Practice
            key={`${route.id}:${route.focus?.join(',') ?? ''}`}
            ex={exerciseById[route.id]}
            focus={route.focus}
            store={store}
            update={update}
            onBack={home}
          />
        )}
        {route.page === 'mix' && (
          <MixedPractice
            key={route.round}
            store={store}
            update={update}
            onBack={home}
            onAgain={() => setRoute({ page: 'mix', round: route.round + 1 })}
          />
        )}
        {route.page === 'stats' && (
          <StatsPage store={store} onBack={home} onFocus={(id, focus) => setRoute({ page: 'practice', id, focus })} />
        )}
        {route.page === 'songs' && (
          <SongLibrary
            store={store}
            onBack={home}
            onOpen={(id) => {
              setRoute({ page: 'song', id });
              window.scrollTo(0, 0);
            }}
          />
        )}
        {route.page === 'song' && (
          <SongPractice
            key={route.id}
            id={route.id}
            store={store}
            update={update}
            onBack={() => setRoute({ page: 'songs' })}
          />
        )}
        {route.page === 'exam' && (
          <ExamPage
            store={store}
            update={update}
            onBack={home}
            onFocus={(id, focus) => {
              setRoute({ page: 'practice', id, focus });
              window.scrollTo(0, 0);
            }}
          />
        )}
        {route.page === 'settings' && (
          <SettingsPage
            store={store}
            update={update}
            onBack={home}
            onOnboard={() => setRerun(true)}
            onAbout={() => {
              setRoute({ page: 'about', from: 'settings' });
              window.scrollTo(0, 0);
            }}
          />
        )}
        {route.page === 'about' && <AboutPage onBack={() => setRoute({ page: route.from })} />}
        {/* ───── 练习组合 ───── */}
        {route.page === 'sets' && (
          <SetsPage
            store={store}
            update={update}
            onBack={home}
            onNew={(template) => setRoute({ page: 'setEdit', template })}
            onEdit={(id) => setRoute({ page: 'setEdit', id })}
            onRun={(id) => setRoute({ page: 'setRun', id })}
          />
        )}
        {route.page === 'setEdit' && (
          <SetBuilder
            key={`${route.id ?? ''}:${route.template ?? ''}`}
            store={store}
            update={update}
            id={route.id}
            template={route.template}
            onBack={() => setRoute({ page: 'sets' })}
            onSaved={(id, start) => {
              setRoute(start ? { page: 'setRun', id } : { page: 'sets' });
              window.scrollTo(0, 0);
            }}
          />
        )}
        {route.page === 'setRun' &&
          (() => {
            // 从分享链接直接开始的（未保存）组合：返回首页；已保存的（含在落地页点过保存的）返回组合列表
            const unsaved = !!route.set && !findSet(store, route.set.id);
            return (
              <SetRun
                key={`${route.id ?? route.set?.id ?? ''}:${route.round ?? 0}`}
                store={store}
                update={update}
                set={route.set ?? (route.id ? (findSet(store, route.id) ?? null) : null)}
                onBack={unsaved ? home : () => setRoute({ page: 'sets' })}
                backLabel={unsaved ? translate(lang, 'mix.home') : undefined}
                onAgain={() => setRoute({ ...route, round: (route.round ?? 0) + 1 })}
              />
            );
          })()}
        {route.page === 'shared' && (
          <SharedSetPage
            set={route.set}
            store={store}
            onHome={home}
            onStart={(set) => setRoute({ page: 'setRun', set })}
            onSave={(set) => void saveSet(update, set)}
          />
        )}
      </div>
    </LocaleContext.Provider>
  );
}

/** 处理分享链接：启动时与打开期间（粘贴新链接触发 hashchange）进入落地页，并清掉 hash，刷新或后退不再重复触发 */
function useShareLinks(open: (r: Route) => void) {
  useEffect(() => {
    const clear = () => history.replaceState(history.state, '', location.pathname + location.search);
    if (hasSharedSet(location.href)) clear();
    const onHash = () => {
      const r = sharedRoute();
      if (!r) return;
      clear();
      open(r);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
