// 应用外壳：按需加载的分块拉取失败（离线未缓存、发布新版本后旧分块 404）要识别出来，给出「重新加载」的说明。
import { describe, expect, it } from 'vitest';
import { isChunkError } from '../ui/chunkError';

describe('isChunkError', () => {
  it('各浏览器的动态导入失败与 Vite 的 CSS 预加载失败', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Practice-abc.js'))).toBe(true);
    expect(isChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new Error('Unable to preload CSS for /assets/Practice-abc.css'))).toBe(true);
    expect(isChunkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
  });
});
