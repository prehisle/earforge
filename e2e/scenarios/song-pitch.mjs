// 跟唱评分（真实音高）：假麦克风播放 C4 正弦波（e2e/fixtures/make-c4-wav.mjs 生成），
// 在 C 大调、高音区唱「热十字面包」，检查评分流程跑通、do 判为唱准。原 tone.mjs
import { clickText, run, sleep } from '../lib/harness.mjs';

await run(async (t) => {
  await t.launch({ fakeMic: 'wav' });
  const page = await t.open({ lang: 'en-US', tag: 'pitch' });
  await clickText(page, 'Sight-Singing Library', '.card');
  await sleep(200);
  await clickText(page, 'Hot Cross Buns', '.song-card');
  await sleep(300);
  await page.select('#song-key', '0');
  await clickText(page, 'High (female');
  await sleep(200);
  await clickText(page, 'Start singing');
  await page.waitForSelector('.song-result', { timeout: 40000 });
  const notes = await page.$$eval('.song-cents li', (xs) =>
    xs.map((x) => ({ ok: x.className === 'ok', name: x.querySelector('.song-cents-name')?.textContent, val: x.querySelector('.song-cents-val')?.textContent })),
  );
  const big = await page.$eval('.summary-big', (e) => e.textContent);
  t.log(notes.map((n) => `${n.ok ? 'ok' : 'bad'}:${n.name}${n.val}`).join(' '), big);
  t.check(notes.length === 17, `逐音结果 17 个音（${notes.length}）`);
  t.check(/\d+%/.test(big), `显示总分（${big}）`);
  const dos = notes.filter((n) => n.name === 'do');
  t.check(dos.length > 0 && dos.every((n) => n.ok), `C4 正弦波下所有 do 判为唱准（${dos.filter((n) => n.ok).length}/${dos.length}）`);
  const others = notes.filter((n) => n.name !== 'do');
  t.check(
    others.length > 0 && others.every((n) => !n.ok && Number(n.val) < -100),
    `其他音（re/mi）判为唱低（${others.map((n) => n.name + n.val).join(' ')}）`,
  );
  await t.shot(page, 'tone-result');
});
