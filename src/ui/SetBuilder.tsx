import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EXERCISES, exerciseById } from '../exercises';
import { activeItems, type Store } from '../engine/progress';
import { peekProgress } from '../engine/planner';
import type { PracticeSet, SetPart } from '../engine/practiceSet';
import { newSeed } from '../engine/seeded';
import { findSet, saveSet, setsFull } from '../engine/sets';
import {
  canUseInSet,
  fullOptions,
  setAllItems,
  setLevels,
  SET_COUNT_DEFAULT,
  SET_COUNT_MAX,
  SET_COUNT_MIN,
  SET_NAME_MAX,
  SET_WEIGHT_MAX,
  SETS_MAX,
} from '../engine/setRunner';
import { SET_TEMPLATES, templateSet } from '../engine/setTemplates';
import type { ExerciseDef, Settings } from '../engine/types';
import { useT } from '../i18n/react';
import { Seg } from './Seg';
import { firstProblem, partNeed, partSummary } from './setBuilderUtil';

interface Props {
  store: Store;
  update(fn: (s: Store) => void): void;
  /** 编辑已保存的组合；缺省为新建 */
  id?: string;
  /** 新建时套用的模板 id */
  template?: string;
  onBack(): void;
  /** 保存后：start 为 true 时直接开始练习 */
  onSaved(id: string, start: boolean): void;
}

type Draft = Omit<PracticeSet, 'id' | 'created'>;

const GROUPS: ExerciseDef['group'][] = ['tonal', 'basics', 'sing'];
const COUNTS = [10, 20, 30, 50];

/** 用户在这个练习的当前进度：当前启用的考点，以及对应的 scoped 选项（如调式） */
function myPart(store: Store, ex: ExerciseDef, options: Record<string, string>): SetPart {
  const p = peekProgress(store, ex);
  const opts = { ...options };
  for (const o of ex.options ?? []) if (o.scoped) opts[o.id] = p.options[o.id];
  const known = new Set(setAllItems(ex, opts));
  const items = activeItems(ex, p).filter((it) => known.has(it));
  return { ex: ex.id, items, options: opts };
}

/** 只有一个练习时展开它，多个时全部折叠（看摘要即可，需要时再展开） */
const initialOpen = (parts: SetPart[]) => new Set(parts.length === 1 ? [parts[0].ex] : []);

/**
 * 组合编辑：名称、题数、练习（考点 / 选项 / 比重）；新建时可从模板开始。
 * 每个练习是可折叠的卡片（标题行带一行摘要），新加的练习展开并滚到可见处、其余折叠；
 * 「添加练习」是标题旁的展开按钮；取消 / 保存固定在底部（手机上不用滚到最后）。
 */
export function SetBuilder({ store, update, id, template, onBack, onSaved }: Props) {
  const t = useT();
  const uid = useId();
  const nameId = `${uid}-name`;
  const countId = `${uid}-count`;
  const addId = `${uid}-add`;
  const addToggleId = `${uid}-add-toggle`;
  const partId = (ex: string) => `${uid}-part-${ex}`;
  const editing = id ? findSet(store, id) : undefined;
  const [draft, setDraft] = useState<Draft>(() => {
    if (editing) {
      const { name, parts, count, seed } = structuredClone(editing);
      return seed === undefined ? { name, parts, count } : { name, parts, count, seed };
    }
    const tpl = SET_TEMPLATES.find((x) => x.id === template);
    return tpl ? templateSet(tpl, t(tpl.name)) : { name: '', parts: [], count: SET_COUNT_DEFAULT };
  });
  const [countText, setCountText] = useState(String(draft.count));
  // 固定题目：关掉再打开时沿用原来的 seed（已分享出去的链接仍对应同一套题），只有「换一套题」才换
  const [lastSeed, setLastSeed] = useState(draft.seed);
  /** 点保存的次数：点过之后才显示校验提示；每次点都重新渲染，好把焦点移到第一个问题 */
  const [attempts, setAttempts] = useState(0);
  const tried = attempts > 0;
  /** 展开的练习卡片（练习 id） */
  const [open, setOpen] = useState(() => initialOpen(draft.parts));
  /** 「添加练习」列表：还没有练习时默认展开 */
  const [addOpen, setAddOpen] = useState(draft.parts.length === 0);
  // 渲染后要滚到可见处 / 移入焦点的元素 id（要等新卡片渲染出来）
  const scrollTo = useRef<string | null>(null);
  const focusTo = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollTo.current ? document.getElementById(scrollTo.current) : null;
    if (el) {
      // 滚到可见：标题行连同下面一小段设置露出来，且不被底部操作栏挡住（scrollIntoView 的 nearest 不认 scroll-margin）
      const r = el.getBoundingClientRect();
      const bottom = innerHeight - (document.querySelector('.set-bar')?.getBoundingClientRect().height ?? 0) - 8;
      const below = r.bottom + 120 - bottom;
      if (r.top < 8) scrollBy(0, r.top - 8);
      else if (below > 0) scrollBy(0, Math.min(below, r.top - 8));
    }
    if (focusTo.current) document.getElementById(focusTo.current)?.focus();
    scrollTo.current = focusTo.current = null;
  });

  const setPart = (i: number, part: SetPart) => setDraft((d) => ({ ...d, parts: d.parts.map((p, k) => (k === i ? part : p)) }));
  const has = (ex: string) => draft.parts.some((p) => p.ex === ex);
  const addEx = (ex: ExerciseDef) => {
    setDraft((d) => ({ ...d, parts: [...d.parts, myPart(store, ex, {})] }));
    // 新加的展开，其余折叠，免得页面越拉越长
    setOpen(new Set([ex.id]));
    scrollTo.current = `${partId(ex.id)}-head`;
  };
  const removeEx = (ex: string) => {
    setDraft((d) => ({ ...d, parts: d.parts.filter((p) => p.ex !== ex) }));
    setOpen((o) => new Set([...o].filter((x) => x !== ex)));
  };
  /** 卡片上的「移除」：焦点移到下一个（没有就上一个）练习，都没有了移到「添加练习」 */
  const removeFromCard = (ex: string) => {
    const i = draft.parts.findIndex((p) => p.ex === ex);
    const next = draft.parts[i + 1] ?? draft.parts[i - 1];
    focusTo.current = next ? `${partId(next.ex)}-toggle` : addToggleId;
    removeEx(ex);
  };
  const toggleOpen = (ex: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(ex)) n.delete(ex);
      else n.add(ex);
      return n;
    });
  const setCount = (text: string) => {
    setCountText(text);
    setDraft((d) => ({ ...d, count: Number(text) }));
  };
  const setFixed = (on: boolean) => {
    const seed = on ? (lastSeed ?? newSeed()) : undefined;
    if (seed !== undefined) setLastSeed(seed);
    setDraft((d) => {
      const next = { ...d, seed };
      if (seed === undefined) delete next.seed;
      return next;
    });
  };
  const reseed = () => {
    const seed = newSeed();
    setLastSeed(seed);
    setDraft((d) => ({ ...d, seed }));
  };
  const applyTemplate = (tplId: string) => {
    const tpl = SET_TEMPLATES.find((x) => x.id === tplId);
    if (!tpl) return;
    // 模板不改动固定题目的开关
    const next: Draft = draft.seed === undefined ? templateSet(tpl, t(tpl.name)) : { ...templateSet(tpl, t(tpl.name)), seed: draft.seed };
    setDraft(next);
    setCountText(String(next.count));
    setOpen(initialOpen(next.parts));
    setAddOpen(false);
  };

  // 新建时已存满：不能保存（编辑已有的组合不受影响）
  const full = !editing && setsFull(store);
  // 名称上限按码点计（与存储时的 cleanSetName 一致，emoji 算一个字符），不用按 UTF-16 计数的 maxLength
  const setName = (text: string) => {
    const cps = [...text];
    const name = cps.length > SET_NAME_MAX ? cps.slice(0, SET_NAME_MAX).join('') : text;
    setDraft((d) => ({ ...d, name }));
  };

  const errors = useMemo(() => validate(draft, store.settings, t), [draft, store.settings, t]);

  const save = (start: boolean) => {
    if (full) return;
    setAttempts((n) => n + 1);
    const bad = firstProblem(draft, store.settings);
    if (bad) {
      // 焦点（连同滚动）移到第一个需要修正的地方；错误列表在底部操作栏上方
      if (bad.kind === 'name') focusTo.current = nameId;
      else if (bad.kind === 'count') focusTo.current = countId;
      else if (bad.kind === 'parts') {
        setAddOpen(true);
        focusTo.current = addToggleId;
      } else {
        setOpen((o) => new Set([...o, bad.ex]));
        focusTo.current = `${partId(bad.ex)}-toggle`;
      }
      return;
    }
    if (errors.length > 0) return;
    const saved = saveSet(update, { ...draft, name: draft.name.trim(), id: editing?.id, created: editing?.created });
    if (saved) onSaved(saved.id, start);
  };

  return (
    <main className="page set-builder">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label={t('common.backAria')}>
          {t('common.back')}
        </button>
        <div className="practice-title">
          <h1>{editing ? t('sets.editTitle') : t('sets.newTitle')}</h1>
        </div>
        <span className="topbar-spacer" />
      </header>

      {!editing && (
        <section className="panel">
          <div className="field">
            <span className="field-label">{t('sets.fromTemplate')}</span>
            <div className="seg wrap set-templates">
              {SET_TEMPLATES.map((tpl) => (
                <button key={tpl.id} onClick={() => applyTemplate(tpl.id)}>
                  {tpl.icon} {t(tpl.name)}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="field">
          <label htmlFor={nameId}>{t('sets.name')}</label>
          <input
            id={nameId}
            className="text-input"
            type="text"
            value={draft.name}
            placeholder={t('sets.namePlaceholder')}
            aria-invalid={tried && !draft.name.trim() ? true : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field-label">{t('sets.count')}</span>
          <div className="set-count">
            <Seg value={String(draft.count)} options={COUNTS.map((n) => [String(n), String(n)] as [string, string])} onChange={setCount} />
            <label className="set-count-custom" htmlFor={countId}>
              {t('sets.countCustom', { min: SET_COUNT_MIN, max: SET_COUNT_MAX })}
            </label>
            <input
              id={countId}
              className="text-input set-count-input"
              type="number"
              inputMode="numeric"
              min={SET_COUNT_MIN}
              max={SET_COUNT_MAX}
              value={countText}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
        </div>
        <div className="set-fixed">
          <label className="set-fixed-toggle">
            <input type="checkbox" checked={draft.seed !== undefined} onChange={(e) => setFixed(e.target.checked)} />
            {t('sets.fixed')}
          </label>
          <p className="muted set-fixed-hint">{t('sets.fixedHint')}</p>
          {draft.seed !== undefined && (
            <div className="set-fixed-reseed">
              <button onClick={reseed}>{t('sets.reseed')}</button>
              {editing?.seed !== undefined && draft.seed !== editing.seed && (
                <span className="muted" role="status">
                  {t('sets.reseeded')}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="set-parts">
        <div className="set-parts-head">
          <h2 className="group-title">{t('sets.parts', { n: draft.parts.length })}</h2>
          <button
            id={addToggleId}
            className={addOpen ? 'set-add-toggle on' : 'set-add-toggle'}
            aria-expanded={addOpen}
            aria-controls={addId}
            onClick={() => setAddOpen((o) => !o)}
          >
            <span aria-hidden="true">+</span> {t('sets.add')}
            <span className="set-chev" aria-hidden="true" />
          </button>
        </div>

        <section id={addId} className="panel set-add" aria-labelledby={addToggleId} hidden={!addOpen}>
          {GROUPS.map((g) => [g, EXERCISES.filter((ex) => ex.group === g && canUseInSet(ex))] as const)
            .filter(([, list]) => list.length > 0)
            .map(([g, list]) => (
              <div className="field" key={g}>
                <span className="field-label">{t(`group.${g}`)}</span>
                <div className="seg wrap">
                  {list.map((ex) => {
                    const on = has(ex.id);
                    return (
                      <button key={ex.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => (on ? removeEx(ex.id) : addEx(ex))}>
                        {ex.icon} {ex.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          <div className="set-add-foot">
            <p className="muted set-excluded">{t('sets.excluded')}</p>
            {draft.parts.length > 0 && (
              <button
                onClick={() => {
                  setAddOpen(false);
                  focusTo.current = addToggleId;
                }}
              >
                {t('sets.addDone')}
              </button>
            )}
          </div>
        </section>

        {draft.parts.length === 0 && !addOpen && <p className="muted set-noparts">{t('sets.noParts')}</p>}
        {draft.parts.map((part, i) => {
          const ex = exerciseById[part.ex];
          const need = partNeed(ex, part, store.settings);
          return (
            <PartEditor
              key={part.ex}
              id={partId(part.ex)}
              store={store}
              part={part}
              open={open.has(part.ex)}
              bad={tried && part.items.length < need ? need : 0}
              onToggle={() => toggleOpen(part.ex)}
              onChange={(p) => setPart(i, p)}
              onRemove={() => removeFromCard(part.ex)}
            />
          );
        })}
      </div>

      <div className="set-bar">
        {full && <p className="set-full">{t('sets.full', { n: SETS_MAX })}</p>}
        {tried && errors.length > 0 && (
          <div className="set-errors" role="alert">
            <strong>{t('sets.errTitle')}</strong>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="set-save">
          <button onClick={onBack}>{t('sets.cancel')}</button>
          <button onClick={() => save(false)} disabled={full}>
            {t('sets.save')}
          </button>
          <button className="primary" onClick={() => save(true)} disabled={full}>
            {t('sets.saveStart')}
          </button>
        </div>
      </div>
    </main>
  );
}

/** 校验草稿，返回（当前语言的）错误信息 */
function validate(d: Draft, settings: Settings, t: ReturnType<typeof useT>): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push(t('sets.err.name'));
  if (d.parts.length === 0) out.push(t('sets.err.parts'));
  for (const p of d.parts) {
    const ex = exerciseById[p.ex];
    const need = partNeed(ex, p, settings);
    if (p.items.length < need) out.push(t('sets.err.items', { name: ex.title, n: need }));
  }
  if (!Number.isInteger(d.count) || d.count < SET_COUNT_MIN || d.count > SET_COUNT_MAX)
    out.push(t('sets.err.count', { min: SET_COUNT_MIN, max: SET_COUNT_MAX }));
  return out;
}

interface PartProps {
  /** 卡片元素 id 的前缀（标题行 / 展开按钮 / 内容区） */
  id: string;
  store: Store;
  part: SetPart;
  open: boolean;
  /** 已尝试保存且考点不足时为至少需要的个数，否则为 0 */
  bad: number;
  onToggle(): void;
  onChange(p: SetPart): void;
  onRemove(): void;
}

/** 一个练习的设置（可折叠）：选项、出题比重、考点（按级别分行，级别按钮整级切换） */
function PartEditor({ id, store, part, open, bad, onToggle, onChange, onRemove }: PartProps) {
  const t = useT();
  const ex = exerciseById[part.ex];
  const opts = fullOptions(ex, part.options);
  const levels = setLevels(ex, opts);
  const all = setAllItems(ex, opts);
  const chosen = new Set(part.items);
  // 按级别顺序保存考点
  const withItems = (items: Set<string>) => onChange({ ...part, items: all.filter((it) => items.has(it)) });

  const setOption = (oid: string, value: string) => {
    const options = { ...part.options, [oid]: value };
    const lv = setLevels(ex, options);
    const known = new Set(lv.flatMap((l) => l.items));
    // 换调式等会换掉整套考点：保留仍存在的，都不在了就从第 1 级开始
    const kept = part.items.filter((it) => known.has(it));
    onChange({ ...part, options, items: kept.length > 0 ? kept : [...(lv[0]?.items ?? [])] });
  };

  const toggle = (it: string) => {
    const next = new Set(chosen);
    if (next.has(it)) next.delete(it);
    else next.add(it);
    withItems(next);
  };

  const toggleLevel = (items: string[]) => {
    const next = new Set(chosen);
    const full = items.every((it) => next.has(it));
    for (const it of items)
      if (full) next.delete(it);
      else next.add(it);
    withItems(next);
  };

  const cls = ['panel', 'set-part', open ? 'open' : '', bad ? 'bad' : ''].filter(Boolean).join(' ');
  return (
    <section className={cls} aria-labelledby={`${id}-name`}>
      <div className="set-part-head" id={`${id}-head`}>
        <h3>
          <button id={`${id}-toggle`} className="set-part-toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
            <span className="q-module-icon" aria-hidden="true">
              {ex.icon}
            </span>
            <span className="set-part-text">
              <span className="set-part-name" id={`${id}-name`}>
                {ex.title}
              </span>
              <span className="set-part-sum">
                {bad > 0 && <span className="set-part-warn">{t('sets.sumBad', { n: bad })} · </span>}
                {partSummary(ex, part, t)}
              </span>
            </span>
            <span className="set-chev" aria-hidden="true" />
          </button>
        </h3>
        <button className="ghost danger set-part-remove" onClick={onRemove} aria-label={t('sets.removeAria', { name: ex.title })}>
          {t('sets.remove')}
        </button>
      </div>

      <div className="set-part-body" id={`${id}-body`} hidden={!open}>
        {ex.heavy && <p className="muted set-heavy">{t('sets.heavy')}</p>}
        {ex.options?.map((o) => (
          <div className="field" key={o.id}>
            <span className="field-label">{o.label}</span>
            <Seg
              value={opts[o.id]}
              options={o.values.map((v) => [v.id, v.label] as [string, string])}
              onChange={(v) => setOption(o.id, v)}
            />
          </div>
        ))}

        <div className="field">
          <span className="field-label">{t('sets.weight')}</span>
          <Seg
            value={String(part.weight ?? 1)}
            options={Array.from({ length: SET_WEIGHT_MAX }, (_, i) => [String(i + 1), `×${i + 1}`] as [string, string])}
            onChange={(v) => onChange({ ...part, weight: Number(v) })}
          />
        </div>

        <div className="field">
          <span className="field-label">{t('sets.items', { n: part.items.length, total: all.length })}</span>
          <div className="seg wrap set-quick">
            <button onClick={() => onChange({ ...myPart(store, ex, part.options), weight: part.weight })}>{t('sets.mine')}</button>
            <button onClick={() => withItems(new Set(all))}>{t('sets.all')}</button>
            <button onClick={() => withItems(new Set())}>{t('sets.none')}</button>
          </div>
          <div className="set-levels">
            {levels.map((l, i) => {
              const n = l.items.filter((it) => chosen.has(it)).length;
              const state = n === l.items.length ? 'on' : n > 0 ? 'some' : '';
              return (
                <div className="set-level" key={i}>
                  {/* 整级切换：全选时按下，部分选中为 mixed */}
                  <button
                    className={`chip set-level-btn ${state}`}
                    aria-pressed={state === 'on' ? true : state === 'some' ? 'mixed' : false}
                    aria-label={t('sets.levelAria', { n: i + 1 })}
                    onClick={() => toggleLevel(l.items)}
                  >
                    {t('sets.levelN', { n: i + 1 })}
                  </button>
                  <div className="chips">
                    {l.items.map((it) => (
                      <button
                        key={it}
                        className={chosen.has(it) ? 'chip on' : 'chip'}
                        aria-pressed={chosen.has(it)}
                        onClick={() => toggle(it)}
                      >
                        {ex.itemLabel(it, store.settings)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
