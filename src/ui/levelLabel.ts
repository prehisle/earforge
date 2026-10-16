// 级别名称的显示：练习定义里新增级别写作「+ re · fa」，界面上显示成「新增 re、fa」，免得和外层的「 · 」分隔混在一起

import type { TFunc } from '../i18n/react';

const ADDED = /^\+\s*/;
const SEP = /\s+·\s+/g;

/** 级别里的考点名（去掉「+」，分隔改为顿号 / 逗号），如「re、fa」 */
export function levelItemsText(name: string, t: TFunc): string {
  return name.replace(ADDED, '').replace(SEP, t('level.sep'));
}

/** 用于显示的级别名：新增级别加上「新增」，如「新增 re、fa」/ "adds re, fa" */
export function levelLabel(name: string, t: TFunc): string {
  const items = levelItemsText(name, t);
  return ADDED.test(name) ? t('level.adds', { names: items }) : items;
}
