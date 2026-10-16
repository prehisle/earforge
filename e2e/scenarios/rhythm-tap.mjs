// 节奏模仿：看谱打全对 → 故意出错（漏打/偏晚/多打）→ 再试一次不计成绩 → 听后打 + 2 小节 + 深色窄屏 + 指针点击 →
// 回归节奏听写与调内音级 → 今日训练不出现节奏模仿
// 原 y.mjs。对时间敏感：运行器单独（串行）跑它。
import { clickText, readStore, run, sleep, textOf } from '../lib/harness.mjs';

await run(async (t) => {
  const page = await t.open({ height: 1000, tag: 'tap' });
  const text = (sel) => textOf(page, sel);
  const tapItems = async () => JSON.stringify((await readStore(page)).exercises.rhythmTap.items);

  /** 对齐 node 与页面的 performance 时钟（取往返中点），返回 页面时钟 - node 时钟 */
  async function clockShift() {
    const t1 = performance.now();
    const pnow = await page.evaluate(() => performance.now());
    const t2 = performance.now();
    return pnow - (t1 + t2) / 2;
  }

  /** 等到进入预备拍，按 plan(onsets) 给出的时刻（ms，相对节奏型开始）敲键 */
  async function tapAt(plan, key = 'Space') {
    await page.waitForSelector('.tap-pad.count, .tap-pad.tap', { timeout: 20000 });
    await sleep(1500); // 无头模式的假音频设备刚启动时时钟会停顿后跳变，预备拍里多等一会儿再读起点
    const { start, onsets } = await page.$eval('.tap-pad', (e) => ({ start: Number(e.dataset.start), onsets: e.dataset.onsets.split(',').map(Number) }));
    const shift = await clockShift();
    const times = plan(onsets);
    for (const ms of times) {
      // 起点每帧按最新时钟对应关系更新：无头模式的假音频设备时钟不稳，敲之前重新读
      let at = start + ms - shift;
      while (performance.now() < at - 40) {
        await sleep(10);
        at = (await page.$eval('.tap-pad', (e) => Number(e.dataset.start))) + ms - shift;
      }
      while (performance.now() < at) {
        // 忙等到精确时刻
      }
      await page.keyboard.down(key);
      await page.keyboard.up(key);
    }
    return { onsets, times };
  }
  const waitResult = () => page.waitForSelector('.tap-pad.result', { timeout: 20000 });
  const result = async () => ({ status: await text('.tap-status'), summary: await text('.tap-summary'), fb: await text('.feedback strong') });

  // 预热：无头模式的假音频设备第一次启动时时钟会停顿再跳变，先在节奏听写里放一段声音
  await clickText(page, '节奏听写', '.card');
  await clickText(page, '开始练习');
  await sleep(3000);
  await clickText(page, '返回');
  await clickText(page, '节奏模仿', '.card');
  await sleep(100);
  await clickText(page, '选项');
  await clickText(page, '5. ', 'button');
  await clickText(page, '选项');
  await sleep(100);
  const title = await text('.practice-title p');
  t.check(title.includes('第 5 级'), `选到第 5 级（${title}）`);
  await clickText(page, '开始练习');

  // 1. 全对（看谱打）
  await tapAt((on) => on);
  await waitResult();
  await sleep(100);
  let r = await result();
  t.check(r.status.includes('打准了') && r.fb.includes('正确'), `看谱打：按谱敲准判为正确（${r.status} | ${r.fb}）`);
  await t.shot(page, 't1-perfect');
  const items1 = JSON.parse(await tapItems());
  t.check(Object.values(items1).some((x) => x.n === 1 && x.c === 1), '成绩记录：1 次正确');

  // 2. 下一题：故意出错（漏打第二个、第三个偏晚 200ms、末尾多打一个），用字母键
  await page.keyboard.press('Enter');
  await sleep(150);
  await tapAt((on) => {
    const out = on.map((x, i) => (i === 2 ? x + 200 : x)).filter((_, i) => i !== 1);
    out.push(on[on.length - 1] + 250);
    return out.sort((a, b) => a - b);
  }, 'KeyJ');
  await waitResult();
  await sleep(100);
  r = await result();
  t.check(r.status.includes('没打准') && /漏打|多打/.test(r.summary) && !r.fb.includes('正确'), `故意出错：判为没打准，显示漏打或多打（${r.status} | ${r.summary}）`);
  await t.shot(page, 't2-wrong');
  const n1 = await tapItems();
  t.check(Object.values(JSON.parse(n1)).some((x) => x.n === 1 && x.c === 0), '成绩记录：1 次错误');

  // 3. 再试一次（空格），这次打准，成绩不变
  await page.keyboard.press('Space');
  await tapAt((on) => on.map((x) => x + 40)); // 整体偏晚 40ms
  await waitResult();
  await sleep(100);
  r = await result();
  t.check(r.status.includes('打准了') && r.summary.includes('不计成绩'), `再试一次：打准但不计成绩（${r.status} | ${r.summary}）`);
  await t.shot(page, 't3-retry');
  t.check((await tapItems()) === n1, '再试一次后成绩不变');

  // 4. 听后打 + 2 小节 + 深色 + 窄屏，点击敲击区输入
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 390, height: 900 });
  await clickText(page, '选项');
  await clickText(page, '听后打', 'button', true);
  await clickText(page, '2 小节', 'button', true);
  if (await page.$('.panel')) await clickText(page, '选项');
  await sleep(100);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Enter'); // 选项对下一题生效
  await sleep(300);
  await page.waitForSelector('.tap-pad.listen', { timeout: 5000 });
  t.check(!(await page.$('.tap-score')), '听后打：试听时不显示节奏谱');
  await t.shot(page, 't4-listen-dark');
  await page.waitForSelector('.tap-pad.count', { timeout: 20000 });
  t.check(!(await page.$('.tap-score')), '听后打：预备拍时不显示节奏谱');
  await sleep(400);
  {
    // 用指针点击敲击区
    const { start, onsets } = await page.$eval('.tap-pad', (e) => ({ start: Number(e.dataset.start), onsets: e.dataset.onsets.split(',').map(Number) }));
    await page.$eval('.tap-pad', (e) => e.scrollIntoView({ block: 'center' }));
    await sleep(50);
    const box = await (await page.$('.tap-pad')).boundingBox();
    const shift = await clockShift();
    for (const ms of onsets) {
      const at = start + ms - shift;
      while (performance.now() < at - 15) await sleep(5);
      while (performance.now() < at) {
        // 忙等
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
    }
  }
  await waitResult();
  await sleep(100);
  r = await result();
  t.check(r.status.includes('打准了') && !!(await page.$('.tap-score')), `听后打（指针）：打准，结果页显示节奏谱（${r.status}）`);
  await t.shot(page, 't5-listen-dark-result');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setViewport({ width: 900, height: 1000 });
  await clickText(page, '返回');

  // 5. 回归：节奏听写、调内音级照常
  async function answer(k) {
    for (let i = 0; i < k; i++) {
      for (let g = 0; g < 50 && !(await page.$('.feedback')); g++) {
        const c = await page.$('.choice:not(:disabled):not(.bad)');
        if (c) await c.click();
        await sleep(25);
      }
      await page.keyboard.press('Enter');
      await sleep(80);
    }
  }
  await clickText(page, '节奏听写', '.card');
  await clickText(page, '开始练习');
  await sleep(200);
  await page.keyboard.press('Space'); // 重听
  await sleep(100);
  await answer(5);
  const rs = await text('.session');
  const nChoices = (await page.$$('.choice')).length;
  t.check(/5 题/.test(rs) && nChoices >= 2, `节奏听写照常（${rs}，${nChoices} 个选项）`);
  await t.shot(page, 't6-rhythm-regression', { fullPage: false });
  await clickText(page, '返回');
  await clickText(page, '调内音级', '.card');
  await clickText(page, '开始练习');
  await sleep(200);
  await answer(5);
  const ds = await text('.session');
  t.check(/5 题/.test(ds), `调内音级照常（${ds}）`);
  await clickText(page, '返回');

  // 6. 今日训练不出现节奏模仿
  await clickText(page, '开始今日训练');
  await page.waitForSelector('.q-module');
  const seen = new Set();
  let sawTap = false;
  for (let g = 0; g < 3000 && !(await page.$('.summary')); g++) {
    const m = await page.$('.q-module');
    if (m) seen.add(await m.evaluate((e) => e.textContent));
    if (await page.$('.tap-pad')) {
      sawTap = true;
      break;
    }
    if (await page.$('.feedback')) {
      await page.keyboard.press('Enter');
      await sleep(60);
      continue;
    }
    const c = await page.$('.choice:not(:disabled):not(.bad)');
    if (c) await c.click();
    await sleep(20);
  }
  t.check(!sawTap && !!(await page.$('.summary')), `今日训练完成且不含节奏模仿（${[...seen].join('、')}）`);
  await clickText(page, '返回首页');
  await t.shot(page, 't7-home');
});
