// 低音线听写：预置到最高级 → 选项是低音唱名（含 fi）、第一个低音是 do → 第 2 步先答错再答完整题 → 「第 2 步」对比试听、
// 解析（低音 + 和弦）、大谱表 → 答完后切换步骤试听 → 再答一题全对 → 简谱唱名体系 + 小调，选项切到 6 个和弦 + 均衡音量 →
// 英文界面（桌面 + 375 宽手机）再答一题，检查无中文、无溢出
import { CJK, answerQuestion, clickText, overflowPx, readQuestion, run, sleep, textOf } from '../lib/harness.mjs';

/** 预置低音线听写的进度（级别 / 选项）与设置后重新加载 */
async function preset(page, level, options, settings = {}) {
  await page.evaluate(
    (level, options, settings) => {
      const s = JSON.parse(localStorage.getItem('earforge:v1'));
      s.exercises.bassLine = { level, custom: null, items: {}, options };
      Object.assign(s.settings, settings);
      localStorage.setItem('earforge:v1', JSON.stringify(s));
    },
    level,
    options,
    settings,
  );
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(200);
}

const choiceLabels = (page) => page.$$eval('.choice .choice-label', (els) => els.map((e) => e.textContent));

/** 第 2 步先点一个错误选项，其余按正确答案作答 */
async function answerWrongAtStep2(page) {
  const q = await readQuestion(page);
  const click = async (id) => {
    await (await page.$$('.choices .choice'))[q.choices.indexOf(id)].click();
    await sleep(60);
  };
  await click(q.answer[0]);
  await click(q.choices.find((id) => id !== q.answer[1]));
  for (const a of q.answer.slice(1)) await click(a);
  await page.waitForSelector('.feedback', { timeout: 5000 });
  return q;
}

await run(async (t) => {
  const check = (c, m) => t.check(c, m);

  // ── 1. 中文：大调最高级、四个和弦、首调唱名 ──
  const browser = await t.launch();
  const page = await t.open({ target: await browser.createBrowserContext(), tag: 'zh' });
  await preset(page, 5, { mode: 'major', len: '4', bass: 'boost' }, { keyMode: 'C' });
  await clickText(page, '低音线听写', '.card');
  await sleep(200);
  await clickText(page, '开始练习');
  await page.waitForSelector('.choice');
  await sleep(300);
  let q = await readQuestion(page);
  check(q?.ex === 'bassLine', `读到低音线听写的题目（${q?.ex}）`);
  check(q.answer.length === 4 && q.answer[0] === 'd0', `四个低音、第一个是 do（${q.answer.join(' ')}）`);
  const labels = await choiceLabels(page);
  check(labels.join(' ') === 'do re mi fa fi sol la ti', `最高级的选项是低音唱名，含 fi（${labels.join(' ')}）`);
  check((await page.$$('.slots .slot')).length === 4, '上方有 4 个步骤格子');
  const prompt = await textOf(page, '.prompt');
  check(prompt.includes('4 个和弦的低音') && prompt.includes('do'), `题干说明逐个写低音（${prompt}）`);
  await t.shot(page, 'b1-question', { fullPage: false });

  q = await answerWrongAtStep2(page);
  check(await page.$eval('.feedback', (e) => e.classList.contains('bad')), '第 2 步答错：整题记为答错');
  const fb = await textOf(page, '.feedback');
  check(fb.includes('低音 do –') && fb.includes('→'), `解析显示低音线与和弦（${fb.slice(0, 80)}）`);
  const cmp = await textOf(page, '.compare-row');
  check(cmp.includes('第 2 步') && cmp.includes('你的答案') && cmp.includes('正确答案'), `答错的步骤有对比试听（${cmp}）`);
  check(!!(await page.$('.feedback-staff svg')), '答完后显示五线谱');
  const vb = await page.$eval('.feedback-staff svg', (e) => e.getAttribute('viewBox'));
  check(Number(vb.split(' ')[3]) > 120, `五线谱是大谱表（viewBox ${vb}）`);
  await (await page.$('.feedback-staff')).screenshot({ path: `${t.out}/b2b-staff.png` });
  // 对比试听按钮可以点，不跳题
  for (const b of await page.$$('.compare-row button')) await b.click();
  await sleep(100);
  check(!!(await page.$('.feedback')), '对比试听不会跳题');
  // 答完后切到第 3 步，选项变成试听这一步的低音
  await (await page.$$('.slots .slot'))[2].click();
  await sleep(100);
  check(await page.$eval('.slots .slot:nth-child(3)', (e) => e.classList.contains('sel')), '点格子切换到第 3 步');
  check((await page.$$('.choice-listen')).length === labels.length, '答完后每个选项都能试听');
  await (await page.$$('.choice'))[1].click();
  await sleep(100);
  check(!!(await page.$('.feedback')), '试听不会跳题');
  await t.shot(page, 'b2-answered');

  // 再答一题（全对）
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.feedback'));
  await sleep(200);
  check(await answerQuestion(page, true), '按正确答案逐步作答，反馈为答对');
  await clickText(page, '返回');
  await sleep(200);

  // ── 2. 简谱唱名、小调、均衡音量、6 个和弦 ──
  await preset(page, 2, { mode: 'minor', len: '4', bass: 'boost' }, { naming: 'jianpu' });
  await clickText(page, '低音线听写', '.card');
  await sleep(200);
  await clickText(page, '选项');
  await sleep(100);
  await clickText(page, '6 个');
  await clickText(page, '均衡（考试）');
  await clickText(page, '选项');
  await clickText(page, '开始练习');
  await page.waitForSelector('.choice');
  await sleep(300);
  q = await readQuestion(page);
  check(q.answer.length === 6 && q.answer[0] === 'minor:d0', `小调 6 个低音，第一个是 do（${q.answer.join(' ')}）`);
  const jl = await choiceLabels(page);
  check(jl.includes('♭3') && jl.includes('♭6') && jl.includes('7'), `简谱选项含 ♭3 ♭6 7（${jl.join(' ')}）`);
  check((await textOf(page, '.prompt')).includes('小调'), '题干是小调');
  check(await answerQuestion(page, true), '小调题答对');
  await t.shot(page, 'b3-minor-jianpu');
  await clickText(page, '返回');

  // ── 3. 英文界面（桌面 + 手机） ──
  for (const width of [1024, 375]) {
    const en = await t.open({ target: await browser.createBrowserContext(), lang: 'en-US', width, height: width < 500 ? 812 : 800, tag: `en-${width}` });
    await preset(en, 5, { mode: 'major', len: '4', bass: 'boost' });
    await clickText(en, 'Bass-Line Dictation', '.card');
    await sleep(200);
    await clickText(en, 'Start');
    await en.waitForSelector('.choice');
    await sleep(300);
    const p = await textOf(en, '.prompt');
    check(p.includes('Write the bass of each of the 4 chords'), `英文题干（${p}）`);
    await answerWrongAtStep2(en);
    const body = await en.evaluate(() => document.querySelector('main')?.innerText ?? '');
    check(!CJK.test(body), `${width}: 英文练习页没有中文`);
    check((await textOf(en, '.compare-row')).includes('Step 2'), `${width}: 英文对比试听`);
    check((await textOf(en, '.feedback')).includes('Bass do'), `${width}: 英文解析`);
    check((await overflowPx(en)) <= 0, `${width}: 没有横向溢出`);
    check(!!(await en.$('.feedback-staff svg')), `${width}: 英文界面也显示五线谱`);
    await t.shot(en, `b4-en-${width}`);
    // 选项面板（含「Bass」选项）不溢出
    await clickText(en, 'Back');
    await sleep(200);
    await clickText(en, 'Bass-Line Dictation', '.card');
    await sleep(200);
    await clickText(en, 'Options');
    await sleep(100);
    const opts = await en.evaluate(() => document.querySelector('main')?.innerText ?? '');
    check(opts.includes('Bring out the bass') && !CJK.test(opts), `${width}: 英文选项（低音）`);
    check((await overflowPx(en)) <= 0, `${width}: 选项面板没有横向溢出`);
    await t.shot(en, `b5-en-options-${width}`);
  }
});
