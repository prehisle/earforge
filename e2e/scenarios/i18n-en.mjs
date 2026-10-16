// 英文界面：新手引导、各练习（出题 / 反馈 / 选项，含和弦转位、音阶与调式、复音程）、节奏模仿、视唱、今日训练、统计、设置、关于与帮助，
// 在 375 / 1024 × 浅色 / 深色下扫描漏翻的中文与溢出；最后切回中文再切回英文。原 i18n.mjs
// 可选：E2E_FILTER=375-light 只跑一个配置。
import { CJK, run, sleep } from '../lib/harness.mjs';

const only = process.env.E2E_FILTER;

await run(async (t) => {
  const browser = await t.launch({ fakeMic: true });
  let screens = 0;

  async function runConfig(width, dark) {
    const tag = `${width}-${dark ? 'dark' : 'light'}`;
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, lang: 'en-US', width, height: width < 500 ? 812 : 800, dark, onboarding: 'keep', tag });

    let n = 0;
    const scan = async (name, shot = true) => {
      const res = await page.evaluate((cjkSource) => {
        const CJK = new RegExp(cjkSource);
        // 品牌 logo 与语言切换里的「中文」按钮除外
        const skip = (el) => el.closest('.logo, [lang^="zh"]');
        const hits = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const el = node.parentElement;
          if (!el || skip(el)) continue;
          if (CJK.test(node.textContent)) hits.push(node.textContent.trim().slice(0, 80));
        }
        for (const el of document.querySelectorAll('[title], [aria-label]')) {
          if (skip(el)) continue;
          for (const a of ['title', 'aria-label']) {
            const v = el.getAttribute(a);
            if (v && CJK.test(v)) hits.push(`@${a}: ${v.slice(0, 80)}`);
          }
        }
        if (CJK.test(document.title)) hits.push(`title: ${document.title}`);
        // innerText 再扫一遍，去掉 logo 与语言按钮的文字
        let text = document.body.innerText;
        for (const el of document.querySelectorAll('.logo, [lang^="zh"]')) text = text.split(el.innerText).join('');
        if (CJK.test(text)) hits.push(`innerText: ${text.match(new RegExp(`.{0,20}${CJK.source}.{0,20}`))?.[0]}`);
        // 溢出：页面横向滚动，以及按钮 / 卡片内容超出
        const over = [];
        if (document.documentElement.scrollWidth > window.innerWidth + 1)
          over.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
        for (const el of document.querySelectorAll('button, .card, .tile, .choice, .chip, .slot, .seg, .prompt, .feedback')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (el.scrollWidth > el.clientWidth + 1 || r.right > window.innerWidth + 1)
            over.push(`${el.className || el.tagName}: "${(el.textContent || '').trim().slice(0, 40)}" sw=${el.scrollWidth} cw=${el.clientWidth} right=${Math.round(r.right)}`);
        }
        return { hits, over, lang: document.documentElement.lang };
      }, CJK.source);
      screens++;
      if (res.hits.length) t.fail(`${tag}/${name}: 英文界面出现中文: ${res.hits.join(' | ')}`);
      if (res.over.length) t.fail(`${tag}/${name}: 溢出: ${res.over.join(' | ')}`);
      if (shot) await t.shot(page, `${tag}-${String(++n).padStart(2, '0')}-${name}`);
      return res;
    };

    const clickText = async (text, sel = 'button') => {
      for (const el of await page.$$(sel)) {
        if ((await el.evaluate((e) => e.textContent)).includes(text)) {
          await el.click();
          await sleep(150);
          return;
        }
      }
      throw new Error(`${tag}: no ${sel} "${text}"`);
    };

    /** 作答：依次点选项直到出现反馈（多步题逐步）。 */
    const answer = async () => {
      for (let guard = 0; guard < 80 && !(await page.$('.feedback')); guard++) {
        const choices = await page.$$('.choice:not(.bad)');
        if (!choices.length) break;
        for (const c of choices) {
          await c.click().catch(() => {});
          await sleep(25);
          if (await page.$('.feedback')) break;
          // 多步题：答对一步后选项状态重置，重新取
          const bad = await c.evaluate((e) => e.classList.contains('bad')).catch(() => false);
          if (!bad) break;
        }
      }
      await page.waitForSelector('.feedback', { timeout: 5000 });
    };

    // ── 新手引导（应为英文：浏览器语言 en-US） ──
    const lang0 = await scan('onboard-welcome');
    t.check(lang0.lang === 'en', `${tag}: 新用户按浏览器语言显示英文（html lang = ${lang0.lang}）`);
    await clickText('Next');
    await clickText("Can't hear", 'summary').catch(() => {});
    await scan('onboard-sound');
    await clickText('Next');
    await clickText('I play an instrument');
    await scan('onboard-background');
    await clickText('Next');
    await scan('onboard-prefs');
    await clickText('Next');
    await scan('onboard-done');
    await clickText('Go to home');
    await sleep(200);
    await scan('home');

    for (const [title, k] of [
      ['Scale Degrees', 4],
      ['Chords in a Key', 3],
      ['Melodic Dictation', 2],
      ['Intervals', 4],
      ['Chord Quality', 3],
      ['Rhythmic Dictation', 3],
      ['Chord Inversions', 2],
      ['Scales & Modes', 2],
    ]) {
      const slug = title.replace(/ /g, '_');
      await clickText(title, '.card');
      await scan(`${slug}-intro`, title === 'Scale Degrees' || width < 500);
      await clickText('Start');
      await sleep(300);
      for (let i = 0; i < k; i++) {
        await answer();
        if (i === 0) await scan(`${slug}-feedback`);
        await page.keyboard.press('Enter');
        await sleep(250);
      }
      await clickText('Options');
      await sleep(200);
      await scan(`${slug}-options`);
      await clickText('Back');
    }

    // 四和弦进行（小调）
    await clickText('Chords in a Key', '.card');
    await clickText('Options');
    await clickText('Natural minor');
    await clickText('Four-chord progression');
    await clickText('Options');
    await clickText('Start');
    await sleep(300);
    await answer();
    await scan('progressions-four-minor');
    await clickText('Back');

    // 和声音程
    await clickText('Intervals', '.card');
    await clickText('Options');
    await clickText('Harmonic (together)');
    await clickText('Options');
    await clickText('Start');
    await sleep(300);
    await answer();
    await scan('intervals-harmonic', false);
    await clickText('Back');

    // 复音程：预置「只练复音程」（音程最后一级的自选考点）后重新加载
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('earforge:v1'));
      s.exercises.intervals = { ...s.exercises.intervals, level: 11, custom: ['m9', 'M9', 'm10', 'M10', 'P11', 'A11', 'P12', 'm13', 'M13', 'm14', 'M14', 'P15'] };
      localStorage.setItem('earforge:v1', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(200);
    await clickText('Intervals', '.card');
    await scan('intervals-compound-intro', width < 500);
    await clickText('Start');
    await sleep(300);
    await answer();
    await scan('intervals-compound');
    await clickText('Back');

    // 节奏模仿：等待自动开始并结束
    await clickText('Rhythm Tapping', '.card');
    await scan('rhythmTap-tip', width < 500);
    await clickText('Start');
    await sleep(1200);
    await scan('rhythmTap-counting');
    const pad = await page.$('.tap-pad');
    for (let i = 0; i < 4; i++) {
      await pad.click().catch(() => {});
      await sleep(700);
    }
    await page.waitForSelector('.tap-summary', { timeout: 20000 });
    await scan('rhythmTap-result');
    await clickText('Back');

    // 视唱（假麦克风）：跳过所有音
    await clickText('Sight-singing', '.card');
    await clickText('Start');
    await sleep(1500);
    await scan('singing');
    for (let i = 0; i < 6 && !(await page.$('.feedback')); i++) await clickText('Skip this note').catch(() => {});
    await page.waitForSelector('.feedback', { timeout: 5000 });
    await scan('singing-done', false);
    await clickText('Back');

    // 今日训练
    await clickText("Start today's training");
    await sleep(400);
    for (let i = 0; i < 3; i++) {
      await answer();
      if (i === 0) await scan('mix-feedback');
      await page.keyboard.press('Enter');
      await sleep(300);
    }
    await clickText('Back');
    await sleep(200);
    await scan('home-after');

    await clickText('Stats');
    await scan('stats');
    const bars = await page.$$('.bar-hit');
    if (bars.length) {
      await bars[bars.length - 1].hover();
      await sleep(100);
      await scan('stats-hover', false);
    }
    await clickText('Back');
    await clickText('Settings');
    await scan('settings');
    // 关于与帮助（从设置页进入，返回到设置页）
    await clickText('Guide & shortcuts');
    await sleep(200);
    const about = await scan('about');
    t.check(!about.hits.length, `${tag}: About & help page has no CJK`);
    await clickText('Back');

    // 切回中文
    await clickText('中文');
    await sleep(200);
    const zh = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, h1: document.querySelector('h1')?.textContent }));
    t.check(zh.lang === 'zh-CN' && /耳锻/.test(zh.title) && zh.h1 === '设置', `${tag}: 切换到中文（${JSON.stringify(zh)}）`);
    await t.shot(page, `${tag}-${String(++n).padStart(2, '0')}-settings-zh`);
    await clickText('返回');
    const zhHome = await page.evaluate(() => document.querySelector('.cards .card-title')?.textContent);
    t.check(zhHome === '调内音级', `${tag}: 中文首页第一张卡片（${zhHome}）`);
    await t.shot(page, `${tag}-${String(++n).padStart(2, '0')}-home-zh`);
    // 再切回英文
    await clickText('设置');
    await clickText('English');
    const back = await page.evaluate(() => document.querySelector('h1')?.textContent);
    t.check(back === 'Settings', `${tag}: 切回英文（${back}）`);
    await ctx.close();
  }

  for (const [w, d] of [
    [375, false],
    [1024, false],
    [375, true],
    [1024, true],
  ]) {
    const id = `${w}-${d ? 'dark' : 'light'}`;
    if (only && only !== id) continue;
    try {
      await runConfig(w, d);
    } catch (e) {
      t.fail(`${id}: ${e.stack ?? e}`);
    }
  }
  t.check(screens > 0, `共扫描 ${screens} 屏`);
});
