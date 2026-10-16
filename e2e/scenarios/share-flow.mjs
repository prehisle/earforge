// 分享的完整流程：浏览器 A 在编辑页新建组合（打开「固定题目」）→ 保存 → 列表里点分享（替换剪贴板读出链接）→
// 全新的浏览器上下文 B（新用户，设置为固定 C 调、高音区，与 A 不同）打开链接 → 落地页 → 保存 → 开始，
// 前 3 题与 A 练同一组合完全相同（固定题目统一出题设置）；B 返回后在自己的列表里看到这个组合；
// A 练完一组后「再练一次（同一组题）」题目相同；关掉固定题目的组合在另一个上下文里出的题不同。
import { clickText, readStore, run, sleep, textOf } from '../lib/harness.mjs';

const NAME = '全班同一组题';

/** 当前题目（仅测试用，从 React fiber 读）：模块、考点、选项、答案与音高 */
const readQ = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.choices');
    if (!el) return null;
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    for (let f = el[k]; f; f = f.return)
      for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
        const v = h.memoizedState;
        if (v?.q && Array.isArray(v.q.answer) && v.ex?.id)
          return JSON.stringify({
            ex: v.ex.id,
            item: v.q.item,
            choices: v.q.choices.map((c) => [c.id, c.label]),
            answer: v.q.answer,
            prelude: (v.q.prelude ?? []).map((e) => [e.notes, e.time]),
            notes: v.q.events.map((e) => [e.notes, e.time]),
          });
      }
    return null;
  });

/** 依次答对 n 题，返回题目快照（最后一题答完后不翻页） */
async function answerN(page, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    await page.waitForSelector('.choices .choice');
    await sleep(150);
    const q = await readQ(page);
    out.push(q);
    const { choices, answer } = JSON.parse(q);
    for (const a of answer) {
      await (await page.$$('.choices .choice'))[choices.findIndex((c) => c[0] === a)].click();
      await sleep(60);
    }
    await page.waitForSelector('.feedback');
    if (k === n - 1) break;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.feedback'));
  }
  return out;
}

/** 把 navigator.clipboard 换成记录写入内容的假实现 */
const stubClipboard = (page) =>
  page.evaluate(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (s) => void window.__copied.push(s) },
    });
  });

/** 列表里名为 name 的组合的按钮 */
async function itemBtn(page, name, text) {
  for (const it of await page.$$('.set-item')) {
    if ((await it.$eval('h2', (e) => e.textContent)) !== name) continue;
    for (const b of await it.$$('button')) if ((await b.evaluate((e) => e.textContent)).includes(text)) return b;
  }
  throw new Error(`组合「${name}」没有按钮「${text}」`);
}

/** 在列表里点分享，返回复制的链接 */
async function shareLink(page, name) {
  await stubClipboard(page);
  await (await itemBtn(page, name, '分享')).click();
  await page.waitForSelector('.set-share');
  const [url] = await page.evaluate(() => window.__copied);
  return url;
}

/** 新的浏览器上下文：首次加载前写入设置（新用户，未完成新手引导），打开分享链接到落地页 */
async function openShared(t, browser, url, settings, tag) {
  const ctx = await browser.createBrowserContext();
  const page = await t.open({
    target: ctx,
    goto: false,
    tag,
    init: (s) => {
      if (!localStorage.getItem('earforge:v1')) localStorage.setItem('earforge:v1', JSON.stringify({ settings: s }));
    },
    initArgs: [settings],
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.shared');
  return page;
}

await run(async (t) => {
  const browser = await t.launch();

  // ── A：新建固定题目的组合 ──
  const a = await t.open({ target: browser, tag: 'A' });
  await clickText(a, '自定义练习', '.card');
  await a.waitForSelector('.sets');
  await clickText(a, '新建组合');
  await a.waitForSelector('.set-builder');
  await a.type('.set-builder input[type=text]', NAME);
  await clickText(a, '调内音级', '.set-add button');
  await clickText(a, '音程识别', '.set-add button');
  const countInput = await a.$('.set-count-input');
  await countInput.click();
  await a.keyboard.down('Control');
  await a.keyboard.press('a');
  await a.keyboard.up('Control');
  await a.keyboard.press('Backspace');
  await countInput.type('5');
  t.check(!(await a.$('.set-fixed-reseed')), '固定题目默认关闭，没有「换一套题」');
  await a.click('.set-fixed-toggle input');
  await sleep(100);
  t.check(await a.$eval('.set-fixed-toggle input', (e) => e.checked), '打开固定题目');
  t.check(!!(await a.$('.set-fixed-reseed button')), '打开后可「换一套题」');
  await t.shot(a, '1-builder-fixed');
  await clickText(a, '保存', 'button', true);
  await a.waitForSelector('.set-list');
  const saved = (await readStore(a)).sets.find((s) => s.name === NAME);
  t.check(Number.isInteger(saved?.seed), `保存的组合带 seed（${saved?.seed}）`);
  t.check((await textOf(a, '.set-item')).includes('固定题目'), '列表里标出固定题目');

  // 编辑：「换一套题」换 seed；关掉再打开沿用原 seed
  await (await itemBtn(a, NAME, '编辑')).click();
  await a.waitForSelector('.set-builder');
  t.check(await a.$eval('.set-fixed-toggle input', (e) => e.checked), '编辑时保持固定题目');
  await a.click('.set-fixed-toggle input');
  await a.click('.set-fixed-toggle input');
  await sleep(100);
  t.check(!(await a.$('.set-fixed-reseed [role=status]')), '关掉再打开：仍是原来的题（不提示已换题）');
  await clickText(a, '换一套题');
  await sleep(100);
  t.check(!!(await a.$('.set-fixed-reseed [role=status]')), '换一套题后提示');
  await clickText(a, '取消');
  await a.waitForSelector('.set-list');
  t.check((await readStore(a)).sets.find((s) => s.name === NAME).seed === saved.seed, '取消编辑：seed 不变');

  // 分享
  const url = await shareLink(a, NAME);
  t.check(typeof url === 'string' && url.startsWith(`${t.base}#s=`), `分享：复制了链接（${url?.length} 字符）`);
  t.check((await textOf(a, '.set-share')).includes('题目与你完全相同'), '分享提示说明是固定题目');
  await t.shot(a, '2-shared-note');
  await clickText(a, '关闭', '.set-share button');

  // A 练这组：记下前 3 题
  await (await itemBtn(a, NAME, '开始')).click();
  const qa = await answerN(a, 3);
  t.check(qa.length === 3 && qa.every(Boolean), 'A：作答 3 题');
  t.check((await textOf(a, '.practice-title')).includes('固定题目'), '练习页标题旁标出固定题目');
  t.check(!(await a.$('.set-fixed-note')), 'A（随机调）不显示调性说明');

  // ── B：全新上下文、不同的调与音区设置 ──
  const b = await openShared(t, browser, url, { lang: 'zh', keyMode: 'C', voice: 'high', onboarded: false }, 'B');
  t.check(!(await b.$('.onboard')), 'B：新用户先看落地页');
  t.check((await textOf(b, '.shared-name')) === NAME, 'B：落地页显示组合名称');
  const landing = await textOf(b, '.shared');
  t.check(landing.includes('固定题目') && landing.includes('随机调出题'), 'B：落地页说明固定题目与统一随机调');
  t.check(landing.includes('每组 5 题') && landing.includes('调内音级') && landing.includes('音程识别'), 'B：题数与练习');
  await t.shot(b, '3-landing');
  await clickText(b, '保存到我的组合');
  await clickText(b, '开始练习');
  const qb = await answerN(b, 3);
  const same = JSON.stringify(qa) === JSON.stringify(qb);
  t.check(same, 'B（固定 C 调、高音区）与 A 的前 3 题完全相同');
  if (!same) t.log(qa, qb);
  t.check(!!(await b.$('.set-fixed-note')), 'B（固定 C 调）练习页说明固定题目用随机调');
  t.check((await readStore(b)).settings.keyMode === 'C', 'B 自己的调性设置不变');
  await t.shot(b, '4-run-b', { fullPage: false });

  // B 已保存：返回到组合列表，看得到这个组合
  await clickText(b, '返回', '.topbar button');
  await b.waitForSelector('.sets', { timeout: 5000 }).catch(() => {});
  const bNames = await b.$$eval('.set-item h2', (x) => x.map((e) => e.textContent));
  t.check(bNames.includes(NAME), `B：返回后在「我的组合」里看到分享的组合（${bNames.join(' / ')}）`);
  const bSet = (await readStore(b)).sets?.find((s) => s.name === NAME);
  t.check(bSet?.seed === saved.seed, 'B 保存的组合带同一个 seed');
  // 列表返回首页：这时才显示延后的新手引导
  await clickText(b, '返回', '.topbar button');
  await sleep(300);
  t.check(!!(await b.$('.onboard')), 'B：回到首页后显示新手引导');
  await b.keyboard.press('Escape');

  // ── A：练完这一组，「再练一次（同一组题）」题目相同 ──
  for (let g = 0; g < 400 && !(await a.$('.summary')); g++) {
    if (await a.$('.feedback')) {
      await a.keyboard.press('Enter');
      await sleep(80);
      continue;
    }
    const c = await a.$('.choice:not(:disabled):not(.bad)');
    if (c) await c.click();
    await sleep(30);
  }
  t.check(!!(await a.$('.summary')), 'A：练完到小结');
  t.check((await textOf(a, '.summary')).includes('再练一次（同一组题）'), '固定题目的小结：「再练一次（同一组题）」');
  await clickText(a, '再练一次');
  const again = await answerN(a, 1);
  t.check(again[0] === qa[0], '再练一次：第 1 题与上次相同');

  // ── 不固定题目：另一个上下文打开出的题不同 ──
  await clickText(a, '返回', '.topbar button');
  await a.waitForSelector('.set-list');
  await (await itemBtn(a, NAME, '复制')).click();
  await sleep(150);
  const copyName = `${NAME}（副本）`;
  await (await itemBtn(a, copyName, '编辑')).click();
  await a.waitForSelector('.set-builder');
  await a.click('.set-fixed-toggle input');
  await clickText(a, '保存', 'button', true);
  await a.waitForSelector('.set-list');
  t.check((await readStore(a)).sets.find((s) => s.name === copyName)?.seed === undefined, '关掉固定题目后保存：没有 seed');
  const url2 = await shareLink(a, copyName);
  t.check(!(await textOf(a, '.set-share')).includes('题目与你完全相同'), '随机组合的分享提示不说固定题目');
  await (await itemBtn(a, copyName, '开始')).click();
  const ra = await answerN(a, 3);
  const c = await openShared(t, browser, url2, { lang: 'zh', onboarded: true }, 'C');
  t.check((await textOf(c, '.shared')).includes('每次随机出题') && !(await c.$('.set-fixed-note')), '随机组合的落地页');
  await clickText(c, '开始练习');
  const rc = await answerN(c, 3);
  t.check(JSON.stringify(ra) !== JSON.stringify(rc), '不固定题目：两人的前 3 题不同');
  // 未保存就开始的：返回首页
  await clickText(c, '返回', '.topbar button');
  await sleep(300);
  t.check(!!(await c.$('.today')), '未保存的分享组合：返回首页');
});
