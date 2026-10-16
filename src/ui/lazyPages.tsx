// 非首屏页面按需加载（统计与趋势图、曲库与曲目数据、视唱练习、设置、新手引导、关于与帮助、练习组合），缩小首屏脚本。
// 首屏渲染后立即在后台预取这些分块：之后切换页面是同步的，不出现加载占位；
// 离线时由 service worker 预缓存提供（见 public/sw.js 与 vite.config.ts）。

import { Suspense, lazy, useState, type ComponentType } from 'react';
import { PageLoading } from './AppShell';

interface LazyPage<P> {
  Lazy: ComponentType<P>;
  /** 已加载完成的组件（同步可用） */
  loaded: ComponentType<P> | null;
  load(): Promise<ComponentType<P>>;
}

function lazyPage<P extends object>(importer: () => Promise<ComponentType<P>>): LazyPage<P> {
  let promise: Promise<ComponentType<P>> | null = null;
  const page: LazyPage<P> = {
    loaded: null,
    load: () =>
      (promise ??= importer().then(
        (c) => (page.loaded = c),
        (e: unknown) => {
          promise = null; // 失败（如离线且未缓存）后允许重试
          throw e;
        },
      )),
    Lazy: lazy(() => page.load().then((c) => ({ default: c }))) as unknown as ComponentType<P>,
  };
  return page;
}

/** 已预取则直接渲染；否则用 lazy + Suspense。挂载时确定一次，避免中途切换组件类型导致重新挂载。 */
function Render<P extends object>({ page, props }: { page: LazyPage<P>; props: P }) {
  const [Loaded] = useState(() => page.loaded);
  if (Loaded) return <Loaded {...props} />;
  const { Lazy } = page;
  return (
    <Suspense fallback={<PageLoading />}>
      <Lazy {...props} />
    </Suspense>
  );
}

type PropsOf<T> = T extends ComponentType<infer P> ? P : never;

const stats = lazyPage(() => import('./Stats').then((m) => m.StatsPage));
const settings = lazyPage(() => import('./Settings').then((m) => m.SettingsPage));
const onboarding = lazyPage(() => import('./Onboarding').then((m) => m.Onboarding));
const library = lazyPage(() => import('./SongLibrary').then((m) => m.SongLibrary));
const songPractice = lazyPage(() => import('./SongPractice').then((m) => m.SongPracticeById));
const about = lazyPage(() => import('./About').then((m) => m.AboutPage));
const sets = lazyPage(() => import('./Sets').then((m) => m.SetsPage));
const setBuilder = lazyPage(() => import('./SetBuilder').then((m) => m.SetBuilder));
const setRun = lazyPage(() => import('./SetRun').then((m) => m.SetRun));
const resultView = lazyPage(() => import('./ResultView').then((m) => m.ResultView));
const gradebook = lazyPage(() => import('./Gradebook').then((m) => m.GradebookPage));

export function StatsPage(props: PropsOf<typeof import('./Stats').StatsPage>) {
  return <Render page={stats} props={props} />;
}
export function SettingsPage(props: PropsOf<typeof import('./Settings').SettingsPage>) {
  return <Render page={settings} props={props} />;
}
export function Onboarding(props: PropsOf<typeof import('./Onboarding').Onboarding>) {
  return <Render page={onboarding} props={props} />;
}
export function SongLibrary(props: PropsOf<typeof import('./SongLibrary').SongLibrary>) {
  return <Render page={library} props={props} />;
}
export function SongPractice(props: PropsOf<typeof import('./SongPractice').SongPracticeById>) {
  return <Render page={songPractice} props={props} />;
}

export function AboutPage(props: PropsOf<typeof import('./About').AboutPage>) {
  return <Render page={about} props={props} />;
}

export function SetsPage(props: PropsOf<typeof import('./Sets').SetsPage>) {
  return <Render page={sets} props={props} />;
}
export function SetBuilder(props: PropsOf<typeof import('./SetBuilder').SetBuilder>) {
  return <Render page={setBuilder} props={props} />;
}
export function SetRun(props: PropsOf<typeof import('./SetRun').SetRun>) {
  return <Render page={setRun} props={props} />;
}
export function ResultView(props: PropsOf<typeof import('./ResultView').ResultView>) {
  return <Render page={resultView} props={props} />;
}
export function GradebookPage(props: PropsOf<typeof import('./Gradebook').GradebookPage>) {
  return <Render page={gradebook} props={props} />;
}

// 首屏之后在后台预取（失败无妨：真正打开页面时会再试，并由出错兜底提示）
if (typeof window !== 'undefined')
  setTimeout(() => {
    for (const p of [onboarding, stats, library, settings, songPractice, about, sets, setBuilder, setRun, resultView, gradebook]) p.load().catch(() => {});
  }, 0);
