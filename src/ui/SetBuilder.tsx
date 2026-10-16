import { useId, useMemo, useState } from 'react';
import { EXERCISES, exerciseById } from '../exercises';
import { activeItems, type Store } from '../engine/progress';
import { peekProgress } from '../engine/planner';
import type { PracticeSet, SetPart } from '../engine/practiceSet';
import { findSet, saveSet } from '../engine/sets';
import {
  canUseInSet,
  fullOptions,
  minItems,
  setAllItems,
  setLevels,
  SET_COUNT_DEFAULT,
  SET_COUNT_MAX,
  SET_COUNT_MIN,
  SET_NAME_MAX,
  SET_WEIGHT_MAX,
} from '../engine/setRunner';
import { SET_TEMPLATES, templateSet } from '../engine/setTemplates';
import type { ExerciseDef, Settings } from '../engine/types';
import { useT } from '../i18n/react';
import { Seg } from './Seg';

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

/** 组合编辑：名称、题数、练习（考点 / 选项 / 比重）；新建时可从模板开始。 */
export function SetBuilder({ store, update, id, template, onBack, onSaved }: Props) {
  const t = useT();
  const nameId = useId();
  const countId = useId();
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
  const [tried, setTried] = useState(false);

  const setPart = (i: number, part: SetPart) => setDraft((d) => ({ ...d, parts: d.parts.map((p, k) => (k === i ? part : p)) }));
  const toggleEx = (ex: ExerciseDef) =>
    setDraft((d) =>
      d.parts.some((p) => p.ex === ex.id)
        ? { ...d, parts: d.parts.filter((p) => p.ex !== ex.id) }
        : { ...d, parts: [...d.parts, myPart(store, ex, {})] },
    );
  const setCount = (text: string) => {
    setCountText(text);
    setDraft((d) => ({ ...d, count: Number(text) }));
  };
  const applyTemplate = (tplId: string) => {
    const tpl = SET_TEMPLATES.find((x) => x.id === tplId);
    if (!tpl) return;
    const next = templateSet(tpl, t(tpl.name));
    setDraft(next);
    setCountText(String(next.count));
  };

  const errors = useMemo(() => validate(draft, store.settings, t), [draft, store.settings, t]);

  const save = (start: boolean) => {
    setTried(true);
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
            maxLength={SET_NAME_MAX}
            placeholder={t('sets.namePlaceholder')}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
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
      </section>

      <h2 className="group-title">{t('sets.parts', { n: draft.parts.length })}</h2>
      {draft.parts.length === 0 && <p className="muted set-noparts">{t('sets.noParts')}</p>}
      {draft.parts.map((part, i) => (
        <PartEditor
          key={part.ex}
          store={store}
          part={part}
          onChange={(p) => setPart(i, p)}
          onRemove={() => toggleEx(exerciseById[part.ex])}
        />
      ))}

      <section className="panel set-add">
        <h2 className="chart-title">{t('sets.add')}</h2>
        {GROUPS.map((g) => (
          <div className="field" key={g}>
            <span className="field-label">{t(`group.${g}`)}</span>
            <div className="seg wrap">
              {EXERCISES.filter((ex) => ex.group === g && canUseInSet(ex)).map((ex) => {
                const on = draft.parts.some((p) => p.ex === ex.id);
                return (
                  <button key={ex.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => toggleEx(ex)}>
                    {ex.icon} {ex.title}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="muted set-excluded">{t('sets.excluded')}</p>
      </section>

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

      <div className="summary-actions set-save">
        <button onClick={onBack}>{t('sets.cancel')}</button>
        <button onClick={() => save(false)}>{t('sets.save')}</button>
        <button className="primary" onClick={() => save(true)}>
          {t('sets.saveStart')}
        </button>
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
    // 只选一个考点时才需要判断（选项就是考点的练习至少要两个）
    const need = p.items.length >= 2 ? 1 : minItems(ex, p.options, settings);
    if (p.items.length < need) out.push(t('sets.err.items', { name: ex.title, n: need }));
  }
  if (!Number.isInteger(d.count) || d.count < SET_COUNT_MIN || d.count > SET_COUNT_MAX)
    out.push(t('sets.err.count', { min: SET_COUNT_MIN, max: SET_COUNT_MAX }));
  return out;
}

/** 一个练习的设置：选项、出题比重、考点（按级别分行，可整级切换） */
function PartEditor({ store, part, onChange, onRemove }: { store: Store; part: SetPart; onChange(p: SetPart): void; onRemove(): void }) {
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
    for (const it of items) if (full) next.delete(it);
    else next.add(it);
    withItems(next);
  };

  return (
    <section className="panel set-part">
      <div className="set-part-head">
        <h3>
          <span className="q-module-icon">{ex.icon}</span>
          {ex.title}
        </h3>
        {ex.heavy && <span className="muted set-heavy">{t('sets.heavy')}</span>}
        <button className="ghost danger" onClick={onRemove} aria-label={t('sets.removeAria', { name: ex.title })}>
          {t('sets.remove')}
        </button>
      </div>

      {ex.options?.map((o) => (
        <div className="field" key={o.id}>
          <span className="field-label">{o.label}</span>
          <Seg value={opts[o.id]} options={o.values.map((v) => [v.id, v.label] as [string, string])} onChange={(v) => setOption(o.id, v)} />
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
            const full = l.items.every((it) => chosen.has(it));
            return (
              <div className="set-level" key={i}>
                <button
                  className={full ? 'chip set-level-btn on' : 'chip set-level-btn'}
                  aria-pressed={full}
                  aria-label={t('sets.levelAria', { n: i + 1 })}
                  onClick={() => toggleLevel(l.items)}
                >
                  {t('sets.levelN', { n: i + 1 })}
                </button>
                <div className="chips">
                  {l.items.map((it) => (
                    <button key={it} className={chosen.has(it) ? 'chip on' : 'chip'} aria-pressed={chosen.has(it)} onClick={() => toggle(it)}>
                      {ex.itemLabel(it, store.settings)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
