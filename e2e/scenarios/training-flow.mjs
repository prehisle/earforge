// 训练流程：今日训练一组 → 调内音级切自然小调 → 节奏听写 → 统计页专练小调薄弱点 → 第二组今日训练（应含节奏）
// 原 merge.mjs
import { clickText, overflowPx, readStore, run, sleep, textOf } from '../lib/harness.mjs';

await run(async (t) => {
  const page = await t.open({ tag: 'flow' });
  const text = (sel) => textOf(page, sel);

  /** 作答 k 题（点第一个可点的选项，制造一些错误） */
  async function answerOne() {
    for (let g = 0; g < 50 && !(await page.$('.feedback')); g++) {
      const c = await page.$('.choice:not(:disabled):not(.bad)');
      if (c) await c.click();
      await sleep(25);
    }
  }
  async function answer(k) {
    for (let i = 0; i < k; i++) {
      await answerOne();
      await page.keyboard.press('Enter');
      await sleep(80);
    }
  }
  async function mixUntilSummary() {
    const seen = new Set();
    let n = 0;
    for (let g = 0; g < 3000 && !(await page.$('.summary')); g++) {
      const m = await page.$('.q-module');
      if (m) seen.add(await m.evaluate((e) => e.textContent));
      if (await page.$('.feedback')) {
        n++;
        await page.keyboard.press('Enter');
        await sleep(60);
        continue;
      }
      const c = await page.$('.choice:not(:disabled):not(.bad)');
      if (c) await c.click();
      await sleep(20);
    }
    return { n, seen: [...seen], done: !!(await page.$('.summary')) };
  }

  // 1. 今日训练一组（新用户）
  await clickText(page, '开始今日训练');
  await page.waitForSelector('.q-module');
  const r1 = await mixUntilSummary();
  t.log('mix1', r1);
  t.check(r1.done && r1.n >= 10, `第一组今日训练完成并显示小结（${r1.n} 题，${r1.seen.join('、')}）`);
  await t.shot(page, 'm1-mix-summary');
  await clickText(page, '返回首页');

  // 2. 调内音级切到自然小调
  await clickText(page, '调内音级', '.card');
  await clickText(page, '选项');
  await clickText(page, '自然小调', 'button', true);
  await sleep(100);
  const minorTitle = await text('.practice-title p');
  const minorPoints = await text('.start .muted');
  t.check(/\bme\b/.test(minorTitle) && /\bme\b/.test(minorPoints), `小调考点含 me（${minorTitle} | ${minorPoints}）`);
  await clickText(page, '选项');
  await clickText(page, '开始练习');
  await sleep(200);
  await answer(10);
  await answerOne();
  await t.shot(page, 'm2-degrees-minor', { fullPage: false });
  // 切回大调，之后从统计页专练小调的薄弱点
  await clickText(page, '选项');
  await clickText(page, '大调', 'button', true);
  await sleep(100);
  const majorTitle = await text('.practice-title p');
  t.check(/\bmi\b/.test(majorTitle) && !/\bme\b/.test(majorTitle), `切回大调考点含 mi（${majorTitle}）`);
  await clickText(page, '返回');

  // 3. 节奏听写
  await clickText(page, '节奏听写', '.card');
  await clickText(page, '开始练习');
  await sleep(200);
  await t.shot(page, 'm3-rhythm', { fullPage: false });
  await answer(6);
  const rs = await text('.session');
  t.check(/6 题/.test(rs), `节奏听写计数（${rs}）`);
  await clickText(page, '返回');

  // 4. 统计页 → 专练小调薄弱点
  await clickText(page, '统计');
  await sleep(100);
  await t.shot(page, 'm4-stats');
  let clicked = '';
  for (const p of await page.$$('.panel')) {
    const h = await p.$('h2');
    const tt = h ? await h.evaluate((e) => e.textContent) : '';
    const b = await p.$('.weak-btn');
    if (tt.includes('调内音级') && tt.includes('自然小调') && b) {
      clicked = tt;
      await b.click();
      break;
    }
  }
  t.check(!!clicked, `统计页有「调内音级 · 自然小调」的专练按钮（${clicked}）`);
  await sleep(100);
  const focusTitle = await text('.practice-title p');
  t.check(focusTitle.includes('专练薄弱点') && focusTitle.includes('自然小调'), `专练页标题（${focusTitle}）`);
  await t.shot(page, 'm5-focus-minor-start', { fullPage: false });
  const before = (await readStore(page)).exercises.degrees;
  await clickText(page, '开始练习');
  await sleep(200);
  const prompt = await text('.prompt');
  const labels = await page.$$eval('.choice-label', (x) => x.map((e) => e.textContent));
  t.log('focus prompt:', prompt, 'choices:', labels);
  t.check(prompt.includes('小调') && !labels.includes('mi'), `专练题目是小调（${prompt}；${labels.join(' ')}）`);
  await answer(4);
  await t.shot(page, 'm6-focus-minor-question', { fullPage: false });
  const after = (await readStore(page)).exercises.degrees;
  const changed = Object.keys(after.items).filter((k) => after.items[k].n !== (before.items[k]?.n ?? 0));
  t.check(after.options.mode === 'major' && before.options.mode === 'major', '专练不改变模块的调式设置（仍为大调）');
  t.check(after.custom == null, '专练不留下自定义考点');
  t.check(changed.length > 0 && changed.every((k) => k.startsWith('minor:')), `专练记录到小调考点（${changed.join(', ')}）`);
  await clickText(page, '返回');

  // 5. 第二组今日训练（应包含节奏）
  await clickText(page, '开始今日训练');
  await page.waitForSelector('.q-module');
  await sleep(200);
  await t.shot(page, 'm7-mix2-question', { fullPage: false });
  const r2 = await mixUntilSummary();
  t.log('mix2', r2);
  t.check(r2.done, `第二组今日训练完成（${r2.n} 题）`);
  t.check(r2.seen.some((s) => s.includes('节奏听写')), `第二组含节奏听写（${r2.seen.join('、')}）`);
  await t.shot(page, 'm8-mix2-summary');
  await clickText(page, '返回首页');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 390, height: 844 });
  await t.shot(page, 'm9-home-dark-mobile');
  await clickText(page, '统计');
  await sleep(200);
  t.check((await overflowPx(page)) <= 0, '深色手机统计页无横向溢出');
  await t.shot(page, 'm10-stats-dark-mobile');
  const daily = Object.values((await readStore(page)).daily).at(-1);
  t.check(daily.n >= 50, `今日记录总题数（${daily.n}）`);
});
