// 节奏旋律听写（记谱输入）的 e2e 工具：读出本题答案、把答案转成输入操作、用键盘或点击执行。

/** 从 React fiber 读出本题的正确答案（仅测试用） */
export const readSpec = (page) =>
  page
    .$eval('.notate', (el) => {
      const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
      let f = el[k];
      while (f && !f.memoizedProps?.question?.notate) f = f.return;
      return f.memoizedProps.question.notate;
    })
    .then((spec) => ({ ...spec, scaleOf: SCALES[spec.mode] }));

/** 读出编辑器当前状态（调试用） */
export const readEditor = (page) =>
  page.$eval('.notate', (el) => {
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    let f = el[k];
    while (f && !f.memoizedProps?.question?.notate) f = f.return;
    return f.memoizedState.memoizedState;
  });

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

const DUR = [
  [48, 'w', false],
  [36, 'h', true],
  [24, 'h', false],
  [18, 'q', true],
  [12, 'q', false],
  [9, 'e', true],
  [6, 'e', false],
  [3, 's', false],
];
const BASE_OF = { w: 48, h: 24, q: 12, e: 6, s: 3 };

/** 把答案转成操作序列：['dur', key, dot] / ['pitch', k, octave, acc] / ['rest'] / ['tie'] */
export function plan(spec) {
  const ops = [];
  for (const n of spec.notes) {
    let left = n.dur;
    let first = true;
    while (left > 0) {
      const [d, key, dot] = DUR.find(([x]) => x <= left);
      ops.push(['dur', key, dot]);
      if (!first) ops.push(['tie']);
      else if (n.rel === null) ops.push(['rest']);
      else {
        const pc = ((n.rel % 12) + 12) % 12;
        const oct = Math.floor(n.rel / 12);
        let k = spec.scaleOf.indexOf(pc);
        let acc = 0;
        if (k < 0) {
          k = spec.scaleOf.indexOf(pc - 1);
          acc = 1;
          if (k < 0) {
            k = spec.scaleOf.indexOf(pc + 1);
            acc = -1;
          }
        }
        ops.push(['pitch', k, oct, acc]);
      }
      first = false;
      left -= d;
    }
  }
  return ops;
}

export const newCursor = () => ({ base: 12, dot: false, oct: 0 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 执行操作：input = 'kbd'（键盘快捷键）或 'click'（点工具栏按钮） */
export async function enter(page, ops, cur, input = 'kbd') {
  const btn = async (sel, i) => (await page.$$(sel))[i].click();
  for (const op of ops) {
    if (op[0] === 'dur') {
      const [, key, dot] = op;
      const b = BASE_OF[key];
      if (b !== cur.base) {
        if (input === 'kbd') await page.keyboard.press(key);
        else {
          // 点击后确认选中（无头浏览器偶尔丢一次点击，重试）
          const i = [48, 24, 12, 6, 3].indexOf(b);
          for (let tries = 0; tries < 5; tries++) {
            await (await page.$$('.notate-durs .notate-btn'))[i].click({ delay: 10 });
            await sleep(30);
            if (await page.$eval(`.notate-durs .notate-btn:nth-child(${i + 1})`, (e) => e.classList.contains('on'))) break;
          }
        }
        cur.base = b;
        cur.dot = false;
      }
      if (dot !== cur.dot) {
        if (input === 'kbd') await page.keyboard.press('.');
        else await btn('.notate-durs .notate-btn', 5);
        cur.dot = dot;
      }
    } else if (op[0] === 'tie') {
      if (input === 'kbd') await page.keyboard.press('t');
      else await btn('.notate-durs .notate-btn', 6);
    } else if (op[0] === 'rest') {
      if (input === 'kbd') await page.keyboard.press('0');
      else await btn('.notate-durs .notate-btn', 7);
    } else {
      const [, k, oct, acc] = op;
      while (cur.oct !== oct) {
        const up = oct > cur.oct;
        if (input === 'kbd') await page.keyboard.press(up ? 'ArrowUp' : 'ArrowDown');
        else await btn('.notate-oct .notate-btn', up ? 1 : 0);
        cur.oct += up ? 1 : -1;
      }
      if (acc) {
        if (input === 'kbd') await page.keyboard.press(acc > 0 ? '=' : '-');
        else await btn('.notate-acc .notate-btn', acc > 0 ? 0 : 1);
      }
      if (input === 'kbd') await page.keyboard.press(String(k + 1));
      else await btn('.notate-pitches .notate-btn', k);
    }
    await sleep(input === 'click' ? 40 : 15);
  }
}

/** 把整题正确答案写进去 */
export async function enterAnswer(page, input = 'kbd') {
  const spec = await readSpec(page);
  await enter(page, plan(spec), newCursor(), input);
  return spec;
}
