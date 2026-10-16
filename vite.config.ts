import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { configDefaults } from 'vitest/config'
import { defineConfig, type Plugin } from 'vite'

/** 列出目录下的全部文件（相对路径，用 / 分隔）。 */
function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name), root) : [relative(root, join(dir, e.name)).split('\\').join('/')],
  )
}

/**
 * 部署路径：默认 '/'；部署到子路径（如 GitHub Pages 项目页 https://<user>.github.io/earforge/）时
 * 用 BASE_PATH=/earforge/ npm run build。首尾斜杠可省略。
 */
function basePath(): string {
  const raw = process.env.BASE_PATH?.trim()
  if (!raw || raw === '/') return '/'
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`
}

/**
 * 构建后把本次产出的文件列表写进 dist/sw.js（替换 PRECACHE 与 BUILD 占位），
 * 让 service worker 安装时预缓存全部分块（含按需加载的页面），离线也能打开从没访问过的页面。
 */
function swPrecache(): Plugin {
  let outDir = 'dist'
  return {
    name: 'earforge-sw-precache',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir)
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js')
      // 路径相对 sw.js 所在目录（即部署的根路径），子路径部署时同样适用
      const files = listFiles(outDir)
        .filter((f) => f !== 'sw.js' && !f.startsWith('.') && !f.endsWith('.map'))
        .map((f) => (f === 'index.html' ? './' : `./${f}`))
        .sort()
      // 版本号：文件名（资源带内容哈希）加 index.html 内容的哈希
      const build = createHash('sha256')
        .update(files.join('\n'))
        .update(readFileSync(join(outDir, 'index.html')))
        .digest('hex')
        .slice(0, 10)
      const sw = readFileSync(swPath, 'utf8')
      const out = sw
        .replace(/^const BUILD = .*;$/m, `const BUILD = '${build}';`)
        .replace(/^const PRECACHE = .*;$/m, `const PRECACHE = ${JSON.stringify(files)};`)
      if (out === sw) throw new Error('sw.js: 找不到 BUILD / PRECACHE 占位')
      writeFileSync(swPath, out)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: basePath(),
  plugins: [react(), swPrecache()],
  // 子 agent 的 worktree 位于 .claude/ 下，不应计入本仓库的测试
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
})
