// 分享链接：带 #s= 的网址打开落地页（新用户的新手引导延后）→ 保存 → 开始练习 → 返回组合列表 → 换一个全新的浏览器上下文打开同一链接，
// 固定题目的前 3 题完全相同；无效链接显示错误；应用打开期间粘贴链接（hashchange）也能进入；落地页无障碍审计。
// 支持子路径部署（--base /earforge/）。
import { createRequire } from 'node:module';
import { clickText, run, sleep, textOf } from '../lib/harness.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

// 与 src/engine/shareLink.ts 相同的编码（独立实现，顺带校验格式）：1|<FNV-1a 校验>|<正文>，UTF-8 → base64url
function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return (h % 36 ** 4).toString(36).padStart(4, '0');
}
const seal = (body) => Buffer.from(`1|${checksum(body)}|${body}`, 'utf8').toString('base64url');

const NAME = '期中复习 <b>不是粗体</b>';
// 20 题、seed 固定；音程（和声）、和弦、小调调内音级
const CODE = seal(`20|${(3141592653).toString(36)}|iv~m3,M3,P4,P5,m6,M6~dir=harm;ch~maj,min,dim,aug;dg~d0,d2,d3,d5,d7~mode=minor|${NAME}`);

/** 当前题目（仅测试用）：模块、考点、题干、选项、答案与音高 */
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
            prompt: v.q.prompt,
            choices: v.q.choices.map((c) => [c.id, c.label]),
            answer: v.q.answer,
            notes: v.q.events.map((e) => [e.notes, e.time]),
          });
      }
    return null;
  });

/** 依次答对 n 题，返回题目快照 */
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
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.feedback'));
  }
  return out;
}

async function axe(t, page, name) {
  await sleep(300);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}(${x.nodes.length})`));
  t.check(v.length === 0, `${name}：无障碍无违规 ${v.join(', ')}`);
}

await run(async (t) => {
  const browser = await t.launch();
  const url = `${t.base}#s=${CODE}`;
  t.log(`  分享网址 ${url.length} 字符`);

  // ── 全新用户打开分享链接 ──
  const ctxA = await browser.createBrowserContext();
  const a = await t.open({ target: ctxA, goto: false, tag: 'A' });
  await a.goto(url, { waitUntil: 'networkidle0' });
  await a.waitForSelector('.shared');
  t.check(!(await a.$('.onboard')), '新用户：先显示分享落地页，新手引导延后');
  t.check((await textOf(a, '.shared-name')) === NAME, '组合名称按原文显示（不解析 HTML）');
  t.check(!(await a.$('.shared-name b')), '名称里的标签不被渲染');
  const body = await textOf(a, '.shared');
  t.check(body.includes('每组 20 题') && body.includes('固定题目'), '显示题数与固定题目');
  t.check(body.includes('音程识别') && body.includes('和弦') && body.includes('调内音级'), '列出三个练习');
  t.check(body.includes('小三度'), '列出考点名称');
  t.check((await a.evaluate(() => location.hash)) === '', '处理后清掉 hash');
  t.check((await a.evaluate(() => location.pathname)) === new URL(t.base).pathname, '路径保持在部署子路径');
  await t.shot(a, '1-landing');
  await axe(t, a, '落地页');

  await clickText(a, '保存到我的组合');
  t.check((await textOf(a, '.shared')).includes('已保存'), '保存后按钮显示已保存');

  await clickText(a, '开始练习');
  const qa = await answerN(a, 3);
  t.check(qa.every(Boolean), '开始练习：作答 3 题');
  await t.shot(a, '2-run', { fullPage: false });

  // 已保存：返回到组合列表；再回到首页，这时才显示新手引导
  await clickText(a, '返回');
  await sleep(300);
  t.check(!!(await a.$('.sets')) && (await textOf(a, '.set-list')).includes(NAME), '已保存的分享组合：返回到组合列表');
  t.check(!(await a.$('.onboard')), '组合列表：新手引导仍延后');
  await clickText(a, '返回');
  await sleep(300);
  t.check(!!(await a.$('.onboard')), '回到首页后显示延后的新手引导');
  await a.keyboard.press('Escape');
  await sleep(300);
  await a.reload({ waitUntil: 'networkidle0' });
  t.check(!(await a.$('.shared')), '刷新不会再次打开分享页');

  // ── 全新的上下文打开同一链接：题目相同 ──
  const ctxB = await browser.createBrowserContext();
  const b = await t.open({ target: ctxB, goto: false, tag: 'B' });
  await b.goto(url, { waitUntil: 'networkidle0' });
  await b.waitForSelector('.shared');
  await clickText(b, '开始练习');
  const qb = await answerN(b, 3);
  t.check(JSON.stringify(qa) === JSON.stringify(qb), '固定题目：另一个浏览器打开同一链接，前 3 题完全相同');
  if (JSON.stringify(qa) !== JSON.stringify(qb)) t.log(qa, qb);

  // ── 打开期间粘贴链接（hashchange） ──
  await clickText(b, '返回');
  await sleep(200);
  if (await b.$('.onboard')) await b.keyboard.press('Escape');
  await sleep(200);
  t.check(!!(await b.$('.today')), '回到首页');
  await b.evaluate((c) => (location.hash = `s=${c}`), CODE);
  await b.waitForSelector('.shared', { timeout: 5000 }).catch(() => {});
  t.check(!!(await b.$('.shared-name')), '应用打开期间粘贴分享链接：进入落地页');
  t.check((await b.evaluate(() => location.hash)) === '', 'hashchange 处理后清掉 hash');
  await clickText(b, '返回首页');
  t.check(!!(await b.$('.today')), '落地页「返回首页」');

  // ── 无效链接 ──
  const c = await t.open({ target: ctxB, goto: false, tag: 'C' });
  for (const bad of ['garbage', CODE.slice(0, -6), `${CODE.slice(0, 20)}A${CODE.slice(21)}`]) {
    await c.goto(`${t.base}#s=${bad}`, { waitUntil: 'networkidle0' });
    await c.waitForSelector('.shared');
    t.check((await textOf(c, '.shared')).includes('链接无法打开'), `无效链接显示错误（${bad.slice(0, 12)}…）`);
  }
  await t.shot(c, '3-invalid');
  await axe(t, c, '无效链接页');
  await clickText(c, '返回首页');
  t.check(!!(await c.$('.today')), '无效链接：返回首页');
});
