// 页面级快捷键的共用判断。

/**
 * 用 Tab 聚焦到题目区以外的按钮（返回、选项面板……）时按回车/空格：交给按钮本身。
 * 否则只用键盘的用户按不了这些按钮——快捷键会把回车当「下一题/开始」、空格当「重听」。
 * 用鼠标点过的按钮不算（:focus-visible 不成立），仍按快捷键处理。
 */
export function keyForFocusedButton(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  const el = e.target;
  if (!(el instanceof HTMLElement) || !el.closest('button, a[href], [role="button"]') || el.closest('.question')) return false;
  try {
    return el.matches(':focus-visible');
  } catch {
    return true; // 不支持 :focus-visible 的旧浏览器：聚焦在按钮上就交给按钮
  }
}

// ───── 选择题的作答键 ─────

/**
 * 第 i 个选项的作答键：1–9、0，再接字母键盘第一行 Q–P，共 20 个。
 * 不与其他快捷键冲突：空格 / 回车 / → 另有用途；记谱（W H Q E S T R…）与打节奏（字母键）的题目没有选项按钮。
 */
export const CHOICE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];

/** 选项按钮上显示的键名（超出 20 个时为 null） */
export const choiceKeyLabel = (i: number): string | null => CHOICE_KEYS[i]?.toUpperCase() ?? null;

/**
 * 按键对应的选项序号，不是作答键时为 -1。数字按 e.key（与按钮上的提示一致）；按住 Shift 时
 * e.key 是符号（!、@…），改用 e.code 的 Digit / Numpad；字母不区分大小写（Shift + 字母为试听）。
 */
export function choiceIndexForKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>): number {
  if (e.shiftKey) {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    if (m) return CHOICE_KEYS.indexOf(m[1]);
  }
  return e.key.length === 1 ? CHOICE_KEYS.indexOf(e.key.toLowerCase()) : -1;
}

/** 选项按 group 分段（相邻的同名分组合并），每项带原序号（作答键按原序号）。没有分组时返回 null。 */
export function groupChoices<C extends { group?: string }>(choices: C[]): { group: string; items: { c: C; i: number }[] }[] | null {
  if (!choices.some((c) => c.group)) return null;
  const out: { group: string; items: { c: C; i: number }[] }[] = [];
  choices.forEach((c, i) => {
    const g = c.group ?? '';
    const last = out[out.length - 1];
    if (last && last.group === g) last.items.push({ c, i });
    else out.push({ group: g, items: [{ c, i }] });
  });
  return out;
}
