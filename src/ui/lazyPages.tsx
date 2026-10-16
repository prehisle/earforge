// 非首屏页面按需加载（统计与趋势图、曲库与曲目数据、视唱练习、设置、新手引导），缩小首屏脚本。
// 每个页面自带 Suspense 占位；离线时这些分块由 service worker 预缓存提供（见 public/sw.js 与 vite.config.ts）。

import { Suspense, lazy, type ComponentProps } from 'react';
import { PageLoading } from './AppShell';

const LazyStatsPage = lazy(() => import('./Stats').then((m) => ({ default: m.StatsPage })));
export function StatsPage(props: ComponentProps<typeof LazyStatsPage>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LazyStatsPage {...props} />
    </Suspense>
  );
}

const LazySettingsPage = lazy(() => import('./Settings').then((m) => ({ default: m.SettingsPage })));
export function SettingsPage(props: ComponentProps<typeof LazySettingsPage>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LazySettingsPage {...props} />
    </Suspense>
  );
}

const LazyOnboarding = lazy(() => import('./Onboarding').then((m) => ({ default: m.Onboarding })));
export function Onboarding(props: ComponentProps<typeof LazyOnboarding>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LazyOnboarding {...props} />
    </Suspense>
  );
}

const LazySongLibrary = lazy(() => import('./SongLibrary').then((m) => ({ default: m.SongLibrary })));
export function SongLibrary(props: ComponentProps<typeof LazySongLibrary>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LazySongLibrary {...props} />
    </Suspense>
  );
}

const LazySongPractice = lazy(() => import('./SongPractice').then((m) => ({ default: m.SongPracticeById })));
export function SongPractice(props: ComponentProps<typeof LazySongPractice>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LazySongPractice {...props} />
    </Suspense>
  );
}
