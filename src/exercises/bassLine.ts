// 低音线听写：终止式之后听一段四部和声进行，逐个写出每个和弦的低音（首调唱名 / 简谱级数，含 ♯4 等变化音）。
// 进行与声部沿用和声听写（harmony.ts）的功能和声文法与声部进行；考点是和弦（统计「哪种和弦的低音听不准」），
// 作答的选项是低音的级数。转位、属七转位、经过和弦使低音线以级进为主，副属和弦的第一转位带出 fi（♯4）。

import type { NoteEvent } from '../audio/engine';
import type { ExerciseDef, Level, Settings } from '../engine/types';
import { t } from '../i18n';
import { DEGREES, MODE_BY_ID, keyLabel, mod, nameInSystem, type ModeDef } from '../music/theory';
import { BASS_RANGE, CHORDS, HARD, LEVEL_KEYS, NEEDS, harmonyScore, minorSkip, sequence, voiceProgression, type HarmonyChord, type Key } from './harmony';
import { cadenceEvents, chooseTonic, degreeMidiAnswer, level, modeItem, option } from './common';
import { degreeChoices, semi } from './degrees';

// ───────────── 和弦（考点） ─────────────

/** 一个考点：和声听写的和弦，或其转位变体（副属和弦的第一转位，低音 fi） */
interface BassChord {
  /** 考点 id，如 'V65'、'minor:iio6'、'V6/V' */
  id: string;
  /** 文法用的键（变体按原位副属和弦接续） */
  gk: Key;
  chord: HarmonyChord;
  /** 低音相对主音的半音数 */
  bass: number;
}

const bassOf = (c: HarmonyChord) => mod(c.tones[c.inv], 12);

/** 副属和弦的第一转位：Ⅴ⁶/Ⅴ、Ⅴ⁶₅/Ⅴ（低音 fi 上行到 sol） */
const VARIANTS: { key: string; gk: Key; label: string }[] = [
  { key: 'V6/V', gk: 'V/V', label: 'Ⅴ⁶/Ⅴ' },
  { key: 'V65/V', gk: 'V7/V', label: 'Ⅴ⁶₅/Ⅴ' },
];

type ModeKey = 'major' | 'minor';

function buildTable(m: ModeKey): BassChord[] {
  const mode = MODE_BY_ID[m];
  const base = Object.values(CHORDS[m]).map((c) => ({ id: c.id, gk: c.key, chord: c, bass: bassOf(c) }));
  const extra = VARIANTS.map(({ key, gk, label }) => {
    const chord: HarmonyChord = { ...CHORDS[m][gk], id: modeItem(mode, key), label, inv: 1 };
    return { id: chord.id, gk, chord, bass: bassOf(chord) };
  });
  return [...base, ...extra];
}

const TABLE: Record<ModeKey, BassChord[]> = { major: buildTable('major'), minor: buildTable('minor') };
const BY_ID: Record<string, BassChord> = Object.fromEntries([...TABLE.major, ...TABLE.minor].map((c) => [c.id, c]));
/** 文法键对应的和声听写和弦（不含变体） */
const rootOf = (m: ModeKey, gk: Key): BassChord => BY_ID[CHORDS[m][gk].id];

/** 各级别新增的考点：沿用和声听写的级别，副属和弦一级加上第一转位（低音 fi） */
function levelIds(m: ModeKey): string[][] {
  const mode = MODE_BY_ID[m];
  const layers = LEVEL_KEYS[m].map((keys) => keys.map((k) => CHORDS[m][k].id));
  layers[layers.length - 1] = [...layers[layers.length - 1], ...VARIANTS.map((v) => modeItem(mode, v.key))];
  return layers;
}

/** 级别名：和弦 + 本级新出现的低音，如「+ Ⅰ⁶ · Ⅳ⁶ · Ⅴ⁶ · ⅱ⁶ (mi ti)」 */
function bassLevels(m: ModeKey): Level[] {
  const seen = new Set<number>();
  return levelIds(m).map((ids, i) => {
    const fresh = [...new Set(ids.map((id) => BY_ID[id].bass))].filter((b) => !seen.has(b)).sort((a, b) => a - b);
    for (const b of fresh) seen.add(b);
    const names = fresh.map((b) => DEGREES[b].movableDo).join(' ');
    return level(() => `${i ? '+ ' : ''}${ids.map((id) => BY_ID[id].chord.label).join(' · ')}${names ? ` (${names})` : ''}`, ids);
  });
}

/** 低音的选项 id（与调内音级相同的 'd7' / 'minor:d8'） */
const degreeId = (mode: ModeDef, bass: number) => modeItem(mode, `d${bass}`);

/** 低音在当前唱名体系中的名称 */
const bassName = (bass: number, tonicPc: number, settings: Settings, mode: ModeDef) => nameInSystem(tonicPc + bass, tonicPc, settings.naming, mode);

// ───────────── 出题 ─────────────

/**
 * 把文法给出的进行（键）落实为考点：同一个键可能有几个启用的变体（如 Ⅴ/Ⅴ 与 Ⅴ⁶/Ⅴ）。
 * 低音 fi 的变体不接在 Ⅰ 之后（低音 do–fi 是增四度跳进），小调里也不接在 Ⅵ 之后（le–fi 是减三度）。target 必须出现在第 2 个及之后，做不到时返回 null。
 */
function realize(keys: Key[], variants: Map<Key, BassChord[]>, target: BassChord, m: ModeKey): BassChord[] | null {
  const allowed = (i: number) => {
    const opts = variants.get(keys[i]) ?? [rootOf(m, keys[i])];
    return opts.filter((c) => !(c.bass === 6 && (keys[i - 1] === 'I' || (m === 'minor' && keys[i - 1] === 'vi'))));
  };
  const slots = keys.flatMap((k, i) => (i > 0 && k === target.gk && allowed(i).includes(target) ? [i] : []));
  if (!slots.length) return null;
  const at = slots[Math.floor(Math.random() * slots.length)];
  const out: BassChord[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (i === at) {
      out.push(target);
      continue;
    }
    const opts = allowed(i);
    if (!opts.length) return null;
    out.push(opts[Math.floor(Math.random() * opts.length)]);
  }
  return out;
}

/** 低音线的「好听程度」：级进（含半音）越多越好，同音反复与大跳略扣分 */
function bassScore(seq: BassChord[]): number {
  let s = 0;
  for (let i = 1; i < seq.length; i++) {
    const d = mod(seq[i].bass - seq[i - 1].bass, 12);
    const step = Math.min(d, 12 - d);
    s += step === 0 ? -0.5 : step <= 2 ? 1 : step === 6 ? -1 : 0;
  }
  return s;
}

/** 低音加强：低音单独一个事件、力度大，上方三声部力度小；均衡：整个和弦一个事件 */
function playEvents(vs: number[][], boost: boolean): NoteEvent[] {
  return vs.flatMap(([bass, ...upper], i) => {
    const time = i * BEAT;
    const dur = BEAT * 0.95;
    return boost
      ? [
          { notes: [bass], time, dur, velocity: 0.9 },
          { notes: upper, time, dur, velocity: 0.55 },
        ]
      : [{ notes: [bass, ...upper], time, dur }];
  });
}

const BEAT = 1.2;
/** 每题生成几条候选进行，取低音线最好的一条（转位多的级别更容易出级进的低音线） */
const CANDIDATES = 3;

const modeKey = (options: Record<string, string>): ModeKey => (options.mode === 'minor' ? 'minor' : 'major');

export const bassLine: ExerciseDef = {
  id: 'bassLine',
  get title() {
    return t('ex.bassLine.title');
  },
  get subtitle() {
    return t('ex.bassLine.subtitle');
  },
  icon: '𝄢',
  group: 'tonal',
  heavy: true,
  levels: bassLevels('major'),
  levelsFor: (options) => bassLevels(modeKey(options)),
  options: [
    option(
      'mode',
      'opt.mode',
      [
        ['major', 'mode.major.name'],
        ['minor', 'ex.harmony.minor'],
      ],
      'major',
      true,
    ),
    option(
      'len',
      'ex.harmony.len',
      [
        ['4', 'ex.harmony.len.4'],
        ['6', 'ex.harmony.len.6'],
      ],
      '4',
    ),
    option(
      'bass',
      'ex.bassLine.bass',
      [
        ['boost', 'ex.bassLine.bass.boost'],
        ['even', 'ex.bassLine.bass.even'],
      ],
      'boost',
    ),
  ],
  itemLabel: (it, s) => {
    const c = BY_ID[it];
    if (!c) return it;
    return `${c.chord.label} (${bassName(c.bass, 0, s, c.chord.minor ? MODE_BY_ID.minor : MODE_BY_ID.major)})`;
  },
  generate(item, ctx) {
    const m = modeKey(ctx.options);
    const minor = m === 'minor';
    const mode = MODE_BY_ID[m];
    const tonic = chooseTonic(ctx.settings);
    const keyPc = mod(tonic, 12);
    const len = ctx.options.len === '6' ? 6 : 4;
    const boost = ctx.options.bass !== 'even';
    const mine = (id: string) => !!BY_ID[id] && BY_ID[id].chord.minor === minor;
    const target = mine(item) ? BY_ID[item] : rootOf(m, 'I');
    // 启用的考点（+ 原位 Ⅰ Ⅳ Ⅴ 与解决所需的和弦），按文法键分组
    const enabled = [target, ...ctx.items.filter(mine).map((id) => BY_ID[id])];
    for (const k of ['I', 'IV', 'V'] as Key[]) enabled.push(rootOf(m, k));
    for (const c of [...enabled]) for (const n of NEEDS[c.gk] ?? []) enabled.push(rootOf(m, n));
    const variants = new Map<Key, BassChord[]>();
    for (const c of enabled) {
      const list = variants.get(c.gk) ?? [];
      if (!list.includes(c)) list.push(c);
      variants.set(c.gk, list);
    }
    const vocab = [...variants.keys()];
    const all = LEVEL_KEYS[m].flat();
    const skip = minor ? minorSkip : undefined;
    // 取几条合法进行中低音线最好的；极少数排不出合规声部时换一条
    let seq: BassChord[] = [];
    let voicings: number[][] = [];
    for (let tries = 0, cost = Infinity; tries < 20 && cost >= HARD; tries++) {
      let best: BassChord[] | null = null;
      for (let k = 0, guard = 0; k < CANDIDATES && guard < 30; guard++) {
        const keys = sequence(len, vocab, target.gk, Math.random, skip) ?? sequence(len, all, target.gk, Math.random, skip)!;
        const r = realize(keys, variants, target, m);
        if (!r) continue;
        k++;
        if (!best || bassScore(r) > bassScore(best)) best = r;
      }
      seq = best ?? sequence(len, all, target.gk, Math.random, skip)!.map((k) => rootOf(m, k));
      ({ voicings, cost } = voiceProgression(
        seq.map((c) => c.chord),
        keyPc,
      ));
    }
    const chords = seq.map((c) => c.chord);
    // 选项：启用的（及本题用到的）和弦的低音，按级数排列
    const choiceIds = [...new Set([...enabled, ...seq].map((c) => degreeId(mode, c.bass)))];
    const choices = degreeChoices(choiceIds, ctx.settings, keyPc);
    const answer = voicings.map((v) => degreeId(mode, mod(v[0] - keyPc, 12)));
    const name = (b: number) => bassName(b, keyPc, ctx.settings, mode);
    return {
      item: target.id,
      prelude: cadenceEvents(tonic, mode),
      events: playEvents(voicings, boost),
      // 把第 step 个和弦的低音换成所选级数（取离原低音最近的那个音），上方三声部不变
      choiceEvents: (id, step = 0) => {
        if (id === answer[step] || !voicings[step]) return playEvents(voicings, boost);
        const orig = voicings[step][0];
        const d = mod(keyPc + semi(id) - orig, 12);
        let note = orig + (d > 6 ? d - 12 : d);
        if (note < BASS_RANGE[0]) note += 12;
        if (note >= voicings[step][1]) note -= 12;
        return playEvents(
          voicings.map((v, i) => (i === step ? [note, ...v.slice(1)] : v)),
          boost,
        );
      },
      midiAnswer: degreeMidiAnswer(
        choices.map((c) => c.id),
        tonic,
      ),
      choices,
      answer,
      stepItems: seq.map((c) => c.id),
      score: harmonyScore(chords, voicings, keyPc, mode),
      prompt: t('ex.bassLine.prompt', { key: keyLabel(keyPc, mode), n: len, first: name(0) }),
      explain: t('ex.bassLine.explain', {
        bass: seq.map((c) => name(c.bass)).join(' – '),
        chords: chords.map((c) => c.label).join(' → '),
      }),
    };
  },
};
