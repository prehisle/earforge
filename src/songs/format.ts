// 视唱曲库的旋律记法：简谱式文本，与调无关（首调），解析成相对 do 的半音数与时值。
//
// 记法（空格分隔记号，| 为小节线）：
//   1..7   音级（大调音阶：1 = do），前缀 # / b 为升降，后缀 ' 高八度、, 低八度（可重复）
//   0      休止符
//   _      时值减半（可重复：1_ 八分，1__ 十六分）
//   .      附点（×1.5），与 _ 可同时使用：1._ 为附点八分
//   -      延长前一个音（或休止）一拍（四分音符），同样可带 _ 和 .（6/8 的附点四分延长写作 -.）；
//          写在小节开头表示跨小节延长（连音线，记谱时由渲染器拆分）
// 时值单位：四分音符 = 1。小调歌曲按中文简谱习惯用 la 作主音书写（6 = 主音），解析结果仍相对 do。

/** 解析后的一个音（或休止）。 */
export interface SongNote {
  /** 相对 do 的半音数；null 为休止 */
  semi: number | null;
  /** 简谱音级 1..7（休止为 0），决定拼写用的字母 */
  digit: number;
  /** 八度偏移（' 为 +1，, 为 -1） */
  oct: number;
  /** 变音：-1 降，0 本位，1 升 */
  alt: number;
  /** 时值（四分音符 = 1） */
  dur: number;
  /** 开始位置（四分音符，从弱起小节开头算起） */
  start: number;
  /** 所在小节（0 起；有弱起时 0 为弱起小节） */
  bar: number;
}

export interface ParsedMelody {
  notes: SongNote[];
  /** 各小节的总时值 */
  bars: number[];
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

/** 时值修饰：每个 _ 减半，每个 . 乘 1.5。 */
function durOf(mods: string): number {
  let d = 1;
  for (const c of mods) d *= c === '_' ? 0.5 : 1.5;
  return d;
}

const NOTE_RE = /^([#b]?)([0-7])([',]*)([_.]*)$/;
const EXT_RE = /^-([_.]*)$/;

/** 解析旋律文本；记号有误时抛出错误（附带出错的记号）。 */
export function parseMelody(text: string): ParsedMelody {
  const notes: SongNote[] = [];
  const bars: number[] = [];
  let pos = 0;
  let barSum = 0;
  const closeBar = () => {
    bars.push(barSum);
    barSum = 0;
  };
  for (const tok of text.trim().split(/\s+/)) {
    if (tok === '|') {
      closeBar();
      continue;
    }
    const ext = EXT_RE.exec(tok);
    if (ext) {
      const last = notes[notes.length - 1];
      if (!last) throw new Error(`延长记号前没有音：${tok}`);
      const d = durOf(ext[1]);
      last.dur += d;
      pos += d;
      barSum += d;
      continue;
    }
    const m = NOTE_RE.exec(tok);
    if (!m) throw new Error(`无法识别的记号：${tok}`);
    const [, acc, dg, octs, mods] = m;
    const digit = Number(dg);
    const alt = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
    if (digit === 0 && (alt || octs)) throw new Error(`休止符不能带升降或八度：${tok}`);
    let oct = 0;
    for (const c of octs) oct += c === "'" ? 1 : -1;
    const dur = durOf(mods);
    notes.push({
      semi: digit === 0 ? null : MAJOR_STEPS[digit - 1] + alt + oct * 12,
      digit,
      oct,
      alt,
      dur,
      start: pos,
      bar: bars.length,
    });
    pos += dur;
    barSum += dur;
  }
  if (barSum > 0) closeBar();
  return { notes, bars };
}

/** 只含音（不含休止）的半音数。 */
export function pitchedSemis(m: ParsedMelody): number[] {
  return m.notes.flatMap((n) => (n.semi === null ? [] : [n.semi]));
}

/** 音域跨度（半音）。 */
export function semiSpan(m: ParsedMelody): number {
  const s = pitchedSemis(m);
  return Math.max(...s) - Math.min(...s);
}

/** 拍号对应的小节长度（四分音符）。 */
export function barLength(meter: [number, number]): number {
  return (meter[0] * 4) / meter[1];
}

/** 一拍的长度（四分音符）：6/8、9/8 等复拍子以附点四分为一拍。 */
export function beatLength(meter: [number, number]): number {
  return meter[1] === 8 && meter[0] % 3 === 0 ? 1.5 : 4 / meter[1];
}

/** 每小节的拍数。 */
export function beatsPerBar(meter: [number, number]): number {
  return Math.round(barLength(meter) / beatLength(meter));
}
