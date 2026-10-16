import type { NoteEvent, Timbre } from '../audio/engine';
import type { Score } from '../music/notation';
import type { Locale } from '../i18n';
import type { ModeId, NamingSystem } from '../music/theory';

export interface Choice {
  id: string;
  label: string;
  sub?: string;
  /**
   * 节奏谱（可选）：时值序列，单位为 1/12 个四分音符（四分 12、八分 6、十六分 3、三连音八分 4、
   * 附点四分 18、二分 24、全音符 48），负数表示同时值的休止。存在时选项按钮显示节奏谱代替 label。
   */
  rhythm?: number[];
}

export interface Question {
  /** 本题的主考点（用于统计） */
  item: string;
  /** 建立调性的前奏（终止式），可选 */
  prelude?: NoteEvent[];
  /** 题目本体 */
  events: NoteEvent[];
  /** 答对后播放的解决（如 ti→do） */
  resolution?: NoteEvent[];
  choices: Choice[];
  /** 逐步作答的正确答案（单选题长度为 1） */
  answer: string[];
  /** 每一步对应的统计考点，缺省为 item */
  stepItems?: string[];
  prompt: string;
  explain?: string;
  /**
   * 对比试听：假如答案是 choiceId，题目听起来是什么样（同一个调、起始音与演奏方式）。
   * 多步题针对第 step 步，返回把这一步替换成该选项后的序列。缺省表示不支持试听。
   */
  choiceEvents?(choiceId: string, step?: number): NoteEvent[];
  /** MIDI 键盘作答：把按下的音映射到选项 id，无对应选项时返回 null。缺省表示不支持。 */
  midiAnswer?(midi: number): string | null;
  /** 唱歌题：目标 MIDI 与显示文字 */
  sing?: { targets: number[]; display: string[]; showDisplay: boolean };
  /**
   * 打节奏题：时值序列（单位同 Choice.rhythm）、速度、是否边看谱边打（否则先听 events 再凭记忆打）、
   * 预备拍数。由 TapPanel 自行播放与判定，Quiz 不自动播放。
   */
  tap?: { durs: number[]; bpm: number; showNotation: boolean; countIn: number };
  /** 五线谱：本题的音（已拼写），答完后显示在反馈区；视唱题按设置在作答时显示 */
  score?: Score;
  /**
   * 记谱作答（节奏旋律听写）：用时值与音高按钮写出整段旋律，由 NotatePanel 判定（整题一步）。
   * 存在时 choices 为空，Quiz 的数字键与 MIDI 作答交给面板处理。
   */
  notate?: NotateSpec;
}

/** 一个音：相对主音的半音数（null 为休止）与时值（tick，四分音符 = 12） */
export interface NotateNote {
  rel: number | null;
  dur: number;
}

export interface NotateSpec {
  /** 正确答案（相邻休止已合并，连音线连起来的音合成一个长音） */
  notes: NotateNote[];
  meter: [number, number];
  /** 主音（MIDI） */
  tonic: number;
  mode: ModeId;
  /** 每分钟四分音符数 */
  bpm: number;
  /** 是否提供升降号（含变化音的级别） */
  chromatic: boolean;
}

export interface Level {
  /** 显示名称（当前语言） */
  readonly name: string;
  items: string[];
}

export interface OptionDef {
  id: string;
  label: string;
  values: { id: string; label: string }[];
  default: string;
  /** 每个取值各自记录级别与自选考点（如调式：切换后考点完全不同） */
  scoped?: boolean;
}

export interface Settings {
  /** 界面语言。缺省为 zh：旧版数据没有该字段，视为中文用户；全新的存储由 loadStore 按浏览器语言设定 */
  lang: Locale;
  naming: NamingSystem;
  timbre: Timbre;
  volume: number;
  keyMode: 'C' | 'random';
  autoNext: boolean;
  voice: 'low' | 'high';
  /** 每日目标题数 */
  dailyGoal: number;
  /** 今日训练每组题数 */
  mixSize: number;
  /** MIDI 键盘作答 */
  midi: boolean;
  /** 记谱：jianpu 只用唱名/简谱；staff 视唱只看五线谱；both 两者都显示（答完后都附五线谱） */
  notation: Notation;
  /** 已完成（或跳过）新手引导。缺省为 true：旧版数据没有该字段，视为老用户；全新的存储由 loadStore 设为 false */
  onboarded: boolean;
  /** 已关闭首次使用提示的练习 id */
  tipsSeen: string[];
}

export type Notation = 'jianpu' | 'staff' | 'both';

export const DEFAULT_SETTINGS: Settings = {
  lang: 'zh',
  naming: 'movable',
  timbre: 'piano',
  volume: 0.8,
  keyMode: 'random',
  autoNext: true,
  voice: 'low',
  dailyGoal: 30,
  mixSize: 20,
  midi: false,
  notation: 'both',
  onboarded: true,
  tipsSeen: [],
};

export interface GenContext {
  settings: Settings;
  items: string[]; // 当前启用的考点
  options: Record<string, string>;
}

export interface ExerciseDef {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  /** 首页分组（id，显示名见词典 group.*） */
  group: 'basics' | 'tonal' | 'sing';
  /** 默认选项下的级别 */
  levels: Level[];
  /** 级别随选项变化时提供（如按调式生成）；缺省即 levels。请通过 progress.levelsOf() 读取 */
  levelsFor?(options: Record<string, string>): Level[];
  options?: OptionDef[];
  itemLabel(item: string, settings: Settings): string;
  generate(item: string, ctx: GenContext): Question;
  /** 唱歌类练习需要麦克风 */
  mic?: boolean;
  /** 需要手动输入（如打节奏），不进今日训练 */
  manual?: boolean;
}
