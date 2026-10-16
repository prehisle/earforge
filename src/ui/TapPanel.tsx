import { useEffect, useRef, useState } from 'react';
import { audio, type NoteEvent } from '../audio/engine';
import type { Question } from '../engine/types';
import { TPQ } from '../exercises/rhythm';
import { judgeTaps, onsetsOf, type TapJudge } from '../exercises/rhythmTap';
import { useT } from '../i18n/react';
import { RhythmNotation } from './RhythmNotation';

interface Props {
  question: Question;
  /** 首次作答的结果（整题一步） */
  onStep(index: number, firstTry: boolean): void;
  done: boolean;
}

type Phase = 'idle' | 'listen' | 'count' | 'tap' | 'result';

const LEAD = 0.05; // audio.play 在 currentTime 之后这么久开始

/**
 * 时钟对齐：把 performance.now() 时间戳换算成「听到的」AudioContext 时间。
 * 优先用 getOutputTimestamp()（给出此刻扬声器正在发出的 contextTime，已含输出延迟）；
 * 不可用时用当前两个时钟的对应关系，再扣掉输出延迟。
 */
function perfToCtx(ctx: AudioContext, perfMs: number): number {
  const ts = ctx.getOutputTimestamp?.();
  if (ts && ts.performanceTime && ts.contextTime) return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
  return ctx.currentTime + (perfMs - performance.now()) / 1000 - (ctx.outputLatency || ctx.baseLatency || 0);
}

// ───── 拍手输入：AudioWorklet 里做能量突变（onset）检测 ─────

const ONSET_WORKLET = `
class Onset extends AudioWorkletProcessor {
  constructor() { super(); this.env = 0; this.slow = 0; this.last = -1; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const x = Math.abs(ch[i]);
      const prevSlow = this.slow;
      this.env = Math.max(x, this.env * 0.995);
      this.slow += (this.env - this.slow) * 0.0015;
      const t = currentTime + i / sampleRate;
      // 能量突然高于背景很多倍，且过了不应期（80ms）
      if (this.env > 0.12 && this.env > prevSlow * 4 && t - this.last > 0.08) {
        this.last = t;
        this.port.postMessage(t);
      }
    }
    return true;
  }
}
registerProcessor('earforge-onset', Onset);
`;

class ClapListener {
  private stream: MediaStream | null = null;
  private nodes: AudioNode[] = [];

  async start(ctx: AudioContext, onClap: (ctxTime: number) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    const url = URL.createObjectURL(new Blob([ONSET_WORKLET], { type: 'text/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const src = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, 'earforge-onset');
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(node).connect(mute).connect(ctx.destination); // 接到输出才会被持续处理
    // 麦克风收到的块在渲染时已比「听到的时间」超前约一个输出延迟，另估 10ms 输入延迟
    const lag = (ctx.outputLatency || ctx.baseLatency || 0) + 0.01;
    node.port.onmessage = (e: MessageEvent<number>) => onClap(e.data - lag);
    this.nodes = [src, node, mute];
  }

  stop(): void {
    for (const n of this.nodes) n.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.nodes = [];
    this.stream = null;
  }
}

// ───── 输入面板 ─────

export function TapPanel({ question, onStep, done }: Props) {
  const t = useT();
  const tap = question.tap!;
  const beat = 60 / tap.bpm;
  const total = (tap.durs.reduce((s, d) => s + Math.abs(d), 0) / TPQ) * beat; // 节奏型总时长（秒）
  const targets = onsetsOf(tap.durs, tap.bpm);

  const [phase, setPhase] = useState<Phase>('idle');
  const [now, setNow] = useState(0); // 相对节奏型开始（秒）
  const [taps, setTaps] = useState<number[]>([]);
  const [judge, setJudge] = useState<TapJudge | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [startPerf, setStartPerf] = useState(0);
  const [clap, setClap] = useState<'off' | 'starting' | 'on'>('off');
  const [clapError, setClapError] = useState<string | null>(null);

  // 回调里读最新状态
  const st = useRef({ phase: 'idle' as Phase, start: 0, taps: [] as number[], reported: false, run: 0 });
  const props = useRef({ onStep });
  props.current = { onStep };
  const raf = useRef(0);
  const clapper = useRef<ClapListener | null>(null);

  const go = (p: Phase) => {
    st.current.phase = p;
    setPhase(p);
  };

  const stopLoop = () => cancelAnimationFrame(raf.current);

  const finish = () => {
    stopLoop();
    const s = st.current;
    const j = judgeTaps(targets, s.taps, tap.bpm);
    setJudge(j);
    setAttempts((n) => n + 1);
    go('result');
    if (!s.reported) {
      s.reported = true;
      props.current.onStep(0, j.pass);
    }
  };

  /** 开始一轮：（听后打先放示范）→ 一小节预备拍 → 打节奏，期间节拍器轻声继续。 */
  const start = async () => {
    stopLoop();
    const run = ++st.current.run;
    const ctx = audio.context;
    if (ctx.state !== 'running') await ctx.resume();
    if (run !== st.current.run) return;
    const listen = !tap.showNotation;
    const demo = listen ? question.events : [];
    const lead = listen ? (tap.countIn * beat + total) : 0; // 示范结束后紧接着预备拍
    const events: NoteEvent[] = [...demo];
    for (let i = 0; i < tap.countIn; i++)
      events.push({ kind: 'click', notes: [], time: lead + i * beat, dur: 0.05, accent: i === 0, velocity: 0.9 });
    const nBeats = Math.round(total / beat);
    for (let i = 0; i < nBeats; i++)
      events.push({ kind: 'click', notes: [], time: lead + (tap.countIn + i) * beat, dur: 0.05, accent: i % 4 === 0, velocity: 0.3 });

    // audio.play 以「调用时的 currentTime + LEAD」为零点；它内部只 await 一次 resume，误差在一个渲染块以内
    const t0 = ctx.currentTime + LEAD;
    void audio.play(events);
    const s = st.current;
    s.start = t0 + lead + tap.countIn * beat; // 节奏型第一拍（AudioContext 时间）
    s.taps = [];
    setTaps([]);
    setJudge(null);
    (document.activeElement as HTMLElement | null)?.blur?.(); // 避免空格触发刚点过的按钮
    go(listen ? 'listen' : 'count');

    // 每帧用最新的时钟对应关系换算（音频时钟刚启动时可能停顿，不能只在开始时算一次）
    const loop = () => {
      const perfNow = performance.now();
      const rel = perfToCtx(ctx, perfNow) - s.start;
      const sp = perfNow - rel * 1000;
      setStartPerf((v) => (Math.abs(v - sp) > 0.5 ? sp : v));
      if (rel >= total + beat * 0.6) return finish();
      setNow(rel);
      const p = listen && rel < -tap.countIn * beat ? 'listen' : rel < 0 ? 'count' : 'tap';
      if (p !== st.current.phase) go(p);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };

  /** 记录一次敲击（AudioContext 时间，已对齐到「听到的」时间轴）。 */
  const hit = (ctxTime: number) => {
    const s = st.current;
    if (s.phase !== 'count' && s.phase !== 'tap') return;
    const rel = ctxTime - s.start;
    if (rel < -beat / 2) return; // 预备拍前半段的敲击不算
    s.taps = [...s.taps, rel];
    setTaps(s.taps);
  };

  // 键盘：捕获阶段处理，空格和字母键不再传给 Quiz（Quiz 用空格重听）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const isTap = e.key === ' ' || /^[a-z]$/i.test(e.key);
      if (!isTap) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      const p = st.current.phase;
      if (p === 'count' || p === 'tap') hit(perfToCtx(audio.context, e.timeStamp));
      else if ((p === 'idle' || p === 'result') && e.key === ' ') void start();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动开始；卸载时停止
  useEffect(() => {
    const t = window.setTimeout(() => void start(), 400);
    return () => {
      window.clearTimeout(t);
      st.current.run++;
      stopLoop();
      clapper.current?.stop();
      clapper.current = null;
      if (st.current.phase !== 'idle' && st.current.phase !== 'result') audio.stopAll();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleClap = async () => {
    if (clapper.current) {
      clapper.current.stop();
      clapper.current = null;
      setClap('off');
      return;
    }
    setClapError(null);
    setClap('starting');
    const l = new ClapListener();
    try {
      await l.start(audio.context, hit);
      clapper.current = l;
      setClap('on');
    } catch {
      l.stop();
      setClap('off');
      setClapError(t('tap.micError'));
    }
  };

  const active = phase === 'listen' || phase === 'count' || phase === 'tap';
  const showScore = tap.showNotation || phase === 'result' || done;
  const status =
    phase === 'listen'
      ? t('tap.listen')
      : phase === 'count'
        ? t('tap.count', { n: Math.min(tap.countIn, Math.max(1, tap.countIn + Math.floor(now / beat) + 1)) })
        : phase === 'tap'
          ? t('tap.go')
          : phase === 'result'
            ? ''
            : t('tap.ready');

  return (
    <div className="tap">
      {showScore && (
        <div className="tap-score">
          <RhythmNotation rhythm={tap.durs} label={question.explain} />
        </div>
      )}

      <button
        type="button"
        className={`tap-pad ${phase}`}
        data-start={startPerf.toFixed(2)}
        data-onsets={targets.map((t) => (t * 1000).toFixed(1)).join(',')}
        onPointerDown={(e) => {
          e.preventDefault();
          if (st.current.phase === 'count' || st.current.phase === 'tap') hit(perfToCtx(audio.context, e.timeStamp));
          else if (st.current.phase !== 'listen') void start();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="tap-status">{status || (judge?.pass ? t('tap.pass') : t('tap.fail'))}</span>
        <span className="tap-hint muted">{active ? t('tap.hintActive') : t('tap.hintIdle')}</span>
      </button>

      <Timeline
        beat={beat}
        total={total}
        now={active ? now : null}
        taps={taps}
        judge={phase === 'result' ? judge : null}
      />

      {phase === 'result' && judge && <Summary judge={judge} first={attempts === 1} />}

      <div className="play-row">
        {phase === 'result' && (
          <>
            <button className="primary" onClick={() => void start()}>
              {t('tap.retry')} <kbd>{t('common.space')}</kbd>
            </button>
            <button onClick={() => void audio.play(question.events)}>{t('tap.demo')}</button>
          </>
        )}
        <button className={clap === 'on' ? 'ghost active' : 'ghost'} onClick={() => void toggleClap()} disabled={clap === 'starting'}>
          {clap === 'on' ? t('tap.clapOff') : t('tap.clapOn')}
        </button>
      </div>
      {clapError && <p className="error">{clapError}</p>}
    </div>
  );
}

function Summary({ judge, first }: { judge: TapJudge; first: boolean }) {
  const t = useT();
  const ms = (s: number) => Math.round(Math.abs(s) * 1000);
  const missed = judge.notes.filter((n) => n.kind === 'miss').length;
  const off = judge.offset;
  const offOk = Math.abs(off) <= judge.tol;
  return (
    <p className="tap-summary">
      {judge.meanAbs !== null && <span>{t('tap.meanAbs', { ms: ms(judge.meanAbs) })}</span>}
      <span className={offOk ? '' : 'tap-bad'}>
        {ms(off) < 5 ? t('tap.steady') : off < 0 ? t('tap.early', { ms: ms(off) }) : t('tap.late', { ms: ms(off) })}
        {!offOk && t('tap.outOfTol')}
      </span>
      {missed > 0 && <span className="tap-bad">{t('tap.missed', { n: missed })}</span>}
      {judge.extras.length > 0 && <span className="tap-bad">{t('tap.extra', { n: judge.extras.length })}</span>}
      <span className="muted">
        {t('tap.tol', { ms: ms(judge.tol) })}
        {first ? '' : t('tap.practice')}
      </span>
    </p>
  );
}

// ───── 时间轴：上排目标起音，下排敲击 ─────

const W = 640;
const H = 96;
const PAD = 16;
const Y_T = 30; // 目标行
const Y_U = 68; // 敲击行

function Timeline({
  beat,
  total,
  now,
  taps,
  judge,
}: {
  beat: number;
  total: number;
  now: number | null;
  taps: number[];
  judge: TapJudge | null;
}) {
  const t = useT();
  const from = -beat / 2;
  const to = total + beat * 0.5;
  const x = (t: number) => PAD + ((Math.max(from, Math.min(to, t)) - from) / (to - from)) * (W - 2 * PAD);
  const nBeats = Math.round(total / beat);
  const color = { ok: 'var(--good)', early: 'var(--accent)', late: 'var(--accent)', miss: 'var(--bad)' };

  const grid = [];
  for (let b = 0; b <= nBeats; b++) {
    const bar = b % 4 === 0;
    grid.push(
      <line
        key={b}
        x1={x(b * beat)}
        x2={x(b * beat)}
        y1={bar ? 8 : 16}
        y2={bar ? H - 8 : H - 16}
        stroke={bar ? 'var(--text-2)' : 'var(--border)'}
        strokeWidth={bar ? 1.4 : 1}
      />,
    );
  }

  return (
    <div className="tap-timeline">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('tap.timelineAria')}>
        {grid}
        <line x1={PAD} x2={W - PAD} y1={Y_U} y2={Y_U} stroke="var(--border)" />
        {judge && (
          <g>
            {judge.notes.map((n, i) => {
              const cx = x(n.t);
              const tx = n.tap === null ? null : x(n.tap);
              return (
                <g key={i} className={`tl-note ${n.kind}`}>
                  <rect
                    x={x(n.t + judge.offset - judge.tol)}
                    width={x(n.t + judge.offset + judge.tol) - x(n.t + judge.offset - judge.tol)}
                    y={Y_U - 9}
                    height={18}
                    rx={4}
                    fill="var(--good-soft)"
                  />
                  {tx !== null && <line x1={cx} y1={Y_T + 6} x2={tx} y2={Y_U - 7} stroke={color[n.kind]} strokeWidth={1.4} />}
                  {n.kind === 'miss' ? (
                    <g stroke="var(--bad)" strokeWidth={2}>
                      <circle cx={cx} cy={Y_T} r={6} fill="none" />
                      <line x1={cx - 4} y1={Y_T - 4} x2={cx + 4} y2={Y_T + 4} />
                      <line x1={cx - 4} y1={Y_T + 4} x2={cx + 4} y2={Y_T - 4} />
                    </g>
                  ) : (
                    <circle cx={cx} cy={Y_T} r={6} fill={color[n.kind]} />
                  )}
                  {tx !== null && <TapMark x={tx} kind={n.kind} />}
                </g>
              );
            })}
            {judge.extras.map((u, i) => (
              <g key={`x${i}`} className="tl-extra" stroke="var(--bad)" strokeWidth={2.4}>
                <line x1={x(u) - 5} y1={Y_U - 5} x2={x(u) + 5} y2={Y_U + 5} />
                <line x1={x(u) - 5} y1={Y_U + 5} x2={x(u) + 5} y2={Y_U - 5} />
              </g>
            ))}
          </g>
        )}
        {!judge && taps.map((u, i) => <circle key={i} cx={x(u)} cy={Y_U} r={5} fill="var(--text-2)" />)}
        {now !== null && now >= from && (
          <line x1={x(now)} x2={x(now)} y1={4} y2={H - 4} stroke="var(--accent)" strokeWidth={2} />
        )}
        <text x={4} y={Y_T + 4} fontSize={10} fill="var(--muted)">
          {t('tap.target')}
        </text>
        <text x={4} y={Y_U - 12} fontSize={10} fill="var(--muted)">
          {t('tap.you')}
        </text>
      </svg>
      {judge && (
        <div className="tap-legend muted">
          <span><i style={{ background: 'var(--good)' }} />{t('tap.legend.ok')}</span>
          <span><b style={{ color: 'var(--accent)' }}>◀</b>{t('tap.legend.early')}</span>
          <span><b style={{ color: 'var(--accent)' }}>▶</b>{t('tap.legend.late')}</span>
          <span><b style={{ color: 'var(--bad)' }}>⊗</b>{t('tap.legend.miss')}</span>
          <span><b style={{ color: 'var(--bad)' }}>✕</b>{t('tap.legend.extra')}</span>
        </div>
      )}
    </div>
  );
}

/** 敲击标记：打准为圆点，偏早为向左三角，偏晚为向右三角。 */
function TapMark({ x, kind }: { x: number; kind: 'ok' | 'early' | 'late' | 'miss' }) {
  if (kind === 'early') return <path d={`M${x - 7} ${Y_U} L${x + 5} ${Y_U - 7} L${x + 5} ${Y_U + 7}Z`} fill="var(--accent)" />;
  if (kind === 'late') return <path d={`M${x + 7} ${Y_U} L${x - 5} ${Y_U - 7} L${x - 5} ${Y_U + 7}Z`} fill="var(--accent)" />;
  return <circle cx={x} cy={Y_U} r={5} fill="var(--good)" />;
}
