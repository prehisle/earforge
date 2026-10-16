// 新练习：和弦转位、音阶与调式、复音程。中文（375 浅色）与英文（1024 深色）下各答对、答错一题：
// 反馈对错正确、答错后能试听正确答案、记录写进本地存储、无横向溢出；英文界面不出现中文。
import { answerQuestion, CJK, clickText, overflowPx, readQuestion, readStore, run, sleep } from '../lib/harness.mjs';

const COMPOUND = ['m9', 'M9', 'm10', 'M10', 'P11', 'A11', 'P12', 'm13', 'M13', 'm14', 'M14', 'P15'];

const UI = {
  zh: { start: '开始练习', back: '返回', correct: '正确答案', gotIt: '知道了' },
  en: { start: 'Start', back: 'Back', correct: 'Correct answer', gotIt: 'Got it' },
};
const EX = [
  { id: 'inversions', zh: '和弦转位', en: 'Chord Inversions' },
  { id: 'scales', zh: '音阶与调式', en: 'Scales & Modes' },
  { id: 'intervals', zh: '音程识别', en: 'Intervals', compound: true },
];

await run(async (t) => {
  const browser = await t.launch();
  for (const [lang, width, dark] of [
    ['zh', 375, false],
    ['en', 1024, true],
  ]) {
    const tag = `${lang}-${width}-${dark ? 'dark' : 'light'}`;
    const T = UI[lang];
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, lang: lang === 'zh' ? 'zh-CN' : 'en-US', width, height: 812, dark, tag });
    // 预置进度：转位与音阶解锁到最后一级（全部考点），音程只练复音程（和声音程）
    await page.evaluate((compound) => {
      const s = JSON.parse(localStorage.getItem('earforge:v1') ?? '{}');
      s.version = 1;
      s.settings = { ...(s.settings ?? {}), onboarded: true };
      s.exercises = {
        inversions: { level: 3, custom: null, items: {}, options: { qual: 'all', voicing: 'both' } },
        scales: { level: 6, custom: null, items: {}, options: { dir: 'both' } },
        intervals: { level: 11, custom: compound, items: {}, options: { dir: 'harm' } },
      };
      s.daily = {};
      localStorage.setItem('earforge:v1', JSON.stringify(s));
    }, COMPOUND);
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(200);

    const noCjk = async (name) => {
      if (lang !== 'en') return;
      const hit = await page.evaluate((src) => {
        let text = document.body.innerText;
        for (const el of document.querySelectorAll('.logo, [lang^="zh"]')) text = text.split(el.innerText).join('');
        return text.match(new RegExp(`.{0,20}${src}.{0,20}`))?.[0] ?? null;
      }, CJK.source);
      t.check(!hit, `${tag}/${name}: 英文界面无中文${hit ? `（${hit}）` : ''}`);
    };

    for (const ex of EX) {
      await clickText(page, ex[lang], '.card');
      await sleep(250);
      await clickText(page, T.gotIt).catch(() => {});
      await clickText(page, T.start);
      await page.waitForSelector('.choices .choice');
      await sleep(200);

      const q1 = await readQuestion(page);
      t.check(q1?.ex === ex.id, `${tag}/${ex.id}: 读到题目（${q1?.item}）`);
      if (ex.compound) t.check(COMPOUND.includes(q1?.item), `${tag}/${ex.id}: 只出复音程（${q1?.item}）`);
      t.check(await answerQuestion(page, true), `${tag}/${ex.id}: 按答案作答显示「答对」`);
      t.check((await overflowPx(page)) <= 0, `${tag}/${ex.id}: 答对后无横向溢出`);
      await noCjk(`${ex.id}-good`);
      await t.shot(page, `${tag}-${ex.id}-good`);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('.feedback'));
      await sleep(200);

      t.check(!(await answerQuestion(page, false)), `${tag}/${ex.id}: 先选错再改对显示「答错」`);
      t.check(!!(await page.$('.choice.bad')), `${tag}/${ex.id}: 选错的选项标红`);
      await clickText(page, T.correct);
      await sleep(150);
      t.check((await overflowPx(page)) <= 0, `${tag}/${ex.id}: 答错后无横向溢出`);
      await noCjk(`${ex.id}-bad`);
      await t.shot(page, `${tag}-${ex.id}-bad`);

      const st = await readStore(page);
      const day = Object.values(st.daily)[0];
      t.check(day?.ex?.[ex.id]?.[0] === 2 && day.ex[ex.id][1] === 1, `${tag}/${ex.id}: 今日记录 2 题答对 1（${JSON.stringify(day?.ex?.[ex.id])}）`);
      await clickText(page, T.back);
      await sleep(200);
    }
    await ctx.close();
  }
});
