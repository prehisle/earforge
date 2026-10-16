// 按需加载的分块拉取失败的识别（出错兜底界面用；单独成文件，AppShell 只导出组件）

/** 按需加载的页面拉取失败（多半是离线且还没缓存，或刚发布了新版本）。 */
export function isChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Unable to preload CSS/i.test(msg);
}
