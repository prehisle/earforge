import type { NoteEvent, Timbre } from '../audio/engine';
import type { NamingSystem } from '../music/theory';

export interface Choice {
  id: string;
  label: string;
  sub?: string;
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
  /** 唱歌题：目标 MIDI 与显示文字 */
  sing?: { targets: number[]; display: string[]; showDisplay: boolean };
}

export interface Level {
  name: string;
  items: string[];
}

export interface OptionDef {
  id: string;
  label: string;
  values: { id: string; label: string }[];
  default: string;
}

export interface Settings {
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
}

export const DEFAULT_SETTINGS: Settings = {
  naming: 'movable',
  timbre: 'piano',
  volume: 0.8,
  keyMode: 'random',
  autoNext: true,
  voice: 'low',
  dailyGoal: 30,
  mixSize: 20,
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
  group: '基础' | '调性听觉' | '视唱练耳';
  levels: Level[];
  options?: OptionDef[];
  itemLabel(item: string, settings: Settings): string;
  generate(item: string, ctx: GenContext): Question;
  /** 唱歌类练习需要麦克风 */
  mic?: boolean;
}
