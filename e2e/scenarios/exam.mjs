// 模拟考试：首页入口 → 三套试卷（对错各半）→ 成绩页 / 回顾 / 历史 → 重听限制 → 限时到点 → 专练薄弱点
// 中英 × 375/1024 × 明暗，另有两个限时用例。原 exam.mjs
// 通过测试钩子读答案：__EARFORGE_TEST__ = true 时 Exam 页把本卷公开在 globalThis.__earforgeExam；
// __EARFORGE_EXAM_SECONDS__ 缩短时限。
// 可选：E2E_FILTER=zh-375 只跑匹配的组合，E2E_FILTER=timer 只跑限时用例，E2E_FILTER=random 只跑随机音色回顾。
import { CJK, overflowPx, run, sleep } from '../lib/harness.mjs';

const only = process.env.E2E_FILTER;

function examHooks(secs) {
  globalThis.__EARFORGE_TEST__ = true;
  if (secs) globalThis.__EARFORGE_EXAM_SECONDS__ = secs;
}

await run(async (t) => {
  const browser = await t.launch();

  async function newPage({ lang, width, dark, secs, tag }) {
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, lang: lang === 'zh' ? 'zh-CN' : 'en-US', width, dark, init: examHooks, initArgs: [secs ?? 0], tag });
    return { ctx, page };
  }

  async function openExams(page, lang) {
    const T = lang === 'zh' ? '模拟考试' : 'mock exams';
    for (const c of await page.$$('.card')) if ((await c.evaluate((e) => e.textContent)).toLowerCase().includes(T)) return c.click();
    throw new Error('首页没有模拟考试入口 / no exam card on home');
  }

  async function runCase({ lang, width, dark }) {
    const tag = `${lang}-${width}-${dark ? 'dark' : 'light'}`;
    const { ctx, page } = await newPage({ lang, width, dark, tag });
    const full = width === 375 && !dark; // 详细截图只在部分组合上截
    const problem = (msg) => t.fail(`${tag} ${msg}`);
    const shot = async (name, force) => {
      const o = await overflowPx(page);
      if (o > 0) problem(`${name}: 横向溢出 ${o}px`);
      if (lang === 'en') {
        const txt = await page.evaluate(() => {
          const c = document.body.cloneNode(true);
          c.querySelectorAll('.logo').forEach((e) => e.remove());
          return c.innerText;
        });
        const bad = txt.split('\n').filter((l) => CJK.test(l));
        if (bad.length) problem(`${name}: 英文界面出现中文: ${bad.slice(0, 3).join(' | ')}`);
      }
      if (full || force || (width === 1024 && !dark)) await t.shot(page, `${tag}-${name}`);
    };

    await shot('0-home');
    await openExams(page, lang);
    await sleep(200);
    await shot('1-list');

    const presets = await page.$$eval('.exam-preset', (x) => x.length);
    t.check(presets === 3, `${tag}: 3 套试卷（${presets}）`);
    for (let pi = 0; pi < presets; pi++) {
      await (await page.$$('.exam-preset'))[pi].click();
      await sleep(150);
      await shot(`2-intro-${pi}`);
      // 不限时考第二套，检验关闭计时
      if (pi === 1) await page.click('.exam-timed input');
      await page.click('.exam-start button');
      await sleep(400);
      const hasTimer = !!(await page.$('.exam-timer'));
      if (hasTimer !== (pi !== 1)) problem(`p${pi}: timer shown=${hasTimer}`);
      const exam = await page.evaluate(() => globalThis.__earforgeExam);
      if (!Array.isArray(exam) || !exam.length) throw new Error(`${tag}: 测试钩子没有公开试卷 __earforgeExam`);
      let expectRight = 0;
      let shotMulti = false;
      let shotRhythm = false;
      for (let qi = 0; qi < exam.length; qi++) {
        const { answer, choices } = exam[qi];
        const right = qi % 2 === 0;
        if (qi === 0) {
          // 重听限制：自动播放 1 次 + 2 次重听
          const btn = '.play-row button';
          await page.click(btn);
          await page.click(btn);
          await sleep(50);
          const disabled = await page.$eval(btn, (b) => b.disabled);
          const left = await page.$eval('.exam-plays', (e) => e.textContent);
          if (!disabled || !/0/.test(left)) problem(`p${pi}: 重听次数限制未生效 (${disabled}, ${left})`);
          if (pi === 0) await shot('3-q-replays-used');
        }
        for (let s = 0; s < answer.length; s++) {
          let k = choices.indexOf(answer[s]);
          // 答错的题：多步题只错第一步（部分给分），单步题选另一个
          if (!right && s === 0) k = (k + 1) % choices.length;
          await (await page.$$('.exam-choices .choice'))[k].click();
        }
        if (right) expectRight++;
        // 考试中不应有任何对错反馈
        const fb = await page.$$eval('.choice.good, .choice.bad, .feedback', (x) => x.length);
        if (fb) problem(`p${pi} q${qi}: 考试中出现了对错反馈`);
        if (answer.length > 1 && !shotMulti) {
          shotMulti = true;
          await shot(`4-q-multi-${pi}`);
        }
        const isRhythm = await page.$$eval('.exam-choices .rhythm', (x) => x.length);
        if (isRhythm && !shotRhythm) {
          shotRhythm = true;
          await shot(`4-q-rhythm-${pi}`);
        }
        await page.click('.exam-next button');
        await sleep(60);
      }
      await sleep(300);
      const total = await page.$eval('.exam-total', (e) => parseInt(e.textContent));
      t.check(total > 20 && total < 90, `${tag} p${pi}: 对错各半的总分合理（${total}）`);
      const rv = await page.$$eval('.exam-rv', (x) => x.map((e) => e.className));
      t.check(rv.length === exam.length, `${tag} p${pi}: 回顾列出全部 ${exam.length} 题（${rv.length}）`);
      const okN = rv.filter((c) => c.includes(' ok')).length;
      t.check(okN === expectRight, `${tag} p${pi}: 回顾里答对 ${okN} 题，应为 ${expectRight}`);
      // 展开第一道错题和一道多步题，试听对比
      await (await page.$$('.exam-rv:not(.ok) summary'))[0].click();
      const parts = await page.$$('.exam-rv.part summary');
      if (parts[0]) await parts[0].click();
      await sleep(100);
      const cmp = await page.$$('.exam-rv details[open] .compare-row button');
      if (cmp.length < 2) problem(`p${pi}: 对比试听按钮只有 ${cmp.length} 个`);
      for (const b of cmp) await b.click();
      const slot = await page.$('.exam-rv details[open] .exam-rv-grid .slot');
      if (slot) await slot.click();
      await shot(`5-result-${pi}`, true);
      // 历史：再考一次 → 说明页上有历史
      await page.click('.summary-actions .primary');
      await sleep(150);
      t.check(!!(await page.$('.exam-history')), `${tag} p${pi}: 说明页显示考试历史`);
      if (pi === 2) await shot('6-intro-history');
      await page.click('.topbar > button');
      await sleep(150);
    }
    // 列表显示最好成绩
    const metas = await page.$$eval('.exam-preset .card-meta:last-child', (x) => x.map((e) => e.textContent));
    t.check(metas.every((m) => /\d/.test(m)), `${tag}: 列表显示最好成绩（${metas.join(' / ')}）`);
    await shot('7-list-after');

    // 专练薄弱点：再考第一套，前 3 题答错，然后点专练
    await (await page.$$('.exam-preset'))[0].click();
    await page.click('.exam-start button');
    await sleep(300);
    const exam = await page.evaluate(() => globalThis.__earforgeExam);
    for (let qi = 0; qi < exam.length; qi++) {
      const { answer, choices } = exam[qi];
      const k = qi < 3 ? (choices.indexOf(answer[0]) + 1) % choices.length : choices.indexOf(answer[0]);
      await (await page.$$('.exam-choices .choice'))[k].click();
      await page.keyboard.press('Enter');
      await sleep(40);
    }
    await sleep(300);
    const drills = await page.$$('.exam-drills button');
    if (t.check(drills.length > 0, `${tag}: 成绩页有「专练薄弱点」按钮`)) {
      await drills[0].click();
      await sleep(300);
      const sub = await page.$eval('.practice-title p', (e) => e.textContent);
      t.check(sub.includes(lang === 'zh' ? '专练薄弱点' : 'eak'), `${tag}: 进入专练页（${sub}）`);
      await shot('8-drill');
    }
    await page.click('.topbar > button');
    await sleep(200);
    await ctx.close();
  }

  async function timerCase({ lang, width, dark }) {
    const tag = `${lang}-${width}-${dark ? 'dark' : 'light'}-timer`;
    const { ctx, page } = await newPage({ lang, width, dark, secs: 4, tag });
    await openExams(page, lang);
    await sleep(150);
    await (await page.$$('.exam-preset'))[1].click();
    await page.click('.exam-start button');
    await sleep(300);
    const exam = await page.evaluate(() => globalThis.__earforgeExam);
    await (await page.$$('.exam-choices .choice'))[exam[0].choices.indexOf(exam[0].answer[0])].click();
    await page.click('.exam-next button');
    await sleep(1500);
    const timer = await page.$eval('.exam-timer', (e) => e.textContent).catch(() => '');
    t.check(/0:0[0-3]/.test(timer), `${tag}: 计时器倒数（${timer}）`);
    await t.shot(page, `${tag}-1-running`);
    await sleep(3500);
    t.check(!!(await page.$('.exam-timeout')), `${tag}: 到点显示超时提示`);
    const total = await page.$eval('.exam-total', (e) => parseInt(e.textContent)).catch(() => -1);
    t.check(total > 0 && total < 20, `${tag}: 超时交卷总分（${total}）`);
    const blanks = await page.$$eval('.exam-rv.bad', (x) => x.length);
    t.check(blanks >= exam.length - 2, `${tag}: 未答题记为错（${blanks}/${exam.length}）`);
    await t.shot(page, `${tag}-2-timeout`);
    // 历史里带超时标记
    await page.click('.summary-actions .primary');
    await sleep(150);
    const val = await page.$eval('.exam-history .mastery-val', (e) => e.textContent).catch(() => '');
    t.check(val.includes('⏱'), `${tag}: 历史带超时标记（${val}）`);
    await ctx.close();
  }

  // 随机音色：交卷后回顾里重放某题，用的是考试中这道题的乐器（而不是最后一题抽到的）
  async function randomTimbreCase() {
    const tag = 'zh-1024-light-random';
    const { ctx, page } = await newPage({ lang: 'zh', width: 1024, dark: false, tag });
    await openExams(page, 'zh');
    await sleep(150);
    await page.evaluate(() => {
      const a = globalThis.__earforgeAudio;
      a.timbre = 'random';
      globalThis.__plays = [];
      const play = a.play.bind(a);
      a.play = (ev, tb) => {
        globalThis.__plays.push({ key: JSON.stringify(ev), timbre: tb ?? a.current });
        return play(ev, tb);
      };
    });
    await (await page.$$('.exam-preset'))[0].click();
    await page.click('.exam-start button');
    await sleep(300);
    const exam = await page.evaluate(() => globalThis.__earforgeExam);
    for (let qi = 0; qi < exam.length; qi++) {
      await sleep(250); // 等本题自动播放（抽乐器）
      const { answer, choices } = exam[qi];
      for (const a of answer) await (await page.$$('.exam-choices .choice'))[choices.indexOf(a)].click();
      await page.click('.exam-next button');
    }
    await sleep(300);
    const asked = await page.evaluate(() => globalThis.__plays.splice(0));
    const used = new Set(asked.map((p) => p.timbre));
    // 每题只自动播放一次：第 i 次播放即第 i 题
    t.check(asked.length === exam.length && used.size >= 3, `${tag}: 考试中各题换乐器（${asked.length} 次，${used.size} 种）`);
    const items = await page.$$('.exam-rv summary');
    let checked = 0;
    let bad = 0;
    for (let i = 0; i < items.length; i++) {
      await items[i].click();
      const btn = await page.$(`.exam-rv:nth-child(${i + 1}) .compare-row button`);
      if (!btn) continue;
      await btn.click();
      const [p] = await page.evaluate(() => globalThis.__plays.splice(0));
      const orig = asked[i];
      checked++;
      if (!p || orig?.key !== p.key || orig.timbre !== p.timbre) bad++;
    }
    t.check(checked === items.length && bad === 0, `${tag}: 回顾重放用该题考试时的乐器（核对 ${checked} 题，不一致 ${bad}）`);
    await ctx.close();
  }

  if (!only || only === 'random')
    try {
      await randomTimbreCase();
    } catch (e) {
      t.fail(`random timbre: ${e.stack ?? e}`);
    }

  for (const lang of ['zh', 'en'])
    for (const width of [375, 1024])
      for (const dark of [false, true]) {
        const id = `${lang}-${width}-${dark ? 'dark' : 'light'}`;
        if (only && (only === 'timer' || only === 'random' || !id.includes(only))) continue;
        try {
          await runCase({ lang, width, dark });
        } catch (e) {
          t.fail(`${id}: ${e.stack ?? e}`);
        }
      }
  if (!only || only === 'timer')
    for (const c of [
      { lang: 'zh', width: 375, dark: false },
      { lang: 'en', width: 1024, dark: true },
    ]) {
      try {
        await timerCase(c);
      } catch (e) {
        t.fail(`timer ${c.lang}: ${e.stack ?? e}`);
      }
    }
});
