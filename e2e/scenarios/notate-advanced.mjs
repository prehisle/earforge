// 节奏旋律听写第 8 级，只保留 6/8 与切分两个考点，连做 4 题都应判对（含切分连音线）。原 adv.mjs
import { clickText, run, sleep } from '../lib/harness.mjs';
import { enterAnswer } from '../lib/notate.mjs';

await run(async (t) => {
  const page = await t.open({ width: Number(process.env.E2E_WIDTH || 1024), tag: 'adv' });
  await clickText(page, '节奏旋律听写', '.card');
  await clickText(page, '选项');
  await clickText(page, '8. ', '.panel .seg button');
  await sleep(100);
  const keep = ['6/8', '切分'];
  for (let round = 0; round < 12; round++) {
    let clicked = false;
    for (const c of await page.$$('.chips .chip.on')) {
      const txt = await c.evaluate((e) => e.textContent);
      if (!keep.some((k) => txt.includes(k))) {
        await c.click();
        clicked = true;
        await sleep(60);
        break;
      }
    }
    if (!clicked) break;
  }
  const on = await page.$$eval('.chips .chip.on', (x) => x.map((e) => e.textContent));
  t.check(on.length > 0 && on.every((s) => keep.some((k) => s.includes(k))), `只保留 6/8 与切分考点（${on.join('、')}）`);
  await clickText(page, '选项');
  const meters = new Set();
  for (let k = 0; k < 4; k++) {
    if (await page.$('.start')) await clickText(page, '开始练习');
    else await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.notate') && !document.querySelector('.notate-result'));
    await sleep(100);
    const spec = await enterAnswer(page);
    meters.add(spec.meter.join('/'));
    await sleep(150);
    await t.shot(page, `adv${k}-editing`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.notate-result');
    const fb = await page.$eval('.feedback', (e) => e.className);
    t.check(fb.includes('good'), `第 ${k + 1} 题（${spec.meter.join('/')}，${spec.notes.length} 个音符）判对`);
  }
  t.log('meters', [...meters]);
});
