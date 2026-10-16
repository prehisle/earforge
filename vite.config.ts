import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 子 agent 的 worktree 位于 .claude/ 下，不应计入本仓库的测试
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
})
