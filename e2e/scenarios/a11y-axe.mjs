// axe-core 无障碍审计：中英 × 明暗 × 主要页面（新手引导、首页、练习出题 / 答完（含和弦转位、音阶与调式、复音程）、今日训练、统计、设置、曲库、曲目练习）。
// 任何违规都算失败；明细写到 axe.json / summary.txt。原 axe.mjs
// E2E_AXE_IMPACT=serious 可只对 serious / critical 级别判失败（其余照样记录）。
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { answerQuestion, run, sleep } from '../lib/harness.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const LEVELS = ['minor', 'moderate', 'serious', 'critical'];
const minImpact = LEVELS.indexOf(process.env.E2E_AXE_IMPACT ?? 'minor');

await run(async (t) => {
  const browser = await t.launch({ fakeMic: true });
  const all = [];
  for (const lang of ['zh', 'en'])
    for (const dark of [false, true]) {
      const tag = `${lang}-${dark ? 'dark' : 'light'}`;
      const ctx = await browser.createBrowserContext();
      const page = await t.open({ target: ctx, lang: lang === 'zh' ? 'zh-CN' : 'en-US', dark, onboarding: 'keep', tag });
      const T =
        lang === 'zh'
          ? { start: '开始练习', back: '返回', stats: '统计', settings: '设置', lib: '视唱曲库', degrees: '调内音级', inversions: '和弦转位', scales: '音阶与调式', intervals: '音程识别' }
          : { start: 'Start', back: 'Back', stats: 'Stats', settings: 'Settings', lib: 'Sight-Singing Library', degrees: 'Scale Degrees', inversions: 'Chord Inversions', scales: 'Scales & Modes', intervals: 'Intervals' };
      // 按文字或 aria-label 匹配
      const click = async (text, sel = 'button') => {
        for (const el of await page.$$(sel)) {
          const s = await el.evaluate((e) => (e.textContent + ' ' + (e.getAttribute('aria-label') ?? '')).trim());
          if (s.includes(text)) return el.click();
        }
        throw new Error(`${tag}: no ${sel} "${text}"`);
      };
      const audit = async (name) => {
        await sleep(400);
        await page.addScriptTag({ path: AXE });
        const r = await page.evaluate(async () => {
          const res = await window.axe.run(document, { resultTypes: ['violations'] });
          return res.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n').slice(0, 3).join(' | ') })),
          }));
        });
        for (const v of r) all.push({ page: name, tag, ...v });
        const counted = r.filter((v) => LEVELS.indexOf(v.impact) >= minImpact);
        t.check(!counted.length, `${tag}/${name}: 无 axe 违规${counted.length ? `（${counted.map((v) => `${v.impact} ${v.id} ×${v.nodes.length}`).join('；')}）` : ''}`);
        await t.shot(page, `${tag}-${name}`);
      };
      await sleep(300);
      await audit('onboarding');
      await page.keyboard.press('Escape');
      await audit('home');
      await click(T.degrees, '.card');
      await sleep(200);
      await click(T.start);
      await page.waitForSelector('.choice');
      await sleep(300);
      await audit('practice-question');
      for (const c of await page.$$('.choice')) {
        if (await page.$('.feedback')) break;
        await c.click();
        await sleep(40);
      }
      await page.waitForSelector('.feedback');
      await audit('practice-answered');
      await click(T.back);
      await sleep(200);
      // 新练习：和弦转位、音阶与调式（出题与答完各审计一次）
      for (const [id, title] of [
        ['inversions', T.inversions],
        ['scales', T.scales],
      ]) {
        await click(title, '.card');
        await sleep(200);
        await click(T.start);
        await page.waitForSelector('.choice');
        await audit(`${id}-question`);
        await answerQuestion(page, false);
        await audit(`${id}-answered`);
        await click(T.back);
        await sleep(200);
      }
      // 复音程：预置「只练复音程」后重新加载
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('earforge:v1'));
        s.exercises.intervals = { level: 11, custom: ['m9', 'M10', 'P11', 'P12', 'M13', 'm14', 'P15'], items: {}, options: { dir: 'harm' } };
        localStorage.setItem('earforge:v1', JSON.stringify(s));
      });
      await page.reload({ waitUntil: 'networkidle0' });
      await click(T.intervals, '.card');
      await sleep(200);
      await click(T.start);
      await page.waitForSelector('.choice');
      await audit('compound-question');
      await answerQuestion(page, true);
      await audit('compound-answered');
      await click(T.back);
      await sleep(200);
      await page.click('button.primary.big');
      await page.waitForSelector('.choice', { timeout: 8000 }).catch(() => {});
      await audit('mix');
      await click(T.back);
      await sleep(200);
      await click(T.stats);
      await audit('stats');
      await click(T.back);
      await click(T.settings);
      await audit('settings');
      await click(T.back);
      await click(T.lib, '.card');
      await audit('songs');
      await (await page.$('.song-card')).click();
      await audit('song-practice');
      await ctx.close();
    }

  writeFileSync(join(t.out, 'axe.json'), JSON.stringify(all, null, 1));
  const byImpact = {};
  const byRule = {};
  for (const v of all) {
    byImpact[v.impact] = (byImpact[v.impact] ?? 0) + v.nodes.length;
    const k = `${v.impact} ${v.id}`;
    byRule[k] ??= { nodes: 0, pages: new Set() };
    byRule[k].nodes += v.nodes.length;
    byRule[k].pages.add(`${v.tag}/${v.page}`);
  }
  const lines = [`violations (rule×screen entries): ${all.length}; nodes by impact: ${JSON.stringify(byImpact)}`];
  for (const [k, v] of Object.entries(byRule)) lines.push(`${k}  nodes ${v.nodes}  screens ${v.pages.size}`);
  writeFileSync(join(t.out, 'summary.txt'), lines.join('\n') + '\n');
  t.log(lines.join('\n'));
});
