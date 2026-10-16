// 视唱曲库：耳锻原创的分级练习 + 公有领域旋律（传统民歌，或作者去世超过 70 年的作品）。
// 旋律记法见 format.ts。所有旋律均按首调记写，演唱时可移到任意调与歌者音区。
// 公有领域旋律逐音核对过音程、节奏与小节时值；记不准的曲目宁缺毋滥（见提交说明）。

import type { Locale } from '../i18n';

export type SongTag =
  | 'step' // 级进为主
  | 'leap' // 含四度及以上跳进
  | 'dotted' // 附点
  | 'sixteenth' // 十六分音符
  | 'pickup' // 弱起
  | 'tie' // 跨小节延长（连音）
  | 'rest' // 休止符
  | 'minor' // 小调
  | 'compound' // 复拍子（6/8）
  | 'chromatic' // 变化音
  | 'pentatonic'; // 五声调式

export interface SongDef {
  id: string;
  /** drill：原创分级练习；song：公有领域歌曲 */
  kind: 'drill' | 'song';
  title: Record<Locale, string>;
  source: Record<Locale, string>;
  meter: [number, number];
  /** 弱起小节长度（四分音符），缺省没有弱起 */
  pickup?: number;
  /** 调式：小调按 la 作主音书写 */
  mode: 'major' | 'minor';
  level: 1 | 2 | 3 | 4 | 5;
  /** 默认速度（每分钟拍数；6/8 以附点四分为一拍） */
  bpm: number;
  /** 无法从旋律自动判断的标签（如五声调式） */
  tags?: SongTag[];
  melody: string;
}

const ORIGINAL = { zh: '耳锻原创练习', en: 'EarForge original' };
const TRAD = (zh: string, en: string) => ({ zh: `${zh}传统民歌`, en: `Traditional ${en}` });

function drill(
  id: string,
  level: SongDef['level'],
  zh: string,
  en: string,
  meter: [number, number],
  bpm: number,
  melody: string,
  extra: Partial<SongDef> = {},
): SongDef {
  return { id, kind: 'drill', title: { zh, en }, source: ORIGINAL, meter, mode: 'major', level, bpm, melody, ...extra };
}

export const SONGS: SongDef[] = [
  // ───────────── 第 1 级：级进与主三和弦，四分、二分音符 ─────────────
  drill('d1-1', 1, '练习 1·1 · do re mi', 'Drill 1.1 · Do re mi', [4, 4], 80, '1 2 3 - | 3 2 1 - | 1 2 3 2 | 1 - - - |'),
  drill('d1-2', 1, '练习 1·2 · 上行到 sol', 'Drill 1.2 · Up to sol', [4, 4], 80, '1 2 3 4 | 5 - - - | 5 4 3 2 | 1 - - - |'),
  drill(
    'd1-3',
    1,
    '练习 1·3 · 三拍子级进',
    'Drill 1.3 · Steps in 3/4',
    [3, 4],
    88,
    '1 2 3 | 2 - - | 3 4 5 | 3 - - | 5 4 3 | 2 3 4 | 3 2 2 | 1 - - |',
  ),
  drill(
    'd1-4',
    1,
    '练习 1·4 · 主三和弦',
    'Drill 1.4 · Tonic triad',
    [4, 4],
    80,
    '1 - 3 - | 5 - 3 - | 4 3 2 - | 1 - - - | 3 - 5 - | 4 3 2 1 | 2 - 3 2 | 1 - - - |',
  ),
  drill('d1-5', 1, '练习 1·5 · 二拍子', 'Drill 1.5 · Two beats', [2, 4], 84, '1 2 | 3 3 | 2 1 | 2 - | 3 4 | 5 5 | 4 2 | 1 - |'),
  {
    id: 'hot-cross-buns',
    kind: 'song',
    title: { zh: '热十字面包', en: 'Hot Cross Buns' },
    source: TRAD('英国', 'English'),
    meter: [4, 4],
    mode: 'major',
    level: 1,
    bpm: 92,
    melody: '3 2 1 - | 3 2 1 - | 1_ 1_ 1_ 1_ 2_ 2_ 2_ 2_ | 3 2 1 - |',
  },
  {
    id: 'mary-lamb',
    kind: 'song',
    title: { zh: '玛丽有只小羊羔', en: 'Mary Had a Little Lamb' },
    source: TRAD('美国', 'American'),
    meter: [4, 4],
    mode: 'major',
    level: 1,
    bpm: 96,
    melody: '3 2 1 2 | 3 3 3 - | 2 2 2 - | 3 5 5 - | 3 2 1 2 | 3 3 3 3 | 2 2 3 2 | 1 - - - |',
  },
  {
    id: 'twinkle',
    kind: 'song',
    title: { zh: '小星星', en: 'Twinkle, Twinkle, Little Star' },
    source: TRAD('法国', 'French'),
    meter: [4, 4],
    mode: 'major',
    level: 1,
    bpm: 92,
    melody:
      '1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - | 5 5 4 4 | 3 3 2 - | 5 5 4 4 | 3 3 2 - | 1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - |',
  },
  {
    id: 'au-clair',
    kind: 'song',
    title: { zh: '在月光下', en: 'Au clair de la lune' },
    source: TRAD('法国', 'French'),
    meter: [4, 4],
    mode: 'major',
    level: 1,
    bpm: 92,
    melody:
      '1 1 1 2 | 3 - 2 - | 1 3 2 2 | 1 - - - | 1 1 1 2 | 3 - 2 - | 1 3 2 2 | 1 - - - | 2 2 2 2 | 6, - 6, - | 2 1 7, 6, | 5, - - - | 1 1 1 2 | 3 - 2 - | 1 3 2 2 | 1 - - - |',
  },
  {
    id: 'lightly-row',
    kind: 'song',
    title: { zh: '小汉斯', en: 'Lightly Row (Hänschen klein)' },
    source: TRAD('德国', 'German'),
    meter: [4, 4],
    mode: 'major',
    level: 1,
    bpm: 100,
    melody:
      '5 3 3 - | 4 2 2 - | 1 2 3 4 | 5 5 5 - | 5 3 3 - | 4 2 2 - | 1 3 5 5 | 3 - - - | 2 2 2 2 | 2 3 4 - | 3 3 3 3 | 3 4 5 - | 5 3 3 - | 4 2 2 - | 1 3 5 5 | 1 - - - |',
  },

  // ───────────── 第 2 级：八分音符、附点四分、低音 sol、四五度跳进、休止 ─────────────
  drill(
    'd2-1',
    2,
    '练习 2·1 · 八分音符',
    'Drill 2.1 · Eighth notes',
    [4, 4],
    80,
    '1 2_ 3_ 4 3 | 2 3_ 4_ 5 - | 5 4_ 3_ 2 3 | 1 - - 0 |',
  ),
  drill(
    'd2-2',
    2,
    '练习 2·2 · 低音 sol 与 ti',
    'Drill 2.2 · Low sol and ti',
    [3, 4],
    88,
    '5, 1 2 | 3 - 1 | 2 1 7, | 1 - 5, | 6, 7, 1 | 2 - 5, | 1 7, 2 | 1 - - |',
  ),
  drill(
    'd2-3',
    2,
    '练习 2·3 · 四度与五度',
    'Drill 2.3 · Fourths and fifths',
    [4, 4],
    76,
    '1 - 5 - | 4 3 2 - | 5, - 1 - | 2 3 1 - | 1 4 3 2 | 5 - 1 - | 2 5, 3 2 | 1 - - - |',
  ),
  drill(
    'd2-4',
    2,
    '练习 2·4 · 附点四分音符',
    'Drill 2.4 · Dotted quarters',
    [4, 4],
    76,
    '1. 2_ 3 1 | 3. 4_ 5 - | 5. 4_ 3 1 | 2. 1_ 2 - | 1. 2_ 3 5 | 4. 3_ 2 - | 3. 2_ 1 7, | 1 - - - |',
  ),
  drill('d2-5', 2, '练习 2·5 · 休止符', 'Drill 2.5 · Rests', [2, 4], 80, '1 3 | 5 0 | 4 2 | 7, 0 | 1 3 | 6 5 | 4 2_ 7,_ | 1 0 |'),
  drill(
    'd2-6',
    2,
    '练习 2·6 · 五声宫调式',
    'Drill 2.6 · Pentatonic (gong mode)',
    [2, 4],
    76,
    '1 2 | 3 5 | 6 5_ 3_ | 2 - | 3 5 | 6 1\' | 6_ 5_ 3_ 2_ | 1 - |',
    { tags: ['pentatonic'] },
  ),
  {
    id: 'frere-jacques',
    kind: 'song',
    title: { zh: '两只老虎', en: 'Frère Jacques' },
    source: TRAD('法国', 'French'),
    meter: [4, 4],
    mode: 'major',
    level: 2,
    bpm: 100,
    melody: '1 2 3 1 | 1 2 3 1 | 3 4 5 - | 3 4 5 - | 5_ 6_ 5_ 4_ 3 1 | 5_ 6_ 5_ 4_ 3 1 | 1 5, 1 - | 1 5, 1 - |',
  },
  {
    id: 'ode-to-joy',
    kind: 'song',
    title: { zh: '欢乐颂', en: 'Ode to Joy' },
    source: { zh: '贝多芬（第九交响曲，简化版）', en: 'L. van Beethoven (Symphony No. 9, simplified)' },
    meter: [4, 4],
    mode: 'major',
    level: 2,
    bpm: 100,
    melody:
      '3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3. 2_ 2 - | 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2. 1_ 1 - | 2 2 3 1 | 2 3_ 4_ 3 1 | 2 3_ 4_ 3 2 | 1 2 5, - | 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2. 1_ 1 - |',
  },
  {
    id: 'london-bridge',
    kind: 'song',
    title: { zh: '伦敦桥', en: 'London Bridge Is Falling Down' },
    source: TRAD('英国', 'English'),
    meter: [4, 4],
    mode: 'major',
    level: 2,
    bpm: 100,
    melody: '5. 6_ 5 4 | 3 4 5 - | 2 3 4 - | 3 4 5 - | 5. 6_ 5 4 | 3 4 5 - | 2 - 5 - | 3 1 - - |',
  },
  {
    id: 'yankee-doodle',
    kind: 'song',
    title: { zh: '扬基歌', en: 'Yankee Doodle' },
    source: TRAD('美国', 'American'),
    meter: [4, 4],
    mode: 'major',
    level: 2,
    bpm: 108,
    melody: '1 1 2 3 | 1 3 2 5, | 1 1 2 3 | 1 - 7, - | 1 1 2 3 | 4 3 2 1 | 7, 5, 6, 7, | 1 - 1 - |',
  },
  {
    id: 'old-macdonald',
    kind: 'song',
    title: { zh: '老麦克唐纳有个农场', en: 'Old MacDonald Had a Farm' },
    source: TRAD('美国', 'American'),
    meter: [4, 4],
    mode: 'major',
    level: 2,
    bpm: 108,
    melody: '1 1 1 5, | 6, 6, 5, - | 3 3 2 2 | 1 - - 5, | 1 1 1 5, | 6, 6, 5, - | 3 3 2 2 | 1 - - - |',
  },
  {
    id: 'michael-row',
    kind: 'song',
    title: { zh: '迈克尔划船靠岸', en: 'Michael, Row the Boat Ashore' },
    source: { zh: '美国传统黑人灵歌', en: 'Traditional African-American spiritual' },
    meter: [4, 4],
    mode: 'major',
    level: 2,
    bpm: 92,
    melody: '1 3 5. 3_ | 5 6 5 - | 3 5 6 - | 5 - - - | 3 5 5. 3_ | 4 3 2 - | 1 2 3. 2_ | 1 - - - |',
  },
  {
    id: 'jingle-bells',
    kind: 'song',
    title: { zh: '铃儿响叮当（副歌）', en: 'Jingle Bells (chorus)' },
    source: { zh: 'J. L. 皮尔庞特', en: 'J. L. Pierpont' },
    meter: [4, 4],
    mode: 'major',
    level: 2,
    bpm: 112,
    melody:
      '3 3 3 - | 3 3 3 - | 3 5 1. 2_ | 3 - - - | 4 4 4. 4_ | 4 3 3 3_ 3_ | 3 2 2 3 | 2 - 5 - | 3 3 3 - | 3 3 3 - | 3 5 1. 2_ | 3 - - - | 4 4 4 4 | 4 3 3 3_ 3_ | 5 5 4 2 | 1 - - - |',
  },

  // ───────────── 第 3 级：弱起、六度、连音、小调入门、6/8 ─────────────
  drill(
    'd3-1',
    3,
    '练习 3·1 · 弱起与分解和弦',
    'Drill 3.1 · Pickup and arpeggios',
    [4, 4],
    84,
    "5, | 1 3 5 3 | 4 2 7, 5, | 1 3 6 5 | 4 3 2 5, | 1 3 5 1' | 6 4 2 7, | 1 - - |",
    { pickup: 1 },
  ),
  drill(
    'd3-2',
    3,
    '练习 3·2 · 6/8 拍',
    'Drill 3.2 · Six-eight time',
    [6, 8],
    60,
    '1 2_ 3 1_ | 5. 3. | 4 3_ 2 1_ | 2. 5,. | 1 2_ 3 4_ | 5 4_ 3 2_ | 1 7,_ 2 7,_ | 1. -. |',
  ),
  drill(
    'd3-3',
    3,
    '练习 3·3 · 自然小调',
    'Drill 3.3 · Natural minor',
    [4, 4],
    80,
    '6, 7, 1 2 | 3 - 1 - | 2 1 7, 6, | 7, - 5, - | 6, 1 3 2 | 1 7, 6, 3, | 6, 7, 1 7, | 6, - - - |',
    { mode: 'minor' },
  ),
  drill(
    'd3-4',
    3,
    '练习 3·4 · 六度跳进',
    'Drill 3.4 · Leaps of a sixth',
    [3, 4],
    84,
    '1 6 5 | 3 - - | 5, 3 2 | 1 - - | 2 7 6 | 5 - 4 | 3 1 2 | 1 - - |',
  ),
  drill(
    'd3-5',
    3,
    '练习 3·5 · 连音与切分',
    'Drill 3.5 · Ties across the bar',
    [4, 4],
    84,
    '1 3 5 - | - 4 3 2 | 3 - - 1 | 2 - - - | 5 3 1 - | - 2 3 4 | 3 2_ 1_ 2 7, | 1 - - - |',
  ),
  drill(
    'd3-6',
    3,
    '练习 3·6 · 五声羽调式',
    'Drill 3.6 · Pentatonic (yu mode)',
    [2, 4],
    72,
    '6, 1 | 2 3 | 5 3_ 2_ | 1 - | 2 3_ 5_ | 3 2_ 1_ | 2 1_ 6,_ | 6, - |',
    { mode: 'minor', tags: ['pentatonic'] },
  ),
  {
    id: 'row-your-boat',
    kind: 'song',
    title: { zh: '划船歌', en: 'Row, Row, Row Your Boat' },
    source: TRAD('英国', 'English'),
    meter: [6, 8],
    mode: 'major',
    level: 3,
    bpm: 58,
    melody: "1. 1. | 1 2_ 3. | 3 2_ 3 4_ | 5. -. | 1'_ 1'_ 1'_ 5_ 5_ 5_ | 3_ 3_ 3_ 1_ 1_ 1_ | 5 4_ 3 2_ | 1. -. |",
  },
  {
    id: 'oh-susanna',
    kind: 'song',
    title: { zh: '哦！苏珊娜（主歌）', en: 'Oh! Susanna (verse)' },
    source: { zh: 'S. 福斯特', en: 'Stephen Foster' },
    meter: [4, 4],
    pickup: 1,
    mode: 'major',
    level: 3,
    bpm: 92,
    melody: '1_ 2_ | 3 5 5. 6_ | 5 3 1. 2_ | 3 3 2 1 | 2 - - 1_ 2_ | 3 5 5. 6_ | 5 3 1. 2_ | 3 3 2 2 | 1 - - |',
  },
  {
    id: 'my-bonnie',
    kind: 'song',
    title: { zh: '我的邦妮', en: 'My Bonnie Lies over the Ocean' },
    source: TRAD('苏格兰', 'Scottish'),
    meter: [3, 4],
    pickup: 1,
    mode: 'major',
    level: 3,
    bpm: 112,
    melody:
      '5, | 3 2 1 | 2 1 6, | 5, 3, - | - - 5, | 3 2 1 | 1 7, 1 | 2 - - | - - 5, | 3 2 1 | 2 1 6, | 5, 3, - | - - 5, | 6, 2 1 | 7, 6, 7, | 1 - - | - - |',
  },
  {
    id: 'sakura',
    kind: 'song',
    title: { zh: '樱花', en: 'Sakura, Sakura' },
    source: TRAD('日本', 'Japanese'),
    meter: [4, 4],
    mode: 'minor',
    level: 3,
    bpm: 72,
    melody:
      "6 6 7 - | 6 6 7 - | 6 7 1' 7 | 6 7_ 6_ 4 - | 3 1 3 4 | 3 3_ 1_ 7, - | 6 7 1' 7 | 6 7_ 6_ 4 - | 3 1 3 4 | 3 3_ 1_ 7, - | 6 6 7 - | 6 6 7 - | 3 4 7_ 6_ 4 | 3 - - - |",
  },
  {
    id: 'songbie',
    kind: 'song',
    title: { zh: '送别', en: 'Farewell (Dreaming of Home and Mother)' },
    source: { zh: 'J. P. 奥德威曲（李叔同填词）', en: 'J. P. Ordway (Chinese lyrics by Li Shutong)' },
    meter: [4, 4],
    mode: 'major',
    level: 3,
    bpm: 72,
    melody:
      "5 3_ 5_ 1' - | 6 1' 5 - | 5 1_ 2_ 3 2_ 1_ | 2 - - - | 5 3_ 5_ 1'. 7_ | 6 1' 5 - | 5 2_ 3_ 4. 7,_ | 1 - - - | 6 1' 1' - | 7 6_ 7_ 1' - | 6_ 7_ 1'_ 6_ 6_ 5_ 3_ 1_ | 2 - - - | 5 3_ 5_ 1'. 7_ | 6 1' 5 - | 5 2_ 3_ 4. 7,_ | 1 - - - |",
  },

  // ───────────── 第 4 级：附点八分、和声小调、变化音 fi、宽音域 6/8 ─────────────
  drill(
    'd4-1',
    4,
    '练习 4·1 · 附点八分与十六分',
    'Drill 4.1 · Dotted eighth + sixteenth',
    [4, 4],
    72,
    "1._ 2__ 3 3._ 4__ 5 | 6._ 5__ 4._ 3__ 2 - | 3._ 4__ 5 1'._ 7__ 6 | 5._ 4__ 3._ 2__ 1 - |",
  ),
  drill(
    'd4-2',
    4,
    '练习 4·2 · 和声小调',
    'Drill 4.2 · Harmonic minor',
    [3, 4],
    80,
    '6, 7, 1 | 7, #5, - | 6, 1 3 | 2 - - | 3 2 1 | 7, 6, #5, | 6, 1 7, | 6, - - |',
    { mode: 'minor' },
  ),
  drill(
    'd4-3',
    4,
    '练习 4·3 · 变化音 fi',
    'Drill 4.3 · Raised fourth (fi)',
    [4, 4],
    80,
    '1 3 5 #4 | 5 - - - | 6 5 #4 5 | 3 - 2 - | 1 2 3 #4 | 5 6 5 #4 | 5 4 3 2 | 1 - - - |',
  ),
  drill(
    'd4-4',
    4,
    '练习 4·4 · 6/8 宽音域',
    'Drill 4.4 · Wide range in 6/8',
    [6, 8],
    56,
    "5, 1_ 3 5_ | 1'. 5. | 6 4_ 2 7,_ | 1. 5,. | 3 4_ 5 6_ | 1' 7_ 6 5_ | 4 2_ 7, 2_ | 1. -. |",
  ),
  drill(
    'd4-5',
    4,
    '练习 4·5 · 八度跳进',
    'Drill 4.5 · Octave leaps',
    [2, 4],
    72,
    "5,_ | 1 1' | 7_ 6_ 5_ 4_ | 3 5,_ 5,_ | 1 - | 6_ 5_ 4_ 3_ | 2 7,_ 5,_ | 1 0_ |",
    { pickup: 0.5 },
  ),
  drill(
    'd4-6',
    4,
    '练习 4·6 · 五声徵调式',
    'Drill 4.6 · Pentatonic (zhi mode)',
    [4, 4],
    72,
    '5, 6,_ 1_ 2 3_ 2_ | 1 6,_ 5,_ 6, - | 1 2_ 3_ 5. 6_ | 3 2_ 1_ 2 - | 3 5_ 6_ 5 3_ 2_ | 1 2_ 3_ 2 1_ 6,_ | 5,. 6,_ 1 2_ 1_ | 5, - - - |',
    { tags: ['pentatonic'] },
  ),
  {
    id: 'greensleeves',
    kind: 'song',
    title: { zh: '绿袖子', en: 'Greensleeves' },
    source: TRAD('英国', 'English'),
    meter: [3, 4],
    pickup: 1,
    mode: 'minor',
    level: 4,
    bpm: 100,
    melody:
      '6, | 1 - 2 | 3. 4_ 3 | 2 - 7, | 5,. 6,_ 7, | 1 - 6, | 6,. #5,_ 6, | 7, - #5, | 3, - 6, | 1 - 2 | 3. 4_ 3 | 2 - 7, | 5,. 6,_ 7, | 1. 7,_ 6, | #5,. #4,_ #5, | 6, - |',
  },
  {
    id: 'silent-night',
    kind: 'song',
    title: { zh: '平安夜', en: 'Silent Night' },
    source: { zh: 'F. X. 格鲁伯', en: 'Franz X. Gruber' },
    meter: [6, 8],
    mode: 'major',
    level: 4,
    bpm: 46,
    melody:
      "5. 6_ 5 | 3. -. | 5. 6_ 5 | 3. -. | 2' - 2' | 7. -. | 1' - 1' | 5. -. | 6 - 6 | 1'. 7_ 6 | 5. 6_ 5 | 3. -. | 6 - 6 | 1'. 7_ 6 | 5. 6_ 5 | 3. -. | 2' - 2' | 4'. 2'_ 7 | 1'. -. | 3'. -. | 1' 5 3 | 5. 4_ 2 | 1. -. |",
  },
  {
    id: 'minuet-g',
    kind: 'song',
    title: { zh: 'G 大调小步舞曲', en: 'Minuet in G' },
    source: {
      zh: 'C. 佩措尔德（曾归于 J. S. 巴赫，BWV Anh. 114）',
      en: 'C. Petzold (formerly attr. J. S. Bach, BWV Anh. 114)',
    },
    meter: [3, 4],
    mode: 'major',
    level: 4,
    bpm: 96,
    melody:
      "5 1_ 2_ 3_ 4_ | 5 1 1 | 6 4_ 5_ 6_ 7_ | 1' 1 1 | 4 5_ 4_ 3_ 2_ | 3 4_ 3_ 2_ 1_ | 7, 1_ 2_ 3_ 1_ | 2 - - | 5 1_ 2_ 3_ 4_ | 5 1 1 | 6 4_ 5_ 6_ 7_ | 1' 1 1 | 4 5_ 4_ 3_ 2_ | 3 4_ 3_ 2_ 1_ | 2 3_ 2_ 1_ 7,_ | 1 - - |",
  },

  // ───────────── 第 5 级：六七度大跳、十六分音符、小调、6/8、变化音 ─────────────
  drill(
    'd5-1',
    5,
    '练习 5·1 · 七度大跳',
    'Drill 5.1 · Leaps of a seventh',
    [4, 4],
    72,
    "1 7 1' - | 5 4 3 - | 2 1' 7 - | 6 5 - 0 | 5, 4 3 2 | 3 2_ 1_ 7, 5, | 1 6 5 4 | 1 - - - |",
  ),
  drill(
    'd5-2',
    5,
    '练习 5·2 · 十六分音符',
    'Drill 5.2 · Sixteenth notes',
    [2, 4],
    60,
    "1__ 2__ 3__ 4__ 5 | 4__ 3__ 2__ 1__ 7, | 1_ 3_ 5_ 1'_ | 6 5 | 4__ 5__ 6__ 4__ 3__ 4__ 5__ 3__ | 2__ 3__ 4__ 2__ 7,_ 5,_ | 1 5, | 1 - |",
  ),
  drill(
    'd5-3',
    5,
    '练习 5·3 · 小调大跳',
    'Drill 5.3 · Minor-key leaps',
    [4, 4],
    72,
    '6, 3 1 6, | #5, 3 7, - | 1 6 3 1 | 7, - - 3, | 6, 1 3 6 | #5 3 4 2 | 7, 1 7, #5, | 6, - - - |',
    { mode: 'minor' },
  ),
  drill(
    'd5-4',
    5,
    '练习 5·4 · 6/8 小调',
    'Drill 5.4 · Minor in 6/8',
    [6, 8],
    54,
    '3, 6,_ 7,. | 1 2_ 3. | 4 3_ 2 1_ | 7,. 3,. | 6, 1_ 3 6_ | #5 3_ 4. | 2 7,_ 1 #5,_ | 6,. -. |',
    { mode: 'minor' },
  ),
  drill(
    'd5-5',
    5,
    '练习 5·5 · 变化辅助音',
    'Drill 5.5 · Chromatic neighbor notes',
    [4, 4],
    72,
    "3 #2_ 3_ 5 #4_ 5_ | 1' 7 6 5 | 4 3_ 4_ 6 #5_ 6_ | 5 - - 0 | 3 #2_ 3_ 1 7,_ 1_ | 4 3 2 #1_ 2_ | 3 2 #1 2 | 1 - - - |",
  ),
];

export const songById: Record<string, SongDef> = Object.fromEntries(SONGS.map((s) => [s.id, s]));
