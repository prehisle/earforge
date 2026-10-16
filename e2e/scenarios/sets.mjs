// 练习组合：编辑页新建（3 个练习、校验提示、选项 / 比重 / 题数）→ 保存 → 重新加载 → 练完一组到小结 → 再来一组 →
// 编辑 → 复制 → 分享 → 删除 → 从模板新建；375px 手机截图；英文界面走一遍（模板 → 自定义题数 → 练完）。
import { CJK, clickText, overflowPx, readStore, run, sleep, textOf } from '../lib/harness.mjs';

await run(async (t) => {
  const page = await t.open({ tag: 'sets-zh' });
  page.on('dialog', (d) => void d.accept());

  /** 在第 i 个组合里按文字点按钮 */
  const itemBtn = async (i, text) => {
    const items = await page.$$('.set-item');
    for (const b of await items[i].$$('button')) if ((await b.evaluate((e) => e.textContent)).includes(text)) return b;
    throw new Error(`第 ${i} 个组合没有按钮「${text}」`);
  };
  /** 在某个练习的设置面板里按文字点按钮 */
  const partBtn = async (title, text, exact = true) => {
    for (const p of await page.$$('.set-part')) {
      if (!(await p.$eval('h3', (e) => e.textContent)).includes(title)) continue;
      for (const b of await p.$$('button')) {
        const s = (await b.evaluate((e) => e.textContent)).trim();
        if (exact ? s === text : s.includes(text)) return b.click();
      }
    }
    throw new Error(`练习「${title}」里没有按钮「${text}」`);
  };
  const setCount = async (n) => {
    const input = await page.$('.set-count-input');
    await input.click();
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await input.type(String(n));
  };
  /** 一直作答到小结，返回题数与出现过的模块 */
  const runToSummary = async () => {
    const seen = new Set();
    let n = 0;
    for (let g = 0; g < 2000 && !(await page.$('.summary')); g++) {
      const m = await page.$('.q-module');
      if (m) seen.add((await m.evaluate((e) => e.textContent)).trim());
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
  };

  // 1. 首页入口 → 空列表
  const card = await page.$$eval('.card .card-title', (x) => x.map((e) => e.textContent));
  t.check(card.includes('自定义练习'), '首页有「自定义练习」卡片');
  await clickText(page, '自定义练习', '.card');
  await page.waitForSelector('.sets');
  t.check(!!(await page.$('.sets-empty')), '没有组合时显示空状态');
  await t.shot(page, '01-sets-empty');

  // 2. 新建：先不填写直接保存 → 校验提示
  await clickText(page, '新建组合');
  await page.waitForSelector('.set-builder');
  await clickText(page, '保存', 'button', true);
  await sleep(100);
  const err1 = await page.$eval('.set-errors', (e) => e.textContent).catch(() => '');
  t.check(err1.includes('请填写名称') && err1.includes('至少添加一个练习'), `空白组合的校验提示（${err1}）`);
  await page.type('.set-builder input[type=text]', '我的组合');
  for (const title of ['音程识别', '和弦性质', '节奏听写']) await clickText(page, title, '.set-add button');
  await sleep(100);
  t.check((await page.$$('.set-part')).length === 3, '添加了 3 个练习');
  t.check((await page.$$eval('.set-add button', (x) => x.map((e) => e.textContent))).every((s) => !s.includes('视唱 / 模唱') && !s.includes('节奏模仿')), '视唱与节奏模仿不能添加');
  // 音程：清空 → 提示至少 2 个；再选第 1 级 + 大三度，方向选混合
  await partBtn('音程识别', '清空');
  await sleep(100);
  const err2 = await page.$eval('.set-errors', (e) => e.textContent).catch(() => '');
  t.check(err2.includes('音程识别') && err2.includes('至少选 2 个考点'), `考点不足的提示（${err2}）`);
  await partBtn('音程识别', '第 1 级');
  await partBtn('音程识别', '大三度');
  await partBtn('音程识别', '混合');
  await partBtn('和弦性质', '×2');
  await setCount(6);
  await sleep(100);
  t.check(!(await page.$('.set-errors')), '修正后校验提示消失');
  await t.shot(page, '02-builder');
  await clickText(page, '保存', 'button', true);
  await page.waitForSelector('.set-item');
  let st = await readStore(page);
  const saved = st.sets?.[0];
  t.check(st.sets?.length === 1 && saved.name === '我的组合' && saved.count === 6, `保存了组合（${JSON.stringify(saved)}）`);
  t.check(
    saved?.parts.map((p) => p.ex).join() === 'intervals,chords,rhythm' &&
      saved.parts[0].items.join() === 'P5,P8,M3' &&
      saved.parts[0].options.dir === 'mix' &&
      saved.parts[1].weight === 2,
    '考点、选项与比重正确',
  );

  // 3. 重新加载后仍在；首页卡片显示数量
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  const meta = await page.$$eval('.card', (x) => x.map((e) => e.textContent).find((s) => s.includes('自定义练习')) ?? '');
  t.check(meta.includes('已保存 1 个组合'), `首页卡片显示已保存数量（${meta}）`);
  await clickText(page, '自定义练习', '.card');
  await page.waitForSelector('.set-item');
  t.check((await page.$eval('.set-item h2', (e) => e.textContent)) === '我的组合', '重新加载后组合仍在');

  // 4. 练完一组 → 小结（记入统计）→ 再来一组
  const before = Object.values((await readStore(page)).daily).at(-1)?.n ?? 0;
  await (await itemBtn(0, '开始')).click();
  await page.waitForSelector('.q-module');
  await t.shot(page, '03-run-question', { fullPage: false });
  const r = await runToSummary();
  t.log('run', r);
  t.check(r.done && r.n === 6, `练完 6 题显示小结（${r.n} 题）`);
  t.check(r.seen.length >= 2, `题目来自多个练习（${r.seen.join('、')}）`);
  const after = Object.values((await readStore(page)).daily).at(-1)?.n ?? 0;
  t.check(after - before >= 6, `作答记入每日统计（${before} → ${after}）`);
  t.check((await page.$eval('.summary', (e) => e.textContent)).includes('返回组合列表'), '小结有「返回组合列表」');
  await t.shot(page, '04-run-summary');
  await clickText(page, '再来一组');
  await page.waitForSelector('.q-module');
  const prog = await page.$eval('.practice-title p', (e) => e.textContent);
  t.check(prog.includes('第 1/6 题'), `再来一组从第 1 题开始（${prog}）`);
  await clickText(page, '返回');
  await page.waitForSelector('.set-item');

  // 5. 编辑：改名、移除节奏听写
  await (await itemBtn(0, '编辑')).click();
  await page.waitForSelector('.set-builder');
  t.check((await page.$eval('h1', (e) => e.textContent)) === '编辑组合', '编辑页标题');
  t.check((await page.$eval('.set-builder input[type=text]', (e) => e.value)) === '我的组合', '编辑页带出原名称');
  await page.type('.set-builder input[type=text]', ' 2');
  await page.click('button[aria-label="移除「节奏听写」"]');
  await clickText(page, '保存', 'button', true);
  await page.waitForSelector('.set-item');
  st = await readStore(page);
  t.check(st.sets.length === 1 && st.sets[0].id === saved.id && st.sets[0].name === '我的组合 2' && st.sets[0].parts.length === 2, '编辑后覆盖原组合');

  // 6. 复制
  await (await itemBtn(0, '复制')).click();
  await sleep(150);
  const names = await page.$$eval('.set-item h2', (x) => x.map((e) => e.textContent));
  t.check(names.length === 2 && names[1] === '我的组合 2（副本）', `复制（${names.join(' / ')}）`);

  // 7. 分享：复制链接（替换剪贴板以读出内容）；复制失败时显示链接供手动复制
  const share = await itemBtn(0, '分享');
  t.check(!(await share.evaluate((e) => e.disabled)), '分享按钮可用');
  await page.evaluate(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (s) => void window.__copied.push(s) },
    });
  });
  await share.click();
  await page.waitForSelector('.set-share', { timeout: 3000 }).catch(() => {});
  const copied = await page.evaluate(() => window.__copied);
  t.check((await textOf(page, '.set-share').catch(() => '')).includes('链接已复制'), '分享：提示链接已复制');
  t.check(copied.length === 1 && copied[0].startsWith(`${t.base}#s=`), `分享：复制的是本应用的分享链接（${copied[0]?.length ?? 0} 字符）`);
  await clickText(page, '关闭', '.set-share button');
  t.check(!(await page.$('.set-share')), '关闭分享提示');
  // 剪贴板不可用：显示链接，可全选
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
  });
  await (await itemBtn(0, '分享')).click();
  await page.waitForSelector('.set-share input', { timeout: 3000 }).catch(() => {});
  const link = await page.$eval('.set-share input', (e) => e.value).catch(() => '');
  t.check(link === copied[0], '复制失败时显示同一链接供手动复制');
  await clickText(page, '关闭', '.set-share button');

  // 8. 删除（确认）
  await (await itemBtn(1, '删除')).click();
  await sleep(150);
  t.check((await page.$$('.set-item')).length === 1 && (await readStore(page)).sets.length === 1, '删除副本');

  // 9. 从模板新建并开始
  await clickText(page, '和声综合');
  await page.waitForSelector('.set-builder');
  t.check((await page.$$('.set-part')).length === 4, '模板「和声综合」有 4 个练习');
  t.check((await page.$eval('.set-builder input[type=text]', (e) => e.value)) === '和声综合', '模板带出名称');
  await clickText(page, '保存并开始');
  await page.waitForSelector('.q-module');
  t.check((await page.$eval('.practice-title p', (e) => e.textContent)).includes('/20'), '模板组合 20 题');
  await clickText(page, '返回');
  await page.waitForSelector('.set-item');
  t.check((await page.$$('.set-item')).length === 2, '模板组合已保存');

  // 10. 手机 375px
  await page.setViewport({ width: 375, height: 812 });
  await sleep(200);
  t.check((await overflowPx(page)) <= 0, '手机列表页无横向溢出');
  await t.shot(page, '05-mobile-list');
  await (await itemBtn(1, '编辑')).click();
  await page.waitForSelector('.set-builder');
  await sleep(200);
  t.check((await overflowPx(page)) <= 0, '手机编辑页无横向溢出');
  await t.shot(page, '06-mobile-builder');
  await clickText(page, '取消');
  await (await itemBtn(0, '开始')).click();
  await page.waitForSelector('.q-module');
  t.check((await overflowPx(page)) <= 0, '手机练习页无横向溢出');
  await t.shot(page, '07-mobile-run', { fullPage: false });

  // 11. 英文界面
  const ctx = await (t.browsers[0] ?? (await t.launch())).createBrowserContext();
  const en = await t.open({ target: ctx, lang: 'en-US', width: 375, height: 812, tag: 'sets-en' });
  await clickText(en, 'Custom practice', '.card');
  await en.waitForSelector('.sets');
  await clickText(en, 'Intervals + chord qualities');
  await en.waitForSelector('.set-builder');
  const enInput = await en.$('.set-count-input');
  await enInput.click({ clickCount: 3 });
  await en.keyboard.down('Control');
  await en.keyboard.press('a');
  await en.keyboard.up('Control');
  await en.keyboard.press('Backspace');
  await enInput.type('5');
  await t.shot(en, '08-en-builder');
  await clickText(en, 'Save', 'button', true);
  await en.waitForSelector('.set-item');
  t.check((await en.$eval('.set-item h2', (e) => e.textContent)) === 'Intervals + chord qualities', '英文模板名称');
  const cjk = await en.evaluate((src) => {
    let text = document.body.innerText;
    for (const el of document.querySelectorAll('.logo')) text = text.split(el.innerText).join('');
    return text.match(new RegExp(`.{0,20}${src}.{0,20}`))?.[0] ?? '';
  }, CJK.source);
  t.check(!cjk, `英文列表页没有中文（${cjk}）`);
  await t.shot(en, '09-en-list');
  for (const b of await en.$$('.set-actions button')) if ((await b.evaluate((e) => e.textContent)) === 'Start') await b.click();
  await en.waitForSelector('.q-module');
  // 英文练完（5 题）
  let n = 0;
  for (let g = 0; g < 1000 && !(await en.$('.summary')); g++) {
    if (await en.$('.feedback')) {
      n++;
      await en.keyboard.press('Enter');
      await sleep(60);
      continue;
    }
    const c = await en.$('.choice:not(:disabled):not(.bad)');
    if (c) await c.click();
    await sleep(20);
  }
  const sum = await en.$eval('.summary', (e) => e.textContent).catch(() => '');
  t.check(n === 5 && sum.includes('Back to sets') && sum.includes('Another set'), `英文练完 5 题到小结（${n}）`);
  t.check((await overflowPx(en)) <= 0, '英文手机小结无横向溢出');
  await t.shot(en, '10-en-summary');
});
