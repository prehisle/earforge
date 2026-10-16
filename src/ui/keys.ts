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
