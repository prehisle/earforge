// 今日训练里的记谱题：先做一题节奏旋律听写（模块算「已开始」），再练今日训练，
// 其中的记谱题都正确作答应判对，且至少出现一道。原 mix.mjs
import { clickText, run, sleep } from '../lib/harness.mjs';
import { enterAnswer } from '../lib/notate.mjs';

await run(async (t) => {
  const page = await t.open({ width: 375, tag: 'notate-mix' });
  await clickText(page, '节奏旋律听写', '.card');
  await clickText(page, '开始练习');
  await page.waitForSelector('.notate');
  await enterAnswer(page);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.notate-result');
  await clickText(page, '返回');
  await sleep(200);
  await clickText(page, '开始今日训练');
  let notate = 0;
  let total = 0;
  for (let k = 0; k < 40; k++) {
    await sleep(150);
    if (!(await page.$('.question'))) break;
    if (await page.$('.notate:not(.notate-result)')) {
      await enterAnswer(page);
      if (notate === 0) await t.shot(page, 'mix-notate-editing');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.notate-result');
      const fb = await page.$eval('.feedback', (e) => e.className);
      t.check(fb.includes('good'), `今日训练第 ${total + 1} 题（记谱）判对`);
      notate++;
    } else {
      for (let g = 0; g < 50 && !(await page.$('.feedback')); g++) {
        for (const c of await page.$$('.choice')) {
          if (await page.$('.feedback')) break;
          await c.click();
          await sleep(30);
        }
      }
    }
    total++;
    await page.waitForSelector('.feedback');
    await sleep(50);
    await page.keyboard.press('Enter');
  }
  await sleep(300);
  await t.shot(page, 'mix-summary');
  t.log('mix total', total, 'notate', notate);
  t.check(notate > 0, `今日训练出现记谱题（共 ${total} 题，记谱 ${notate} 题）`);
  t.check(!!(await page.$('.summary')), '今日训练完成并显示小结');
});
