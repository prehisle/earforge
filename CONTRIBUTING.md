# 参与贡献 · Contributing to EarForge 耳锻

中文在前，[English below](#english)。

---

## 中文

感谢你愿意帮忙！耳锻是一个纯前端、离线可用的练耳应用：Vite + React + TypeScript，没有后端，数据存在浏览器本地。

### 1. 环境与常用命令

需要 Node.js 22 及以上（CI 用 24）。

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173
npm test             # 单元测试（vitest）
npm run lint         # oxlint
npm run typecheck    # tsc -b
npm run build        # 类型检查 + 生产构建，输出 dist/
npm run check        # 提交前一键检查：lint（警告也算失败）+ 单元测试 + 构建
npm run e2e          # 浏览器端到端测试（见第 5 节）
```

部署到子路径（如 GitHub Pages 项目页 `https://<user>.github.io/earforge/`）时用 `BASE_PATH=/earforge/ npm run build`；
默认是 `/`。manifest、service worker 与预缓存清单都按相对路径生成，子路径下也能离线使用。

### 2. 架构概览

```
src/
  music/        乐理与记谱（纯函数）
    theory.ts       音程、和弦、调式、唱名体系、终止式
    notation.ts     MIDI 音高 → 字母 + 升降号、调号、谱位、谱号
    rhythmLayout.ts 带时值记谱的排版：切小节、连音线、符杠分组、换行
  audio/        声音
    engine.ts       播放调度（NoteEvent）、总线、随机音色与采样乐器的加载
    timbres.ts      各合成音色的描述数据与发声构建函数（钢琴、风琴、吉他、弦乐、长笛、马林巴……）
    sampler.ts      可选的采样乐器（钢琴、木吉他、小提琴、长笛；按需下载、离线缓存）
    pitch.ts        YIN 音高检测 + 麦克风监听
    midi.ts         Web MIDI 输入
  engine/       学习逻辑（纯函数为主，有单元测试）
    types.ts        ExerciseDef / Question / Level / Settings 等核心类型
    progress.ts     掌握度、自适应抽题、自动升级、localStorage 存储
    planner.ts      今日训练（跨模块间隔重复）与薄弱点专练
    exam.ts         模拟考试：试卷、出题、计分、答题流程 reducer
    trends.ts / onboarding.ts / examHistory.ts
  exercises/    各练习模块，每个导出一个 ExerciseDef；index.ts 注册
  songs/        视唱曲库：library.ts 曲目数据、format.ts 简谱式记法、realize.ts 移调落位、scoring.ts 跟唱评分
  i18n/         界面语言：zh.ts 为准，en.ts 必须有完全相同的键（类型 + 测试保证）
  ui/           React 界面：Practice（出题作答）、Mixed（今日训练）、Exam、SongLibrary / SongPractice、
                Staff / MeasuredStaff（手绘 SVG 五线谱）、NotatePanel（记谱作答）、Stats、Settings、Onboarding
public/sw.js    service worker：构建时由 vite.config.ts 写入预缓存清单
e2e/            浏览器端到端测试（puppeteer-core）
```

数据流：练习模块的 `generate(item, ctx)` 产出一道 `Question`（要播放的 `events`、选项 `choices`、答案 `answer`、
可选的五线谱 `score` / 唱歌 `sing` / 打节奏 `tap` / 记谱 `notate`）；`engine/progress` 决定出哪个考点（item）、记录对错；
UI 只负责播放、收集作答与显示。乐理、出题、评分尽量写成纯函数，方便单元测试。

### 3. 新增一个练习

1. 在 `src/exercises/` 新建 `myExercise.ts`，导出一个 `ExerciseDef`（参考 `intervals.ts`，结构最简单）：
   - `id`：唯一、稳定（存进用户数据，发布后不要改）；`icon`；`group`：`basics` / `tonal` / `sing`。
   - `title` / `subtitle` 用 getter 返回 `t('ex.myExercise.title')`，这样切换语言即时生效。
   - `levels`：级别数组，每级是新加入的考点 id（`common.ts` 的 `level()` / `levelT()`）；掌握后自动解锁下一级。
   - `options`（可选）：用 `common.ts` 的 `option()` 定义；`levelsFor(options)` 可按选项生成不同级别（如按调式）。
   - `itemLabel(item, settings)`：考点显示名；`generate(item, ctx)`：出一道题。
   - 需要麦克风设 `mic: true`；需要手动输入（不进今日训练）设 `manual: true`；单题耗时长设 `heavy: true`。
2. 在 `src/exercises/index.ts` 的 `EXERCISES` 里注册。
3. 在 `src/i18n/zh.ts` 和 `src/i18n/en.ts` 加上同样的键（`ex.myExercise.*`）；缺键会让 `tsc` 和 i18n 测试失败。
4. 在 `src/__tests__/` 加单元测试：每个考点都能出题、答案在选项里、音高在合理音域。
5. 如果有新的交互，补一个 e2e 场景（第 5 节），至少确保 `npm run e2e -- smoke i18n-en a11y-axe` 通过。

### 4. 新增一首视唱曲目

曲目都在 `src/songs/library.ts`，旋律用简谱式文本记写（与调无关，首调；记法见 `src/songs/format.ts` 顶部注释）：

```ts
{
  id: 'hot-cross-buns',           // 唯一、稳定
  kind: 'song',                   // 'drill' 原创练习 / 'song' 公有领域歌曲
  title: { zh: '热十字面包', en: 'Hot Cross Buns' },
  source: TRAD('英国', 'English'), // 出处（中英文）
  meter: [4, 4], mode: 'major', level: 1, bpm: 92,
  melody: '3 2 1 - | 3 2 1 - | 1_ 1_ 1_ 1_ 2_ 2_ 2_ 2_ | 3 2 1 - |',
}
```

**版权政策（必读）**：只收录
- 耳锻原创的练习（`kind: 'drill'`，出处写 `ORIGINAL`），或
- **公有领域**旋律：传统民歌，或作者去世超过 70 年、且旋律本身已进入公有领域的作品。

不要收录仍受版权保护的歌曲（包括流行歌曲、影视/游戏配乐、近现代作品），也不要照抄受版权保护的**编配、改编或出版物里的记谱**——
请根据公有领域的原始旋律自己记写。PR 描述里写明来源与判断依据（作曲者与卒年 / 「传统」）。
每首都要逐音核对音程、节奏与小节时值；拿不准的宁可不收。`npm test` 会检查每小节时值、中英文标题与出处、任意调都能落位等。

### 5. 测试

- **单元测试**：`npm test`（`src/__tests__/*.test.ts`）。乐理、出题、评分、排版、i18n 键一致性都在这里。
- **端到端测试**：`npm run e2e` 会构建到 `e2e-output/dist`、在空闲端口启动 `vite preview`、
  用 puppeteer-core 驱动无头 Chrome 跑 `e2e/scenarios/` 下的全部场景（默认 2 个并行，对时间敏感的单独跑），最后打印汇总并关闭服务器。
  - 只跑某几个：`npm run e2e -- smoke exam`（名字不完整时按前缀匹配，如 `notate-` 匹配 `notate-advanced` 与 `notate-mix`）；`npm run e2e -- --list` 列出全部。
  - 子路径：`npm run e2e -- --base /earforge/`；测已经在跑的站点：`npm run e2e -- --url http://localhost:4173/`（`offline` 场景需要生产构建，开发服务器不注册 service worker）。
  - 截图与日志在 `e2e-output/<场景>/` 与 `e2e-output/<场景>.log`；`E2E_HEADFUL=1` 可显示浏览器。
  - Chrome：自动查找系统安装的 Chrome / Chromium；也可设置 `CHROME_PATH=/path/to/chrome`，
    或运行 `npm run e2e:browser` 下载 Chrome for Testing 到 `e2e/.cache/browsers`。
  - 写新场景：复制一个现有场景，用 `e2e/lib/harness.mjs` 的 `run(async (t) => …)`；
    `t.open({ lang, width, dark })` 打开页面（默认中文、跳过新手引导），`t.check(cond, '说明')` 断言，`t.shot(page, name)` 截图。
    页面上的 JS 错误与 `console.error` 会自动算作失败。需要读答案时：练习页的选项题用 harness 的 `readQuestion(page)` /
    `answerQuestion(page, correct)`，考试用 `__EARFORGE_TEST__` 钩子（见 `src/ui/Exam.tsx`），记谱题用 `e2e/lib/notate.mjs`。

### 6. 提交信息

用 [Conventional Commits](https://www.conventionalcommits.org/) 前缀，描述用中文或英文都可以，范围写模块名：

```
feat(音程): 新增复音程（九度、十度）
fix(今日训练): 节奏旋律听写等耗时长的模块限额
perf: 非首屏页面按需加载
a11y: 分段按钮加 aria-pressed
test(e2e): 模拟考试限时用例
docs: 补充曲库版权政策
chore / refactor / style / ci
```

一个提交只做一件事；行为变化附上测试。PR 请描述动机、改动与验证方式（模板会提示）。

---

## English

Thanks for helping! EarForge is a client-only, offline-capable ear-training app (Vite + React + TypeScript). There is no backend; data stays in the browser.

### 1. Setup

Node.js 22+ (CI uses 24).

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm test             # unit tests (vitest)
npm run lint         # oxlint
npm run typecheck    # tsc -b
npm run build        # typecheck + production build into dist/
npm run check        # pre-commit check: lint (warnings fail) + unit tests + build
npm run e2e          # browser end-to-end suite (section 5)
```

To deploy under a subpath (e.g. a GitHub Pages project site `https://<user>.github.io/earforge/`), build with
`BASE_PATH=/earforge/ npm run build`. The default is `/`. The manifest, service worker and precache list use relative paths, so offline mode works under a subpath too.

### 2. Architecture

- `src/music/`: theory (intervals, chords, modes, solfège), notation spelling (`notation.ts`) and measured-rhythm layout (`rhythmLayout.ts`). These are pure functions.
- `src/audio/`: Web Audio scheduler (`engine.ts`), synthesized instrument timbres (`timbres.ts`), optional sampled instruments (`sampler.ts`), YIN pitch detection (`pitch.ts`) and Web MIDI (`midi.ts`).
- `src/engine/`: core types (`types.ts`), mastery tracking, adaptive item selection and storage (`progress.ts`), daily training and weak-spot drills (`planner.ts`), and mock exams (`exam.ts`).
- `src/exercises/`: one `ExerciseDef` per module, registered in `index.ts`.
- `src/songs/`: the sight-singing library (`library.ts`), its jianpu-like melody format (`format.ts`), transposition (`realize.ts`) and sing-along scoring (`scoring.ts`).
- `src/i18n/`: `zh.ts` is the source of truth. `en.ts` must have exactly the same keys, which the types and tests enforce.
- `src/ui/`: React screens, including `Practice`, `Mixed` (daily training), `Exam`, the song library and practice screens, `Staff`/`MeasuredStaff` (hand-drawn SVG staff), `NotatePanel` (notation input), `Stats`, `Settings` and `Onboarding`.
- `public/sw.js` is the service worker. `vite.config.ts` injects the precache list at build time.
- `e2e/` holds the browser tests (puppeteer-core).

An exercise's `generate(item, ctx)` returns a `Question`: the `events` to play, `choices`, the `answer`, plus optional `score` / `sing` / `tap` / `notate` payloads. `engine/progress` picks the item and records results. The UI plays the audio, collects answers and renders. Keep theory, generation and grading pure so they can be unit-tested.

### 3. Adding an exercise

1. Create `src/exercises/myExercise.ts` exporting an `ExerciseDef`. `intervals.ts` is the simplest example. Use a stable `id`, because it is stored in user data. `title`/`subtitle` are getters that call `t()`. `levels` are built with `level()`/`levelT()`, and `options` with `option()` from `common.ts`. Also define `itemLabel` and `generate`. Set `mic`, `manual` or `heavy` when they apply.
2. Register the exercise in `src/exercises/index.ts`.
3. Add the same `ex.myExercise.*` keys to both `zh.ts` and `en.ts`.
4. Add unit tests in `src/__tests__/`.
5. For new interactions, add an e2e scenario. At minimum, keep `npm run e2e -- smoke i18n-en a11y-axe` green.

### 4. Adding a song

Songs live in `src/songs/library.ts` as key-independent jianpu-like text. The syntax is documented at the top of `src/songs/format.ts`.

**Public-domain policy:** we only accept
- EarForge-original drills (`kind: 'drill'`), or
- **public-domain** melodies: traditional tunes, or works whose composer died more than 70 years ago and whose melody is in the public domain.

Do not add copyrighted songs (pop, film or game music, recent works). Do not copy notation from copyrighted arrangements or editions either; transcribe the public-domain melody yourself. In the PR, state the source and why the melody is in the public domain (composer and year of death, or "traditional"). Verify every interval, rhythm and bar length; when in doubt, leave the song out. `npm test` checks bar lengths, bilingual titles and sources, and that every song can be placed in any key.

### 5. Tests

- Unit tests: `npm test`.
- End-to-end tests: `npm run e2e` builds into `e2e-output/dist`, serves it with `vite preview` on a free port, and runs every scenario in `e2e/scenarios/` with headless Chrome. It runs two scenarios at a time; timing-sensitive ones run alone. It then prints a summary and shuts the server down.
  - Run a subset with `npm run e2e -- smoke exam` (an incomplete name matches by prefix, e.g. `notate-`). List all scenarios with `npm run e2e -- --list`.
  - Test a subpath build with `npm run e2e -- --base /earforge/`, or a server that is already running with `npm run e2e -- --url http://localhost:4173/`. The `offline` scenario needs a production build, because the dev server does not register the service worker.
  - Screenshots and logs go to `e2e-output/`. Set `E2E_HEADFUL=1` to watch the browser.
  - The runner finds Chrome automatically. You can also set `CHROME_PATH`, or run `npm run e2e:browser` to download Chrome for Testing.
  - To write a scenario, use `run(async (t) => …)` from `e2e/lib/harness.mjs` with `t.open()`, `t.check()` and `t.shot()`. Page errors and `console.error` count as failures. To answer a practice question deterministically, use `readQuestion(page)` / `answerQuestion(page, correct)` from the harness.

### 6. Commit messages

Use Conventional Commits prefixes (`feat`, `fix`, `perf`, `a11y`, `test`, `docs`, `refactor`, `chore`, `ci`). Put the module in the scope, e.g. `feat(intervals): compound intervals`. Descriptions may be in Chinese or English. Keep one change per commit, and include tests for behaviour changes.
