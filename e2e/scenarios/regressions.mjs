// 代码审查回归（原 /workspace/1016/e2e/review.mjs）与加固项：
// 离开页面时麦克风关闭（授权等待中离开）、曲库循环开关、考试长按回车 / Ctrl+数字 / 离开确认、
// 练习 Ctrl+数字不作答、同一题两次作答只记一次、只用键盘返回、两个标签页同时练习不丢记录。
import { clickText, readQuestion, readStore, run, sleep } from '../lib/harness.mjs';

/** 包装 getUserMedia：延迟授权（模拟权限提示）、可让第一次被拒绝，并记下拿到的流以检查是否已关闭 */
function micHook(delay, denyFirst) {
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  window.__streams = [];
  let calls = 0;
  navigator.mediaDevices.getUserMedia = async (c) => {
    calls++;
    if (denyFirst && calls === 1) throw new DOMException('denied', 'NotAllowedError');
    await new Promise((r) => setTimeout(r, delay));
    const s = await orig(c);
    window.__streams.push(s);
    return s;
  };
}

const liveTracks = (page) =>
  page.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).filter((x) => x.readyState === 'live').length);
const back = (page) => clickText(page, 'Back', '.topbar button');
const hasButton = (page, text) => page.evaluate((s) => [...document.querySelectorAll('button')].some((b) => b.textContent.includes(s)), text);
const examProgress = (page) => page.$eval('.practice-title .muted', (e) => e.textContent);

await run(async (t) => {
  const browser = await t.launch({ fakeMic: true });
  const open = async (tag, { micDelay = 800, denyFirst = false } = {}) => {
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, lang: 'en-US', width: 1000, height: 900, tag, init: micHook, initArgs: [micDelay, denyFirst] });
    return { ctx, page };
  };

  // ① 打节奏：开启拍手输入后、授权完成前离开本页 → 麦克风应关闭；之后还能再次开启
  {
    const { ctx, page } = await open('tap');
    await clickText(page, 'Rhythm Tapping', '.card');
    await sleep(200);
    await clickText(page, 'Start');
    await sleep(600);
    await clickText(page, 'Clap input');
    await sleep(100);
    await back(page);
    await sleep(1500);
    t.check((await liveTracks(page)) === 0, 'tap: 授权等待中离开，麦克风关闭');
    await clickText(page, 'Rhythm Tapping', '.card');
    await sleep(200);
    await clickText(page, 'Start');
    await sleep(600);
    await clickText(page, 'Clap input');
    await sleep(1500);
    const err = await page.evaluate(() => !!document.querySelector('.tap .error'));
    t.check((await hasButton(page, 'Turn off clap')) && !err, 'tap: 同一会话里可以再次开启拍手输入');
    await back(page);
    await sleep(500);
    t.check((await liveTracks(page)) === 0, 'tap: 开着拍手输入离开，麦克风关闭');
    await ctx.close();
  }

  // ② 视唱：首次授权失败 → 点「打开麦克风」→ 授权完成前离开 → 麦克风应关闭
  {
    const { ctx, page } = await open('sing', { denyFirst: true });
    await clickText(page, 'Sight-singing', '.card');
    await sleep(200);
    await clickText(page, 'Start');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Turn on microphone')), { timeout: 5000 });
    await clickText(page, 'Turn on microphone');
    await sleep(100);
    await back(page);
    await sleep(1500);
    t.check((await liveTracks(page)) === 0, 'sing: 重新授权等待中离开，麦克风关闭');
    await ctx.close();
  }

  // ③ 曲库：开着循环播放，中途取消循环 → 本遍结束后停下
  {
    const { ctx, page } = await open('song');
    await clickText(page, 'Sight-Singing Library', '.card');
    await sleep(300);
    await (await page.$('.song-card')).click();
    await sleep(300);
    await page.evaluate(() => {
      const el = document.querySelector('#song-tempo');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '160');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickText(page, 'Metronome', '.song-toggles label');
    await clickText(page, 'Loop', '.song-toggles label');
    await clickText(page, 'Play melody');
    await sleep(300);
    t.check(!(await hasButton(page, 'Play melody')), 'song: 循环播放中');
    await clickText(page, 'Loop', '.song-toggles label');
    const stopped = await page
      .waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Play melody')), { timeout: 20000 })
      .then(
        () => true,
        () => false,
      );
    t.check(stopped, 'song: 播放中取消循环，本遍结束后停下');
    await ctx.close();
  }

  // ④ 模拟考试：长按回车（自动重复）只翻一题；Ctrl+数字不作答；进行中离开页面要确认，交卷后不再拦
  {
    const { ctx, page } = await open('exam');
    await clickText(page, 'Mock exams', '.card');
    await sleep(200);
    await (await page.$('.exam-preset')).click();
    await sleep(200);
    await clickText(page, 'Start exam');
    await sleep(500);
    t.check((await examProgress(page)).startsWith('Question 1 of'), 'exam: 从第 1 题开始');
    await page.keyboard.down('Enter');
    for (let i = 0; i < 6; i++) {
      await sleep(40);
      await page.keyboard.down('Enter'); // 已按下时再 down = 自动重复（repeat: true）
    }
    await page.keyboard.up('Enter');
    await sleep(300);
    const p2 = await examProgress(page);
    t.check(p2.startsWith('Question 2 of'), `exam: 长按回车只翻一题（${p2}）`);
    await page.keyboard.down('Control');
    await page.keyboard.press('1');
    await page.keyboard.up('Control');
    await sleep(200);
    t.check(!(await page.$('.choice.picked')), 'exam: Ctrl+1 不作答');
    const guarded = () =>
      page.evaluate(() => {
        const e = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      });
    t.check(await guarded(), 'exam: 考试中关闭 / 刷新页面会弹出离开确认（beforeunload）');
    // 退出考试（按两次「退出」确认）后不再拦截
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await sleep(300);
    t.check(!!(await page.$('.exam-start')) && !(await guarded()), 'exam: 退出考试后离开页面不再确认');
    await ctx.close();
  }

  // ⑤ 练习：Ctrl+数字（浏览器切换标签页）不作答，普通数字照常作答
  {
    const { ctx, page } = await open('quiz-ctrl');
    await clickText(page, 'Intervals', '.card');
    await sleep(200);
    await clickText(page, 'Start');
    await sleep(500);
    await page.keyboard.down('Control');
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.up('Control');
    await sleep(200);
    t.check(!(await page.$('.choice.bad')) && !(await page.$('.feedback')), 'quiz: Ctrl+数字不作答');
    await page.keyboard.press('1');
    await sleep(200);
    t.check(!!(await page.$('.choice.bad')) || !!(await page.$('.feedback')), 'quiz: 普通数字键照常作答');
    await ctx.close();
  }

  // ⑥ 练习：同一任务里连着两次正确作答（如 MIDI 和弦的多条消息）只记一次
  {
    const { ctx, page } = await open('quiz-double');
    await clickText(page, 'Intervals', '.card');
    await sleep(200);
    await clickText(page, 'Start');
    await page.waitForSelector('.choices .choice');
    const q = await readQuestion(page);
    const key = String(q.choices.indexOf(q.answer[0]) + 1);
    await page.evaluate((k) => {
      for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }, key);
    await sleep(300);
    const st = await readStore(page);
    const n = Object.values(st.daily)[0]?.n ?? 0;
    t.check(!!(await page.$('.feedback.good')) && n === 1, `quiz: 同一题两次作答只记一次（${n}）`);
    await ctx.close();
  }

  // ⑦ 只用键盘：Tab 到「返回」按回车应返回；考试里回车在退出按钮上不跳题；鼠标点过选项后回车仍是下一题
  {
    const { ctx, page } = await open('kbd');
    await clickText(page, 'Intervals', '.card');
    await sleep(300);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await sleep(300);
    t.check(!!(await page.$('.cards')) && !(await page.$('.question')), 'kbd: 练习开始页 Tab 到返回 + 回车回到首页');
    await clickText(page, 'Mock exams', '.card');
    await sleep(300);
    await (await page.$('.exam-preset')).click();
    await sleep(300);
    await clickText(page, 'Start exam');
    await sleep(500);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await sleep(200);
    t.check((await examProgress(page)).startsWith('Question 1 of'), 'kbd: 考试退出按钮上按回车不跳题');
    await page.keyboard.press('Enter');
    await sleep(300);
    t.check(!!(await page.$('.exam-start')), 'kbd: 考试退出按钮可以用键盘操作');
    await clickText(page, 'Start exam');
    await sleep(500);
    await (await page.$('.exam-choices .choice')).click();
    await page.keyboard.press('Enter');
    await sleep(300);
    t.check((await examProgress(page)).startsWith('Question 2 of'), 'kbd: 鼠标点过选项后回车仍是下一题');
    await ctx.close();
  }

  // ⑧ 两个标签页同时练习：交替作答，记录都保留（原来后写的标签页会覆盖先写的）
  {
    const ctx = await browser.createBrowserContext();
    const a = await t.open({ target: ctx, lang: 'en-US', tag: 'tab-a' });
    const b = await t.open({ target: ctx, lang: 'en-US', tag: 'tab-b' });
    const start = async (page) => {
      await page.bringToFront();
      await clickText(page, 'Intervals', '.card');
      await sleep(200);
      await clickText(page, 'Start');
      await page.waitForSelector('.choices .choice');
    };
    const answerOne = async (page) => {
      await page.bringToFront();
      const q = await readQuestion(page);
      await (await page.$$('.choices .choice'))[q.choices.indexOf(q.answer[0])].click();
      await page.waitForSelector('.feedback.good');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('.feedback'));
      await sleep(100);
    };
    await start(a);
    await start(b);
    for (let i = 0; i < 3; i++) {
      await answerOne(a);
      await answerOne(b);
    }
    const st = await readStore(b);
    const day = Object.values(st.daily)[0];
    t.check(day?.n === 6 && day.ex?.intervals?.[0] === 6, `tabs: 两个标签页交替各答 3 题，今日记录 6 题（${JSON.stringify(day)}）`);
    const items = Object.values(st.exercises.intervals.items).reduce((x, s) => x + s.n, 0);
    t.check(items === 6, `tabs: 考点统计合计 6 次作答（${items}）`);
    // 另一个标签页收到 storage 事件后界面上的今日题数也更新了
    await a.bringToFront();
    await back(a);
    await sleep(300);
    const home = await a.evaluate(() => document.querySelector('.tile.goal .tile-value')?.textContent ?? '');
    t.check(home.startsWith('6/'), `tabs: 首页今日题数包含另一标签页的作答（${home}）`);
    await ctx.close();
  }
});
