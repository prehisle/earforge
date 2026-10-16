// 找一个可用的 Chrome / Chromium 可执行文件。
// 顺序：环境变量 CHROME_PATH（或 PUPPETEER_EXECUTABLE_PATH）→ 常见系统安装位置 →
// `npm run e2e:browser` 下载到 e2e/.cache/browsers 的 Chrome for Testing。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BROWSER_CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'browsers');

const SYSTEM_CANDIDATES = {
  // 注意：/usr/bin/google-chrome 是 shell 包装脚本，有些环境里无头模式启动失败，所以先找真正的二进制
  linux: [
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

export async function findChrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env) {
    if (!existsSync(env)) throw new Error(`CHROME_PATH=${env} 不存在`);
    return env;
  }
  for (const p of SYSTEM_CANDIDATES[process.platform] ?? []) if (existsSync(p)) return p;
  try {
    const { getInstalledBrowsers } = await import('@puppeteer/browsers');
    const installed = await getInstalledBrowsers({ cacheDir: BROWSER_CACHE });
    const chrome = installed.find((b) => b.browser === 'chrome') ?? installed[0];
    if (chrome && existsSync(chrome.executablePath)) return chrome.executablePath;
  } catch {
    // 没装 @puppeteer/browsers 或缓存目录不存在：落到下面的报错
  }
  throw new Error(
    '找不到 Chrome。请设置 CHROME_PATH=/path/to/chrome，或运行 `npm run e2e:browser` 下载 Chrome for Testing。\n' +
      'No Chrome found. Set CHROME_PATH or run `npm run e2e:browser`.',
  );
}
