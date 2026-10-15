import type { ExerciseDef } from '../engine/types';
import { keyName, mod, pick } from '../music/theory';
import { chooseTonic, cadenceEvents } from './common';

interface Func {
  id: string;
  roman: string;
  name: string;
  root: number; // 相对主音
  third: number;
  fifth: number;
}

const FUNCS: Func[] = [
  { id: 'I', roman: 'Ⅰ', name: '主和弦', root: 0, third: 4, fifth: 7 },
  { id: 'ii', roman: 'ⅱ', name: '上主和弦', root: 2, third: 3, fifth: 7 },
  { id: 'iii', roman: 'ⅲ', name: '中音和弦', root: 4, third: 3, fifth: 7 },
  { id: 'IV', roman: 'Ⅳ', name: '下属和弦', root: 5, third: 4, fifth: 7 },
  { id: 'V', roman: 'Ⅴ', name: '属和弦', root: 7, third: 4, fifth: 7 },
  { id: 'vi', roman: 'ⅵ', name: '下中音和弦', root: 9, third: 3, fifth: 7 },
  { id: 'vii', roman: 'ⅶ°', name: '导和弦', root: 11, third: 3, fifth: 6 },
];
const byId = Object.fromEntries(FUNCS.map((f) => [f.id, f]));

function voicing(tonic: number, f: Func): number[] {
  const r = tonic + f.root - (f.root >= 7 ? 12 : 0);
  return [r - 12, r, r + f.third, r + f.fifth];
}

export const progressions: ExerciseDef = {
  id: 'progressions',
  title: '级数和弦',
  subtitle: '在调性中辨认 Ⅰ Ⅳ Ⅴ ⅵ…，扒歌、即兴的核心能力',
  icon: 'Ⅳ',
  group: '调性听觉',
  levels: [
    { name: 'Ⅰ · Ⅳ · Ⅴ', items: ['I', 'IV', 'V'] },
    { name: '+ ⅵ', items: ['vi'] },
    { name: '+ ⅱ', items: ['ii'] },
    { name: '+ ⅲ · ⅶ°', items: ['iii', 'vii'] },
  ],
  options: [
    {
      id: 'len',
      label: '题型',
      values: [
        { id: '1', label: '单个和弦' },
        { id: '4', label: '四和弦进行' },
      ],
      default: '1',
    },
  ],
  itemLabel: (it) => `${byId[it].roman} ${byId[it].name}`,
  generate(item, ctx) {
    const tonic = chooseTonic(ctx.settings);
    const keyPc = mod(tonic, 12);
    const four = ctx.options.len === '4';
    const choices = FUNCS.filter((f) => ctx.items.includes(f.id) || (four && f.id === 'I')).map((f) => ({
      id: f.id,
      label: f.roman,
      sub: f.name,
    }));
    if (four) {
      // 以 Ⅰ 开头的四和弦进行，考点放在随机位置
      const seq = ['I'];
      const slot = 1 + Math.floor(Math.random() * 3);
      for (let i = 1; i < 4; i++) seq.push(i === slot ? item : pick(ctx.items));
      return {
        item,
        prelude: cadenceEvents(tonic),
        events: seq.map((id, i) => ({ notes: voicing(tonic, byId[id]), time: i * 1.1, dur: 1.05 })),
        choices,
        answer: seq,
        stepItems: seq,
        prompt: `${keyName(keyPc)} 大调 · 依次选出 4 个和弦（第一个是 Ⅰ）`,
        explain: seq.map((id) => byId[id].roman).join(' → '),
      };
    }
    return {
      item,
      prelude: cadenceEvents(tonic),
      events: [{ notes: voicing(tonic, byId[item]), time: 0, dur: 1.8 }],
      choices,
      answer: [item],
      prompt: `${keyName(keyPc)} 大调 · 这是哪个级数和弦？`,
      explain: `${byId[item].roman} ${byId[item].name}`,
    };
  },
};
