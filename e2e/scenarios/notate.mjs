// 节奏旋律听写（记谱作答）：正确作答判对 → 故意写错（改音高 + 多写一个音）判错并标红 → 编辑键（退格 / Ctrl+Z）→
// 对比试听 → 溢出与漏翻检查 → 选项面板；另外第 5–9 级（附点、十六分、切分连音、6/8、变化音）各两题。
// 默认跑两组：中文 + 键盘输入、英文 + 点击输入（原 rdict.mjs 用参数选择其一）。
// E2E_NOTATE=zh-CN:kbd,en-US:click 可自定义组合。原 rdict.mjs
import { CJK, clickText, overflowPx, run, sleep } from '../lib/harness.mjs';
import { enter, enterAnswer, newCursor, plan, readEditor, readSpec } from '../lib/notate.mjs';

const combos = (process.env.E2E_NOTATE ?? 'zh-CN:kbd,en-US:click').split(',').map((s) => s.split(':'));

await run(async (t) => {
  const browser = await t.launch();
  for (const [lang, input] of combos) {
    // 每组用独立的浏览器上下文：语言设置存在 localStorage 里，不能与上一组共用
    const ctx = await browser.createBrowserContext();
    const zh = lang.startsWith('zh');
    const tag = `${zh ? 'zh' : 'en'}-${input}`;
    const L = zh
      ? { card: '节奏旋律听写', start: '开始练习', submit: '提交', yours: '听你写的', options: '选项', pitch: '音高' }
      : { card: 'Melody + Rhythm', start: 'Start', submit: 'Submit', yours: 'Play yours', options: 'Options', pitch: 'Pitch' };

    for (const [width, dark] of [
      [1024, false],
      [375, false],
      [375, true],
      [1024, true],
    ]) {
      const id = `${tag}-${width}-${dark ? 'dark' : 'light'}`;
      const page = await t.open({ target: ctx, lang, width, dark, tag: id });
      await clickText(page, L.card, '.card');
      await sleep(200);
      await t.shot(page, `${id}-1-intro`);
      await clickText(page, L.start);
      await page.waitForSelector('.notate');
      await sleep(200);

      // 1) 正确作答（先写一半截图）
      const spec = await readSpec(page);
      const ops = plan(spec);
      const half = Math.ceil(ops.length / 2);
      const cur1 = newCursor();
      await enter(page, ops.slice(0, half), cur1, input);
      await sleep(150);
      await t.shot(page, `${id}-2-editing`);
      await enter(page, ops.slice(half), cur1, input);
      await sleep(100);
      const status = await page.$eval('.notate-status', (e) => e.className);
      if (!t.check(status.includes('full'), `${id}: 写满后状态为 full（${status}）`))
        t.log('spec', JSON.stringify(spec.notes), '\nuser', JSON.stringify((await readEditor(page)).notes), '\nops', JSON.stringify(ops));
      if (input === 'kbd') await page.keyboard.press('Enter');
      else await clickText(page, L.submit, '.notate-submit button');
      await page.waitForSelector('.notate-result');
      const sum1 = await page.$eval('.notate-summary', (e) => e.textContent);
      const fb1 = await page.$eval('.feedback', (e) => e.className);
      const bad1 = await page.$$eval('.notate-result .staff-bad', (x) => x.length);
      t.check(fb1.includes('good') && !bad1, `${id}: 正确答案判对（${sum1}）`);
      await t.shot(page, `${id}-3-correct`);

      // 2) 错误作答：下一题，第二个音改音高、末尾多写一个八分音
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.notate') && !document.querySelector('.notate-result'));
      await sleep(200);
      const spec2 = await readSpec(page);
      const notes = spec2.notes.map((n) => ({ ...n }));
      const iPitch = notes.findIndex((n, i) => i > 0 && n.rel !== null);
      notes[iPitch].rel = notes[iPitch].rel === 4 ? 5 : 4;
      await enter(page, plan({ ...spec2, notes }), newCursor(), input);
      if (input === 'kbd') {
        await page.keyboard.press('e');
        await page.keyboard.press('1');
      } else {
        await (await page.$$('.notate-durs .notate-btn'))[3].click();
        await sleep(20);
        await (await page.$$('.notate-pitches .notate-btn'))[0].click();
      }
      await sleep(100);
      const over = await page.$eval('.notate-status', (e) => e.className + ' ' + e.textContent);
      // 退格再撤销（验证编辑键），保持多写的那个音
      await page.keyboard.press('Backspace');
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await sleep(50);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.notate-result');
      const sum2 = await page.$eval('.notate-summary', (e) => e.textContent);
      const fb2 = await page.$eval('.feedback', (e) => e.className);
      const bad2 = await page.$$eval('.notate-result .staff-bad', (x) => x.length);
      t.check(over.includes('over'), `${id}: 多写时状态为 over（${over}）`);
      t.check(fb2.includes('bad') && bad2 >= 2, `${id}: 写错判错，错处标红（${bad2} 处）`);
      const pn = spec2.notes.filter((n) => n.rel !== null).length;
      const expect = `${L.pitch} ${pn - 1}/${pn}`;
      t.check(sum2.includes(expect), `${id}: 小结「${sum2}」含「${expect}」`);
      await clickText(page, L.yours, '.notate-result .compare-row button');
      await t.shot(page, `${id}-4-wrong`);

      const overflow = await overflowPx(page);
      t.check(overflow <= 1, `${id}: 无横向溢出（${overflow}px）`);
      if (!zh) {
        const cjk = (await page.evaluate(() => document.body.innerText)).match(new RegExp(CJK.source, 'g'));
        t.check(!cjk, `${id}: 英文界面无中文${cjk ? `（${cjk.join('')}）` : ''}`);
      }
      await clickText(page, L.options);
      await sleep(100);
      await t.shot(page, `${id}-5-options`);
      await page.close();
    }

    // 高级别：附点、十六分、切分连音、6/8、变化音，各做两题
    const page = await t.open({ target: ctx, lang, width: 1024, tag: `${tag}-levels` });
    await clickText(page, L.card, '.card');
    await clickText(page, L.options);
    for (const lv of [5, 6, 7, 8, 9]) {
      await clickText(page, `${lv}. `, '.panel .seg button');
      await sleep(100);
      for (let k = 0; k < 2; k++) {
        if (await page.$('.start')) await clickText(page, L.start);
        else await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('.notate') && !document.querySelector('.notate-result'));
        await sleep(100);
        const spec = await enterAnswer(page, input);
        await sleep(100);
        if (k === 0) await t.shot(page, `${tag}-level${lv}-editing`);
        await page.keyboard.press('Enter');
        await page.waitForSelector('.notate-result');
        const fb = await page.$eval('.feedback', (e) => e.className);
        t.check(fb.includes('good'), `${tag} 第 ${lv} 级第 ${k + 1} 题（${spec.meter.join('/')}）判对`);
        if (k === 0) await t.shot(page, `${tag}-level${lv}-result`);
      }
    }
    await ctx.close();
  }
});
