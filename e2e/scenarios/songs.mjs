// 视唱曲库：曲库 → 筛选 → 打开歌曲 → 播放 → 假麦克风跟唱 → 结果 → 逐音练习 → 「已唱」标记
// 中英文 × 375/桌面 × 明暗。原 songs.mjs
import { clickText, overflowPx, run, sleep } from '../lib/harness.mjs';

const TEXT = {
  zh: { lib: '视唱曲库', play: '播放旋律', stop: '停止', sing: '开始跟唱', practice: '逐音练习', startPractice: '开始逐音练习', clear: '清除筛选', tag: '小调', song: '热十字面包', back: '返回', song2: '绿袖子' },
  en: { lib: 'Sight-Singing Library', play: 'Play melody', stop: 'Stop', sing: 'Start singing', practice: 'Note by note', startPractice: 'Start note by note', clear: 'Clear filters', tag: 'Minor', song: 'Hot Cross Buns', back: 'Back', song2: 'Greensleeves' },
};

await run(async (t) => {
  const browser = await t.launch({ fakeMic: true });
  for (const { lang, width, dark } of [
    { lang: 'zh', width: 1000, dark: false },
    { lang: 'zh', width: 375, dark: true },
    { lang: 'en', width: 1000, dark: true },
    { lang: 'en', width: 375, dark: false },
  ]) {
    const tag = `${lang}-${width}-${dark ? 'dark' : 'light'}`;
    const ctx = await browser.createBrowserContext();
    const page = await t.open({ target: ctx, lang: lang === 'zh' ? 'zh-CN' : 'en-US', width, dark, tag });
    const T = TEXT[lang];
    const click = (text, sel) => clickText(page, text, sel);
    const shot = async (name) => {
      const o = await overflowPx(page);
      if (o > 0) t.fail(`${tag} ${name}: 横向溢出 ${o}px`);
      await t.shot(page, `${tag}-${name}`);
    };

    await shot('0-home');
    await click(T.lib, '.card');
    await sleep(200);
    await shot('1-library');
    await click('4', '.songs-filter .seg button');
    await click(T.tag, '.chip');
    await sleep(100);
    t.check((await page.$$eval('.song-card', (x) => x.length)) >= 1, `${tag}: 筛选后有曲目`);
    await shot('2-filtered');
    await click(T.song2, '.song-card');
    await sleep(500);
    await shot('3-greensleeves');
    await click(T.back);
    await sleep(200);
    await click(T.clear);
    await click(T.song, '.song-card');
    await sleep(300);
    await click(T.play);
    await sleep(1800);
    await shot('4-playing');
    await click(T.stop);
    await click(T.sing);
    await sleep(6000);
    await shot('5-singing');
    await page.waitForSelector('.song-result', { timeout: 40000 });
    await sleep(200);
    t.check((await page.$$('.song-cents li')).length > 0, `${tag}: 跟唱结束显示逐音结果`);
    await shot('6-result');
    await click(T.practice, '.song-sing .seg button');
    await click(T.startPractice);
    await sleep(1500);
    await shot('7-practice');
    await click(T.back);
    await sleep(300);
    t.check((await page.$$eval('.song-card.sung', (x) => x.length)) >= 1, `${tag}: 唱过的曲目带「已唱」标记`);
    await shot('8-library-sung');
    await ctx.close();
  }
});
