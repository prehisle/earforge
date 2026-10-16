// 和声听写：预置到最高级 → 逐步作答四和弦进行（第一步先答错）→ 步骤格子、解析与五线谱 → 答完后切换步骤试听 →
// 选项切到小调 + 6 个和弦再答一题 → 英文界面（含 375 宽手机）再答一题，检查无中文、无溢出
import { CJK, answerQuestion, clickText, overflowPx, readQuestion, run, sleep, textOf } from '../lib/harness.mjs';

/** 预置和声听写的进度（级别 / 选项）后重新加载 */
async function preset(page, level, options) {
  await page.evaluate(
    (level, options) => {
      const s = JSON.parse(localStorage.getItem('earforge:v1'));
      s.exercises.harmony = { level, custom: null, items: {}, options };
      localStorage.setItem('earforge:v1', JSON.stringify(s));
    },
    level,
    options,
  );
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(200);
}

await run(async (t) => {
  const check = (c, m) => t.check(c, m);

  // ── 1. 中文：大调最高级、四个和弦 ──
  const browser = await t.launch();
  const page = await t.open({ target: await browser.createBrowserContext(), tag: 'zh' });
  await preset(page, 5, { mode: 'major', len: '4' });
  await clickText(page, '和声听写', '.card');
  await sleep(200);
  await clickText(page, '开始练习');
  await page.waitForSelector('.choice');
  await sleep(300);
  let q = await readQuestion(page);
  check(q?.ex === 'harmony', `读到和声听写的题目（${q?.ex}）`);
  check(q.answer.length === 4 && q.answer[0] === 'I', `四个和弦、第一个是 Ⅰ（${q.answer.join(' ')}）`);
  check(q.choices.length === 19, `最高级有 19 个选项（${q.choices.length}）`);
  check(q.answer.indexOf(q.item, 1) >= 1, `考点 ${q.item} 在第 2 个及之后`);
  check((await page.$$('.slots .slot')).length === 4, '上方有 4 个步骤格子');
  check((await textOf(page, '.prompt')).includes('依次写出 4 个和弦'), '题干说明逐个作答');
  const labels = await page.$$eval('.choice .choice-label', (els) => els.map((e) => e.textContent));
  check(labels.includes('Ⅴ⁶₅') && labels.includes('Ⅰ⁶₄') && labels.includes('Ⅴ/Ⅴ'), `选项是带数字低音的罗马数字（${labels.slice(0, 6).join(' ')}…）`);
  const subs = await page.$$eval('.choice .choice-sub', (els) => els.map((e) => e.textContent));
  check(subs.length === 19 && subs.some((s) => s.includes('/')), `副标题是调内和弦名（${subs.slice(0, 4).join(' ')}…）`);
  await t.shot(page, 'h1-question', { fullPage: false });

  const good = await answerQuestion(page, false);
  check(!good, '第一步先答错：整题记为答错');
  const fb = await textOf(page, '.feedback');
  check(fb.includes('→') && fb.includes('Ⅰ'), `解析显示进行（${fb.slice(0, 60)}）`);
  check(!!(await page.$('.feedback-staff svg')), '答完后显示五线谱');
  // 低音在低音谱表、上方声部在高音谱表：大谱表有两组五线（加线另计）
  const vb = await page.$eval('.feedback-staff svg', (e) => e.getAttribute('viewBox'));
  check(Number(vb.split(' ')[3]) > 120, `五线谱是大谱表（viewBox ${vb}）`);
  await (await page.$('.feedback-staff')).screenshot({ path: `${t.out}/h2b-staff.png` });
  const slotText = await page.$$eval('.slots .slot', (els) => els.map((e) => e.textContent));
  check(slotText.every((s) => s !== '?'), `答完后格子显示答案（${slotText.join(' ')}）`);
  check(!!(await page.$('.compare-row')), '答错后有「你的答案 / 正确答案」对比');
  // 答完后切到第 3 步，选项变成试听这一步
  await (await page.$$('.slots .slot'))[2].click();
  await sleep(100);
  check(await page.$eval('.slots .slot:nth-child(3)', (e) => e.classList.contains('sel')), '点格子切换到第 3 步');
  check((await page.$$('.choice-listen')).length === 19, '答完后每个选项都能试听');
  await (await page.$$('.choice'))[1].click();
  await sleep(100);
  check(!!(await page.$('.feedback')), '试听不会跳题');
  await t.shot(page, 'h2-answered');

  // 再答一题（全对）
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.feedback'));
  await sleep(200);
  check(await answerQuestion(page, true), '按正确答案逐步作答，反馈为答对');
  await clickText(page, '返回');
  await sleep(200);

  // ── 2. 选项：小调、6 个和弦 ──
  await clickText(page, '和声听写', '.card');
  await sleep(200);
  await clickText(page, '选项');
  await sleep(100);
  await clickText(page, '小调');
  await clickText(page, '6 个');
  await clickText(page, '选项');
  await clickText(page, '开始练习');
  await page.waitForSelector('.choice');
  await sleep(300);
  q = await readQuestion(page);
  check(q.answer.length === 6 && q.answer[0] === 'minor:i', `小调 6 个和弦，第一个是 ⅰ（${q.answer.join(' ')}）`);
  check((await page.$$('.slots .slot')).length === 6, '上方有 6 个步骤格子');
  check((await textOf(page, '.prompt')).includes('小调'), '题干是小调');
  check(await answerQuestion(page, true), '小调题答对');
  const fb6 = await textOf(page, '.feedback');
  check(fb6.split('→').length === 6, `解析有 6 个和弦（${fb6.slice(0, 80)}）`);
  await t.shot(page, 'h3-minor-six');
  await clickText(page, '返回');

  // ── 3. 英文界面（桌面 + 手机） ──
  for (const width of [1024, 375]) {
    // 新的浏览器上下文：全新存储，按浏览器语言显示英文
    const en = await t.open({ target: await browser.createBrowserContext(), lang: 'en-US', width, height: width < 500 ? 812 : 800, tag: `en-${width}` });
    await preset(en, 3, { mode: 'major', len: '4' });
    await clickText(en, 'Harmonic Dictation', '.card');
    await sleep(200);
    await clickText(en, 'Start');
    await en.waitForSelector('.choice');
    await sleep(300);
    const p = await textOf(en, '.prompt');
    check(p.includes('Name the 4 chords'), `英文题干（${p}）`);
    await answerQuestion(en, false);
    const body = await en.evaluate(() => document.querySelector('main')?.innerText ?? '');
    check(!CJK.test(body), `${width}: 英文练习页没有中文`);
    check((await overflowPx(en)) <= 0, `${width}: 没有横向溢出`);
    check(!!(await en.$('.feedback-staff svg')), `${width}: 英文界面也显示五线谱`);
    await t.shot(en, `h4-en-${width}`);
  }
});
