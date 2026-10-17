// 冒烟测试：首页 → 调内音级 15 题 → 选项 → 旋律听写 5 题 → 视唱（假麦克风）→ 统计 → 设置 → 深色手机首页
// 原 smoke.mjs + dark.mjs
import { clickText, overflowPx, readStore, run, sleep } from '../lib/harness.mjs';

await run(async (t) => {
  await t.launch({ fakeMic: true });
  const page = await t.open({ tag: 'smoke' });
  t.check(!!(await page.$('.today')), '首页显示今日训练');
  await t.shot(page, '1-home');

  // 调内音级：逐个点选项直到出现反馈，作答 15 题
  await clickText(page, '调内音级');
  await clickText(page, '开始练习');
  await sleep(300);
  for (let k = 0; k < 15; k++) {
    for (const c of await page.$$('.choice')) {
      if (await page.$('.feedback')) break;
      await c.click();
      await sleep(30);
    }
    await page.waitForSelector('.feedback');
    if (k === 0) await t.shot(page, '2-degree-answered', { fullPage: false });
    await page.keyboard.press('Enter');
    await sleep(50);
  }
  await clickText(page, '选项');
  t.check(!!(await page.$('.panel')), '调内音级：选项面板可打开');
  await t.shot(page, '3-options');
  await clickText(page, '返回');

  // 旋律听写（多步）：5 题
  await clickText(page, '旋律听写', '.card');
  await clickText(page, '开始练习');
  for (let k = 0; k < 5; k++) {
    for (let g = 0; g < 50 && !(await page.$('.feedback')); g++) {
      for (const c of await page.$$('.choice:not(:disabled)')) {
        const before = await page.$$eval('.slot.ok, .slot.fix', (x) => x.length);
        await c.click();
        const after = await page.$$eval('.slot.ok, .slot.fix', (x) => x.length);
        if (after > before || (await page.$('.feedback'))) break;
      }
    }
    await page.waitForSelector('.feedback');
    if (k === 0) await t.shot(page, '4-dictation', { fullPage: false });
    await page.keyboard.press('Enter');
  }
  await clickText(page, '返回');

  // 视唱（Chrome 假麦克风）
  await clickText(page, '视唱', '.card');
  await clickText(page, '开始练习');
  await sleep(1500);
  await t.shot(page, '5-sing', { fullPage: false });
  await clickText(page, '跳过这个音');
  await clickText(page, '返回');

  await clickText(page, '统计');
  await sleep(200);
  t.check((await page.$eval('h1', (e) => e.textContent)) === '统计', '统计页打开');
  await t.shot(page, '6-stats');
  await clickText(page, '返回');
  await clickText(page, '设置');
  t.check((await page.$eval('h1', (e) => e.textContent)) === '设置', '设置页打开');
  await t.shot(page, '7-settings');
  await clickText(page, '返回');

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 390, height: 844 });
  await sleep(200);
  t.check((await overflowPx(page)) <= 0, '深色手机首页无横向溢出');
  await t.shot(page, '8-home-dark-mobile');

  const store = await readStore(page);
  const days = Object.values(store?.daily ?? {});
  const ex = days.at(-1)?.ex ?? {};
  t.log('daily', JSON.stringify(store?.daily));
  t.check(ex.degrees?.[0] >= 15, `今日记录：调内音级 ≥ 15 次作答（${ex.degrees?.[0]}）`);
  t.check(ex.dictation?.[0] >= 5, `今日记录：旋律听写 ≥ 5（${ex.dictation?.[0]}）`);
  t.check(ex.singing?.[0] >= 1, `今日记录：视唱 ≥ 1（${ex.singing?.[0]}）`);
});
