// 成绩链接：学生 A 练完 5 题的固定题目组合（第 2、4 题故意答错）→ 填名字 → 分享成绩（替换剪贴板读出链接）→
// 全新的老师上下文打开链接：成绩页的名字、得分、每题对错与考点（与 A 实际做的题一致）、各练习表现；
// 不计入老师自己的练习记录，不自动保存；被改动的链接提示无法打开。
// 成绩单：添加 A 的成绩 → 打开期间粘贴学生 B 的链接（hashchange）→ 添加 → 成绩单表格两行、按得分 / 姓名排序、导出 CSV。
// 英文界面扫描未翻译的中文；成绩页、分享面板与成绩单做 axe 无障碍审计（中文明 / 暗、英文）。
import { createRequire } from 'node:module';
import { CJK, answerQuestion, clickText, readQuestion, readStore, run, sleep, textOf } from '../lib/harness.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** 学生本地保存的固定题目组合（5 题：音程 + 和弦性质） */
const SET = {
  id: 'sResultE2E',
  name: '第三周听力作业',
  parts: [
    { ex: 'intervals', items: ['P5', 'P8', 'M3', 'P4', 'm3', 'M6'], options: { dir: 'mix' } },
    { ex: 'chords', items: ['maj', 'min', 'dim', 'aug'], options: { voicing: 'both', inv: 'root' } },
  ],
  count: 5,
  seed: 20261016,
  created: 1760000000000,
};

/** 把 navigator.clipboard 换成记录写入内容的假实现 */
const stubClipboard = (page) =>
  page.evaluate(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (s) => void window.__copied.push(s) },
    });
  });

await run(async (t) => {
  const browser = await t.launch();

  const audit = async (page, name) => {
    await sleep(300);
    await page.addScriptTag({ path: AXE });
    const r = await page.evaluate(async () => {
      const res = await window.axe.run(document, { resultTypes: ['violations'] });
      return res.violations.map((v) => `${v.impact} ${v.id} ×${v.nodes.length} ${v.nodes[0]?.target.join(' ')}`);
    });
    t.check(!r.length, `${name}: 无 axe 违规${r.length ? `（${r.join('；')}）` : ''}`);
    await t.shot(page, `axe-${name}`);
  };

  /** 学生：新上下文里练完这组（wrong 为答错的题号，从 0 起），分享成绩，返回链接与每题的练习与考点 */
  async function student(tag, name, wrong, { lang = 'zh', check = false } = {}) {
    const ctx = await browser.createBrowserContext();
    const page = await t.open({
      target: ctx,
      tag,
      lang: lang === 'zh' ? 'zh-CN' : 'en-US',
      init: (set, l) => {
        if (!localStorage.getItem('earforge:v1'))
          localStorage.setItem(
            'earforge:v1',
            JSON.stringify({ version: 1, settings: { lang: l, onboarded: true }, exercises: {}, daily: {}, sets: [set] }),
          );
      },
      initArgs: [SET, lang],
    });
    await clickText(page, lang === 'zh' ? '自定义练习' : 'Custom practice', '.card');
    await page.waitForSelector('.set-item');
    await (await page.$('.set-actions button.primary')).click();
    const seen = [];
    for (let k = 0; k < 5; k++) {
      await page.waitForSelector('.choices .choice');
      await sleep(150);
      const q = await readQuestion(page);
      seen.push(`${q.ex}:${q.item}`);
      await answerQuestion(page, !wrong.includes(k));
      await page.keyboard.press('Enter');
      if (k < 4) await page.waitForFunction(() => !document.querySelector('.feedback'));
    }
    await page.waitForSelector('.summary .result-share');
    if (check) {
      t.check((await textOf(page, '.summary-hero')).includes(`${5 - wrong.length}/5`), `${tag}：小结 ${5 - wrong.length}/5`);
      await audit(page, 'share-panel-zh');
    }
    await stubClipboard(page);
    await page.type('.result-share input', name);
    await clickText(page, lang === 'zh' ? '生成并复制成绩链接' : 'Create & copy result link');
    await page.waitForSelector('.result-share-done');
    const [url] = await page.evaluate(() => window.__copied);
    const shown = await page.$eval('.result-share-done input', (e) => e.value);
    t.check(url === shown, `${tag}：复制的链接与显示的相同`);
    t.check(typeof url === 'string' && url.startsWith(`${t.base}#r=`), `${tag}：成绩链接（${url?.length} 字符）`);
    // 名字记在本机，下次自动填上
    t.check((await page.evaluate(() => localStorage.getItem('earforge:resultName'))) === name, `${tag}：记住名字`);
    if (check) await t.shot(page, `1-student-${tag}`);
    await ctx.close();
    return { url, seen };
  }

  const a = await student('A', '张三', [1, 3], { check: true });
  const b = await student('B', 'Li Si', [0]);

  // ── 老师：全新上下文（新用户，未完成新手引导）打开 A 的链接 ──
  const ctx = await browser.createBrowserContext();
  const teacher = await t.open({ target: ctx, tag: 'teacher', goto: false });
  await teacher.goto(a.url, { waitUntil: 'networkidle0' });
  await teacher.waitForSelector('.result-view');
  t.check(!(await teacher.$('.onboard')), '老师：新用户先看成绩页（新手引导延后）');
  t.check(!(await teacher.evaluate(() => location.hash)), '打开后清掉 hash');
  t.check((await textOf(teacher, '.shared-name')) === '张三', '成绩页：学生名字');
  t.check((await textOf(teacher, '.result-set')).includes(SET.name), '成绩页：组合名称');
  t.check(
    (await textOf(teacher, '.summary-big')) === '60%' && (await textOf(teacher, '.result-score')).includes('3/5'),
    '成绩页：得分 3/5（60%）',
  );
  const grid = await teacher.$$eval('.result-q', (x) =>
    x.map((e) => ({ ok: e.classList.contains('ok'), key: `${e.dataset.ex}:${e.dataset.item}`, text: e.textContent })),
  );
  t.check(grid.length === 5, '每题对错：5 格');
  t.check(JSON.stringify(grid.map((g) => g.ok)) === JSON.stringify([true, false, true, false, true]), '每题对错：第 2、4 题答错');
  t.check(JSON.stringify(grid.map((g) => g.key)) === JSON.stringify(a.seen), `每题的练习与考点与学生做的一致（${a.seen.join(' ')}）`);
  t.check(grid[1].text.includes('第 2 题') && grid[1].text.includes('答错'), '格子带题号与对错文字');
  t.check((await teacher.$$('.result-view .mastery li')).length >= 1, '各练习表现');
  t.check((await textOf(teacher, '.result-view')).includes('不计入你的练习记录'), '说明不计入自己的记录');
  await t.shot(teacher, '2-teacher-result');
  await audit(teacher, 'result-zh');
  let st = await readStore(teacher);
  t.check(!st || (!Object.keys(st.daily ?? {}).length && !(st.gradebook ?? []).length), '查看成绩不写入练习记录、不自动保存');

  // 添加到成绩单
  await clickText(teacher, '添加到成绩单');
  await sleep(150);
  st = await readStore(teacher);
  t.check(st.gradebook?.length === 1, '添加到成绩单：保存一条');
  t.check((await textOf(teacher, '.result-actions')).includes('已在成绩单中'), '按钮变为「已在成绩单中」');

  // 打开期间粘贴 B 的链接（hashchange）
  await teacher.evaluate((u) => (location.hash = u.slice(u.indexOf('#'))), b.url);
  await teacher.waitForFunction(() => document.querySelector('.shared-name')?.textContent === 'Li Si');
  t.check((await textOf(teacher, '.result-score')).includes('4/5'), '粘贴 B 的链接：4/5');
  t.check(
    JSON.stringify(await teacher.$$eval('.result-q', (x) => x.map((e) => `${e.dataset.ex}:${e.dataset.item}`))) === JSON.stringify(b.seen),
    'B 的题与 A 相同（固定题目）',
  );
  await clickText(teacher, '添加到成绩单');
  await sleep(150);
  await clickText(teacher, '查看成绩单');
  await teacher.waitForSelector('.grade-table');
  const rows = () => teacher.$$eval('.grade-table tbody th', (x) => x.map((e) => e.textContent));
  t.check(JSON.stringify(await rows()) === JSON.stringify(['Li Si', '张三']), `成绩单：两行，按得分从高到低（${await rows()}）`);
  t.check(
    (await textOf(teacher, '.practice-title')).includes(SET.name) && (await textOf(teacher, '.practice-title')).includes('平均 70%'),
    '作业名称与平均分',
  );
  await clickText(teacher, '得分', '.grade-sort');
  await sleep(100);
  t.check(JSON.stringify(await rows()) === JSON.stringify(['张三', 'Li Si']), '再点「得分」：从低到高');
  await audit(teacher, 'gradebook-zh');

  // 导出 CSV：截获下载的 Blob
  await teacher.evaluate(() => {
    URL.createObjectURL = (blob) => {
      window.__blob = blob;
      return 'blob:stub';
    };
    HTMLAnchorElement.prototype.click = function () {
      window.__dl = this.download;
    };
  });
  await clickText(teacher, '导出 CSV');
  const csv = await teacher.evaluate(async () => ({ name: window.__dl, text: await window.__blob.text() }));
  const lines = csv.text.replace(/^\ufeff/, '').trim().split('\r\n');
  t.check(csv.name === `${SET.name}.csv`, `CSV 文件名（${csv.name}）`);
  t.check(lines.length === 3 && lines[0].startsWith('姓名,得分,正确率') && lines[0].endsWith('第5题'), 'CSV 表头');
  t.check(
    lines.some((l) => l.startsWith('张三,3,60,') && l.endsWith(',1,0,1,0,1')),
    'CSV：张三的每题对错',
  );
  t.check(
    lines.some((l) => l.startsWith('Li Si,4,80,') && l.endsWith(',0,1,1,1,1')),
    'CSV：Li Si 的每题对错',
  );

  // 从成绩单查看 → 返回成绩单 → 作业列表 → 首页出现成绩单入口
  await clickText(teacher, '查看', '.grade-actions button');
  await teacher.waitForSelector('.result-view');
  await clickText(teacher, '返回成绩单', '.result-actions button');
  await teacher.waitForSelector('.grade-table');
  await clickText(teacher, '返回成绩单', '.shared-actions button');
  await teacher.waitForSelector('.gradebook .set-item');
  t.check((await textOf(teacher, '.gradebook .set-item')).includes('2 人'), '作业列表：2 人');
  await audit(teacher, 'gradebook-list-zh');
  await clickText(teacher, '返回', '.topbar button');
  await sleep(300);
  await teacher.keyboard.press('Escape'); // 延后的新手引导
  await sleep(300);
  const cards = await teacher.$$eval('.card .card-title', (x) => x.map((e) => e.textContent));
  t.check(cards.includes('成绩单'), '首页：成绩单入口');

  // 练这一组：从成绩页开始同一组题，第 1 题与学生相同
  await teacher.evaluate((u) => (location.hash = u.slice(u.indexOf('#'))), a.url);
  await teacher.waitForSelector('.result-view');
  await clickText(teacher, '练这一组');
  await teacher.waitForSelector('.choices .choice');
  await sleep(150);
  const q0 = await readQuestion(teacher);
  t.check(`${q0.ex}:${q0.item}` === a.seen[0], '练这一组：第 1 题与学生相同');

  // 被改动的链接
  const i = a.url.indexOf('#r=') + 6;
  const bad = a.url.slice(0, i) + (a.url[i] === 'A' ? 'B' : 'A') + a.url.slice(i + 1);
  const ctx2 = await browser.createBrowserContext();
  const p2 = await t.open({ target: ctx2, tag: 'tampered', goto: false });
  await p2.goto(bad, { waitUntil: 'networkidle0' });
  await p2.waitForSelector('.result-view');
  t.check((await textOf(p2, '.result-view')).includes('成绩链接无法打开'), '被改动的链接：提示无法打开');
  await audit(p2, 'result-invalid-zh');
  await p2.goto(a.url.slice(0, a.url.length - 20), { waitUntil: 'networkidle0' });
  await p2.waitForSelector('.result-view');
  t.check((await textOf(p2, '.result-view')).includes('成绩链接无法打开'), '被截断的链接：提示无法打开');

  // 暗色
  const ctx3 = await browser.createBrowserContext();
  const p3 = await t.open({ target: ctx3, tag: 'dark', goto: false, dark: true });
  await p3.goto(a.url, { waitUntil: 'networkidle0' });
  await p3.waitForSelector('.result-view .result-q');
  await audit(p3, 'result-zh-dark');

  // ── 英文界面 ──
  const ctx4 = await browser.createBrowserContext();
  const en = await t.open({ target: ctx4, tag: 'en', lang: 'en-US', goto: false, width: 390, height: 844 });
  await en.goto(b.url, { waitUntil: 'networkidle0' });
  await en.waitForSelector('.result-view .result-q');
  const enText = await en.$eval('.result-view', (e) => {
    const c = e.cloneNode(true);
    c.querySelector('.result-set')?.remove(); // 组合名称是学生的（中文）
    return c.textContent;
  });
  t.check(!CJK.test(enText), `英文成绩页没有中文${CJK.test(enText) ? `（${enText.match(/.{0,10}[一-鿿].{0,10}/)?.[0]}）` : ''}`);
  t.check(enText.includes('4/5 correct') && enText.includes('Question 1'), '英文：得分与题号');
  t.check((await en.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, '英文窄屏：无横向溢出');
  await audit(en, 'result-en');
  await clickText(en, 'Add to gradebook');
  await clickText(en, 'Open gradebook');
  await en.waitForSelector('.grade-table');
  const enBook = await en.$eval('.gradebook', (e) => {
    const c = e.cloneNode(true);
    c.querySelector('.practice-title h1')?.remove();
    return c.textContent;
  });
  t.check(!CJK.test(enBook), '英文成绩单没有中文');
  await audit(en, 'gradebook-en');
  await t.shot(en, '3-en-gradebook');

  // 英文学生端分享面板
  const ctx5 = await browser.createBrowserContext();
  const s5 = await t.open({
    target: ctx5,
    tag: 'en-student',
    lang: 'en-US',
    init: (set) => {
      if (!localStorage.getItem('earforge:v1'))
        localStorage.setItem(
          'earforge:v1',
          JSON.stringify({ version: 1, settings: { lang: 'en', onboarded: true }, exercises: {}, daily: {}, sets: [set] }),
        );
    },
    initArgs: [SET],
  });
  await clickText(s5, 'Custom practice', '.card');
  await (await s5.waitForSelector('.set-actions button.primary')).click();
  for (let k = 0; k < 5; k++) {
    await s5.waitForSelector('.choices .choice');
    await sleep(120);
    await answerQuestion(s5, true);
    await s5.keyboard.press('Enter');
    if (k < 4) await s5.waitForFunction(() => !document.querySelector('.feedback'));
  }
  await s5.waitForSelector('.result-share');
  t.check(!CJK.test(await textOf(s5, '.result-share')), '英文分享面板没有中文');
  await audit(s5, 'share-panel-en');
});
