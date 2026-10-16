// 离线：首次联网加载（只看首页）→ 等 SW 预缓存 → 离线 → 重新加载 → 依次打开按需加载的页面；
// 另外：键盘焦点环截图（明暗）、Tab 遍历无键盘陷阱、存储写入失败提示、分块加载失败时的出错兜底。原 offline.mjs
// 站点在子路径（如 /earforge/）下时同样适用：缓存检查只看文件名。
import { clickText, run, sleep } from '../lib/harness.mjs';

await run(async (t) => {
  const browser = await t.launch();
  const ctx = await browser.createBrowserContext();
  const base = t.base;
  const scope = new URL(base).pathname;

  const page = await t.open({ target: ctx, width: 400, height: 800, tag: 'online' });
  // 等 service worker 安装并预缓存
  const swScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  t.check(new URL(swScope).pathname === scope, `SW 作用域为 ${scope}（${swScope}）`);
  await sleep(1500);
  const cached = await page.evaluate(async () => {
    const out = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });
  const name = Object.keys(cached).find((k) => k.startsWith('earforge-v3-'));
  t.check(!!name, `有应用缓存（${Object.keys(cached).join(', ')}）`);
  const entries = cached[name] ?? [];
  t.check(
    entries.some((p) => /Stats-.*\.js/.test(p)) && entries.some((p) => /SongPractice-.*\.js/.test(p)),
    `预缓存 ${entries.length} 个条目，含 Stats / SongPractice 分块`,
  );
  t.check(entries.length > 0 && entries.every((p) => p.startsWith(scope)), `预缓存条目都在 ${scope} 之下`);

  // 新页面（不经过预取）：离线后重新加载，再打开各个页面
  const page2 = await t.open({ target: ctx, width: 400, height: 800, goto: false, tag: 'offline' });
  await page2.setOfflineMode(true);
  await page2.goto(base, { waitUntil: 'networkidle0' });
  await sleep(300);
  t.check(!!(await page2.$('.today')), '离线重新加载后首页正常');
  await t.shot(page2, 'offline-1-home', { fullPage: false });
  for (const [label, sel, expect] of [
    ['统计', 'button', '.page'],
    ['设置', 'button', 'input[type=range]'],
    ['视唱曲库', '.card', '.song-card'],
  ]) {
    await clickText(page2, label, sel);
    const found = await page2.waitForSelector(expect, { timeout: 4000 }).then(
      () => true,
      () => false,
    );
    t.check(found && !(await page2.$('.crash')), `离线打开「${label}」`);
    await t.shot(page2, `offline-${label}`, { fullPage: false });
    if (label === '视唱曲库') {
      await (await page2.$('.song-card')).click();
      const s = await page2.waitForSelector('.song-staff, .jianpu', { timeout: 4000 }).then(
        () => true,
        () => false,
      );
      t.check(s && !(await page2.$('.crash')), '离线打开曲目练习');
      await t.shot(page2, 'offline-song', { fullPage: false });
    }
    await clickText(page2, '返回');
    await sleep(200);
  }
  await page2.setOfflineMode(false);

  // 焦点环（明/暗）与 Tab 遍历
  for (const dark of [false, true]) {
    await page2.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
    await page2.goto(base, { waitUntil: 'networkidle0' });
    for (let i = 0; i < 3; i++) await page2.keyboard.press('Tab');
    await t.shot(page2, `focus-${dark ? 'dark' : 'light'}`, { fullPage: false });
  }
  const seen = new Set();
  let lastSig = '';
  let stuck = 0;
  for (let i = 0; i < 60; i++) {
    await page2.keyboard.press('Tab');
    const sig = await page2.evaluate(() => {
      const e = document.activeElement;
      return e ? `${e.tagName}.${e.className}:${e.textContent?.slice(0, 20)}` : '';
    });
    if (sig === lastSig) stuck++;
    lastSig = sig;
    seen.add(sig);
  }
  t.check(stuck === 0 && seen.size > 10, `首页 Tab 遍历 ${seen.size} 个元素，无键盘陷阱`);

  // 存储写入失败
  const page3 = await t.open({
    target: ctx,
    width: 400,
    height: 800,
    tag: 'storage-fail',
    allowErrors: /quota|QuotaExceeded/i,
    init: () => {
      Storage.prototype.setItem = function () {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    },
  });
  await clickText(page3, '设置');
  await page3.waitForSelector('.seg button:not(.on)');
  await (await page3.$('.seg button:not(.on)')).click();
  await sleep(300);
  t.check(!!(await page3.$('.storage-notice')) && !(await page3.$('.crash')), '存储写入失败：设置页照常可用并显示提示');
  await t.shot(page3, 'storage-fail-settings', { fullPage: false });
  // 改的第一个设置可能是界面语言，所以「返回」也可能是「Back」
  for (const el of await page3.$$('button'))
    if (/返回|Back/.test(await el.evaluate((e) => e.textContent))) {
      await el.click();
      break;
    }
  await sleep(300);
  t.check(!!(await page3.$('.storage-notice')) && !!(await page3.$('.today')), '存储写入失败：应用照常运行并显示提示');
  await t.shot(page3, 'storage-fail', { fullPage: false });

  // 渲染出错兜底：让「统计」页的分块加载失败（注销 SW、清空缓存、拦截请求）
  const page4 = await t.open({ target: ctx, width: 400, height: 800, tag: 'crash', allowErrors: true, onboarding: 'keep' });
  await page4.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await page4.setRequestInterception(true);
  page4.on('request', (r) => (/Stats-.*\.js/.test(r.url()) ? r.abort() : r.continue()));
  await page4.reload({ waitUntil: 'domcontentloaded' });
  await sleep(500);
  await clickText(page4, '统计');
  await sleep(800);
  t.check(!!(await page4.$('.crash')), '分块加载失败时显示出错兜底（重新加载 / 导出备份）');
  await t.shot(page4, 'crash-fallback', { fullPage: false });
});
