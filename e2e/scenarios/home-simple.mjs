// 首页减法：新用户只突出入门练习，其余收进「更多练习」（展开状态记住）；老用户练过的练习都在前面；
// 引导所选背景决定入门练习；累计答满后不再折叠。手机 / 桌面、中 / 英各截图。
import { answerQuestion, clickText, overflowPx, readStore, run, sleep } from '../lib/harness.mjs';

const PLANS = ['模拟考试', '自定义练习', 'Mock exams', 'Custom practice', '成绩单', 'Gradebook'];

/** 前面（不在「更多练习」里）的练习卡片标题 */
const frontTitles = (page) =>
  page.$$eval('.card .card-title', (els) => els.filter((e) => !e.closest('.more-ex')).map((e) => e.textContent));
const moreTitles = (page) => page.$$eval('.more-ex .card .card-title', (els) => els.map((e) => e.textContent));
const exerciseFront = async (page) => (await frontTitles(page)).filter((s) => !PLANS.some((p) => s.includes(p)));

/** 写入一份存储并重新加载 */
async function load(page, store) {
  await page.evaluate((s) => localStorage.setItem('earforge:v1', JSON.stringify(s)), store);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const stat = (n) => ({ x: { n, c: n, acc: 0.8, last: Date.now() } });
const settings = (extra = {}) => ({ lang: 'zh', onboarded: true, ...extra });

await run(async (t) => {
  const browser = await t.launch();

  // ───── 新用户（中文手机）─────
  {
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, width: 390, height: 844, tag: 'zh-new' });
    t.check(!!(await page.$('.today.spotlight')), '新用户：今日训练突出显示（保持原样）');
    t.check(!!(await page.$('.tiles .tile.goal')), '新用户：每日目标区块还在');
    const front = await exerciseFront(page);
    t.check(front.join() === '调内音级,音程识别,和弦性质', `新用户：只突出 3 个入门练习（${front.join('、')}）`);
    const toggle = await page.$eval('.more-toggle', (e) => ({ exp: e.getAttribute('aria-expanded'), text: e.textContent }));
    t.check(toggle.exp === 'false' && toggle.text.includes('更多练习（11）'), `「更多练习」默认收起（${toggle.text}）`);
    t.check(!(await page.$('.more-body')), '收起时不渲染其余卡片');
    const hint = await page.$eval('.more-hint', (e) => e.textContent);
    t.check(hint.includes('再答 50 题') && hint.includes('和弦转位'), `提示下一批解锁（${hint}）`);
    t.check((await overflowPx(page)) <= 0, '新用户手机首页无横向溢出');
    await t.shot(page, 'm-zh-new-1-collapsed');
    await t.shot(page, 'm-zh-new-1-collapsed-fold', { fullPage: false });

    await page.click('.more-toggle');
    await page.waitForSelector('.more-body');
    const more = await moreTitles(page);
    t.check(more.length === 11 && more.includes('视唱曲库') && more.includes('和声听写'), `展开后列出其余 11 项（${more.length}）`);
    t.check((await overflowPx(page)) <= 0, '展开后无横向溢出');
    await t.shot(page, 'm-zh-new-2-expanded');
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(300);
    t.check(!!(await page.$('.more-body')), '重新加载后保持展开');
    t.check((await readStore(page)).settings.homeMore === true, '展开状态记在设置里');
    await page.click('.more-toggle');
    await sleep(100);
    t.check(!(await page.$('.more-body')) && (await readStore(page)).settings.homeMore === false, '可以再收起');

    // 从「更多练习」里练一题：回到首页后移到前面
    await clickText(page, '节奏听写', '.card');
    await clickText(page, '开始练习');
    await page.waitForSelector('.choice');
    await sleep(300);
    await answerQuestion(page);
    await page.waitForSelector('.feedback');
    await clickText(page, '返回');
    await sleep(300);
    const after = await exerciseFront(page);
    t.check(after.includes('节奏听写'), `练过的「节奏听写」移到前面（${after.join('、')}）`);
    t.check(!(await moreTitles(page)).includes('节奏听写'), '不再出现在「更多练习」里');
    await t.shot(page, 'm-zh-new-3-after-practice');
    await ctx.close();
  }

  // ───── 引导选「备考」：多突出旋律听写 ─────
  {
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, width: 390, height: 844, onboarding: 'keep', tag: 'zh-exam' });
    await page.waitForSelector('.onboard');
    for (let i = 0; i < 2; i++) await clickText(page, '下一步');
    await clickText(page, '备考', '.onboard-option');
    await clickText(page, '下一步');
    await clickText(page, '下一步');
    await clickText(page, '进入首页');
    await sleep(300);
    const front = await exerciseFront(page);
    t.check(front.length === 4 && front.includes('旋律听写'), `备考：突出 4 个入门练习（${front.join('、')}）`);
    t.check((await readStore(page)).settings.background === 'exam', '记下了所选背景');
    await t.shot(page, 'm-zh-exam-home');
    await ctx.close();
  }

  // ───── 老用户：练过的都在前面 ─────
  {
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, width: 390, height: 844, tag: 'zh-old' });
    await load(page, {
      version: 1,
      settings: settings(),
      exercises: {
        intervals: { level: 2, custom: null, items: stat(12), options: {} },
        harmony: { level: 1, custom: null, items: stat(8), options: {} },
        rhythmTap: { level: 0, custom: null, items: stat(5), options: {} },
        singing: { level: 0, custom: null, items: stat(3), options: {} },
      },
      daily: { [today()]: { n: 28, c: 24 } },
      songs: { 'hot-cross-buns': { best: 70, attempts: 2, practiced: 1, last: Date.now(), lastScore: 70 } },
    });
    const front = await exerciseFront(page);
    for (const s of ['和声听写', '节奏模仿', '视唱 / 模唱', '视唱曲库', '音程识别'])
      t.check(front.includes(s), `老用户：练过的「${s}」在前面`);
    t.check(!!(await page.$('.more-toggle')), `老用户：其余的仍在「更多练习」里（前面 ${front.length} 项）`);
    t.check((await overflowPx(page)) <= 0, '老用户手机首页无横向溢出');
    await t.shot(page, 'm-zh-old-1-home');

    // 累计答满 150 题：全部显示，没有折叠区
    await load(page, { version: 1, settings: settings(), exercises: { degrees: { level: 3, custom: null, items: stat(160), options: {} } }, daily: { '2026-09-01': { n: 100, c: 90 }, [today()]: { n: 60, c: 50 } } });
    t.check(!(await page.$('.more-ex')), '答满 150 题：不再有「更多练习」');
    t.check((await exerciseFront(page)).length === 14, '答满 150 题：13 个练习 + 视唱曲库全部显示');
    await t.shot(page, 'm-zh-old-2-veteran');
    await ctx.close();
  }

  // ───── 英文：手机新用户 + 桌面 ─────
  {
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, lang: 'en-US', width: 375, height: 812, tag: 'en-new' });
    const toggle = await page.$eval('.more-toggle', (e) => e.textContent);
    t.check(toggle.includes('More exercises (11)') && toggle.includes('Show'), `英文：折叠按钮（${toggle}）`);
    const hint = await page.$eval('.more-hint', (e) => e.textContent);
    t.check(/Answer 50 more questions/.test(hint), `英文：解锁提示（${hint}）`);
    t.check((await overflowPx(page)) <= 0, '英文手机无横向溢出');
    await t.shot(page, 'm-en-new-1-collapsed');
    await page.click('.more-toggle');
    await page.waitForSelector('.more-body');
    t.check((await page.$eval('.more-toggle', (e) => e.textContent)).includes('Hide'), '英文：展开后显示 Hide');
    await t.shot(page, 'm-en-new-2-expanded');
    await page.setViewport({ width: 1200, height: 900 });
    await sleep(200);
    await t.shot(page, 'd-en-new-expanded');
    await page.click('.more-toggle');
    await sleep(100);
    await t.shot(page, 'd-en-new-collapsed');
    await ctx.close();
  }

  // ───── 中文桌面新用户 ─────
  {
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, width: 1200, height: 900, tag: 'zh-desktop' });
    await t.shot(page, 'd-zh-new-collapsed');
    await ctx.close();
  }
});
