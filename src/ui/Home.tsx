import { activeItems, getProgress, mastery, streak, today, type Store } from '../engine/progress';
import { STARTER_IDS, planModules, rankItems } from '../engine/planner';
import { EXERCISES as ALL, exerciseById } from '../exercises';

interface Props {
  store: Store;
  onOpen(id: string): void;
  onMix(): void;
  onStats(): void;
  onSettings(): void;
}

const GROUPS = ['调性听觉', '基础', '视唱练耳'] as const;

export function Home({ store, onOpen, onMix, onStats, onSettings }: Props) {
  const t = store.daily[today()];
  const days = streak(store);
  // 只读取，不写回：getProgress 对新练习会创建默认值
  const snapshot = structuredClone(store);
  const n = t?.n ?? 0;
  const goal = store.settings.dailyGoal;
  const reached = n >= goal;
  // 今日训练预览：涉及的模块与最需要练的考点
  const mods = planModules(store, ALL);
  const fresh = mods.every((ex) => STARTER_IDS.includes(ex.id) && !Object.keys(store.exercises[ex.id]?.items ?? {}).length);
  const focus = rankItems(store, ALL)
    .filter((c) => c.strength > 0)
    .slice(0, 3)
    .map((c) => exerciseById[c.exId].itemLabel(c.item, store.settings));

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo">耳</span>
          <div>
            <h1>EarForge 耳锻</h1>
            <p className="muted">开源 · 免费 · 离线可用的练耳训练</p>
          </div>
        </div>
        <nav className="topnav">
          <button className="ghost" onClick={onStats}>
            统计
          </button>
          <button className="ghost" onClick={onSettings}>
            设置
          </button>
        </nav>
      </header>

      <section className="today">
        <div className="today-body">
          <h2>🎯 今日训练</h2>
          <p className="today-sub">
            {store.settings.mixSize} 题混合练习 · {mods.map((ex) => ex.title).join(' · ')}
          </p>
          <p className="muted today-focus">
            {fresh
              ? '从「调内音级」和「音程识别」第 1 级开始，自动挑选最需要练的考点。'
              : focus.length > 0
                ? `重点：${focus.join('、')}；掌握好的考点按间隔复习。`
                : '自动挑选掌握度最低、最久没练的考点。'}
          </p>
        </div>
        <button className="primary big" onClick={onMix}>
          开始今日训练
        </button>
      </section>

      <section className="tiles">
        <div className={reached ? 'tile goal done' : 'tile goal'}>
          <span className="tile-label">今日练习</span>
          <span className="tile-value">
            {n}
            <span className="tile-of">/{goal}</span>
          </span>
          <span className="meter" title={`每日目标 ${goal} 题`}>
            <span className="meter-fill" style={{ width: `${Math.min(1, n / goal) * 100}%` }} />
          </span>
          {reached && <span className="goal-cheer">🎉 今日目标达成</span>}
        </div>
        <div className="tile">
          <span className="tile-label">今日正确率</span>
          <span className="tile-value">{t && t.n ? `${Math.round((t.c / t.n) * 100)}%` : '—'}</span>
        </div>
        <div className="tile">
          <span className="tile-label">连续天数</span>
          <span className="tile-value">{days}</span>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g}>
          <h2 className="group-title">{g}</h2>
          <div className="cards">
            {ALL.filter((e) => e.group === g).map((ex) => {
              const p = getProgress(snapshot, ex);
              const m = mastery(p, activeItems(ex, p));
              return (
                <button key={ex.id} className="card" onClick={() => onOpen(ex.id)}>
                  <span className="card-icon">{ex.icon}</span>
                  <span className="card-body">
                    <span className="card-title">{ex.title}</span>
                    <span className="card-sub">{ex.subtitle}</span>
                    <span className="card-meta">
                      {p.custom ? '自选考点' : `第 ${p.level + 1}/${ex.levels.length} 级 · ${ex.levels[p.level].name}`}
                    </span>
                    <span className="meter" title={`当前级别掌握度 ${Math.round(m * 100)}%`}>
                      <span className="meter-fill" style={{ width: `${m * 100}%` }} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="foot muted">
        建议从「调内音级」开始：它训练的是在调性中听音的能力，对扒歌、即兴、视唱帮助最大。
        <br />
        快捷键：数字键作答 · 空格重听 · 回车下一题
      </footer>
    </main>
  );
}
