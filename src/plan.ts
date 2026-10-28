import { localDate, parseDate } from './calc';

/** The 6-week running block from the 5-Day Hybrid Training Plan. */
export type RunType = 'quality' | 'easy' | 'long' | 'finisher';
export type PhaseKind = 'warmup' | 'hard' | 'easy' | 'run' | 'walk' | 'cooldown';

export interface Phase { kind: PhaseKind; sec: number; say: string; label: string }
export interface RunWalk { runSec: number; walkSec: number }
/** Everything needed to rebuild a run's phases; stored with the running timer. */
export interface RunSpec { type: RunType; week: number; mins?: number; runWalk?: RunWalk | null }

export const TYPE_NAME: Record<RunType, string> = {
  quality: 'Quality run', easy: 'Easy run', long: 'Long run', finisher: 'Conditioning finisher',
};

interface Quality { reps: number; workSec: number; restSec: number; tempo?: boolean }
const QUALITY: Quality[] = [
  { reps: 6, workSec: 60, restSec: 120 },
  { reps: 8, workSec: 60, restSec: 120 },
  { reps: 6, workSec: 120, restSec: 90 },
  { reps: 5, workSec: 180, restSec: 120 },
  { reps: 2, workSec: 480, restSec: 180, tempo: true },
  { reps: 4, workSec: 60, restSec: 120 },
];
const EASY_MIN = [20, 20, 25, 25, 30, 20];
const LONG_MIN = [35, 40, 45, 50, 55, 35];

export const clampWeek = (w: number) => Math.min(6, Math.max(1, w));

/** Plan week for a date: 1-6, then it repeats from week 3 (3,4,5,6,3,4,5,6…). Negative = before the start. */
export function weekFor(startMonday: string, today = localDate()) {
  const days = Math.round((parseDate(today).getTime() - parseDate(startMonday).getTime()) / 86400000);
  const n = Math.floor(days / 7);
  const week = n < 2 ? clampWeek(n + 1) : 3 + ((n - 2) % 4);
  return { week, before: n < 0, daysUntil: -days, cycle: n >= 6 ? Math.floor((n - 2) / 4) + 1 : 1 };
}

export function nextMonday(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + (((8 - x.getDay()) % 7) || 7));
  return localDate(x);
}

export const minsFor = (type: RunType, week: number) =>
  type === 'long' ? LONG_MIN[clampWeek(week) - 1] : type === 'easy' ? EASY_MIN[clampWeek(week) - 1] : 0;

const len = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);
const qualityText = (q: Quality) =>
  q.tempo ? `${q.reps} × ${len(q.workSec)} tempo (RPE 6–7) / ${len(q.restSec)} easy`
    : `${q.reps} × ${len(q.workSec)} hard / ${len(q.restSec)} easy`;

/** Reminders from the plan PDF that the timer can't do for you. */
export function runNote(type: RunType, week: number) {
  if (type === 'quality') return `${week >= 3 ? 'Add 2–4 × 15 s relaxed strides to the warm-up. ' : ''}Afterwards, core: side plank 3 × 30 s per side, bird dog 3 × 8 per side. Shins or knees complaining? Do the intervals on a bike or rower.`;
  if (type === 'easy') return 'Do this after your upper-body lifting. Full sentences, RPE 3–4. Legs still tired? Walk on an incline instead.';
  if (type === 'long') return 'Run-walk is fully allowed; shrink the walk breaks as you get fitter. Keep it conversational, then light calf and hip stretches.';
  return 'Air bike, rower or ski erg: low-impact, so your legs stay fresh for Saturday.';
}

export function describe(type: RunType, week: number, opts: { mins?: number; runWalk?: RunWalk | null } = {}) {
  if (type === 'quality') return `10 min warm-up · ${qualityText(QUALITY[clampWeek(week) - 1])} · 5 min cool-down`;
  if (type === 'finisher') return '10 rounds: 30 s hard (RPE 8) / 60 s easy';
  const mins = opts.mins ?? minsFor(type, week);
  const rw = opts.runWalk ? ` · run ${opts.runWalk.runSec / 60} / walk ${opts.runWalk.walkSec / 60} min` : '';
  return `${mins} min at RPE 3–4${rw}${type === 'long' ? ' · 5 min walk to cool down' : ''}`;
}

const min = (s: number) => (s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`);

export function buildPhases(spec: RunSpec): Phase[] {
  const out: Phase[] = [];
  const week = clampWeek(spec.week);
  if (spec.type === 'quality') {
    const q = QUALITY[week - 1];
    out.push({ kind: 'warmup', sec: 600, say: 'Warm up. Easy jog for ten minutes.', label: 'Warm-up' });
    // (from week 3 the plan adds relaxed strides here; shown as a note on the start sheet)
    for (let i = 1; i <= q.reps; i++) {
      const tag = `${i} of ${q.reps}`;
      out.push({ kind: 'hard', sec: q.workSec, say: `${q.tempo ? 'Tempo' : 'Hard'}. Rep ${tag}. ${min(q.workSec)}.`, label: `${q.tempo ? 'Tempo' : 'Hard'} ${tag}` });
      if (i < q.reps) out.push({ kind: 'easy', sec: q.restSec, say: `Easy. Walk or jog. ${min(q.restSec)}.`, label: `Easy ${tag}` });
    }
    out.push({ kind: 'cooldown', sec: 300, say: 'Cool down. Walk until your breathing settles.', label: 'Cool-down' });
  } else if (spec.type === 'finisher') {
    for (let i = 1; i <= 10; i++) {
      out.push({ kind: 'hard', sec: 30, say: `Hard. Round ${i} of 10.`, label: `Hard ${i} of 10` });
      if (i < 10) out.push({ kind: 'easy', sec: 60, say: 'Easy.', label: `Easy ${i} of 10` });
    }
  } else {
    const total = (spec.mins ?? minsFor(spec.type, week)) * 60;
    const rw = spec.runWalk;
    if (rw) {
      let used = 0, i = 1;
      while (total - used >= 10) {
        const runSec = Math.min(rw.runSec, total - used);
        out.push({ kind: 'run', sec: runSec, say: `Run. ${min(runSec)}.`, label: `Run ${i}` });
        used += runSec;
        if (total - used < 10) break;
        const walkSec = Math.min(rw.walkSec, total - used);
        out.push({ kind: 'walk', sec: walkSec, say: `Walk. ${min(walkSec)}.`, label: `Walk ${i}` });
        used += walkSec;
        i++;
      }
    } else {
      out.push({ kind: 'run', sec: total, say: `Easy run. ${total / 60} minutes. Keep it conversational.`, label: 'Easy run' });
    }
    if (spec.type === 'long') out.push({ kind: 'cooldown', sec: 300, say: 'Cool down. Walk for five minutes.', label: 'Cool-down' });
  }
  return out;
}

/* ---------- cues ---------- */
export type Tone = 'warmup' | 'hard' | 'run' | 'easy' | 'walk' | 'cooldown' | 'tick' | 'half' | 'done';
export interface Cue { at: number; tone: Tone; say?: string; vibrate?: number[]; phase: number }

/** All sound/voice cues for a run, as seconds from the start. */
export function buildCues(phases: Phase[]): Cue[] {
  const cues: Cue[] = [];
  let t = 0;
  phases.forEach((p, i) => {
    const hard = p.kind === 'hard' || p.kind === 'run';
    cues.push({ at: t, tone: p.kind, say: p.say, vibrate: hard ? [200, 100, 200, 100, 200] : [500], phase: i });
    if (p.sec >= 300) {
      cues.push({ at: t + p.sec / 2, tone: 'half', say: 'Halfway.', phase: i });
      cues.push({ at: t + p.sec - 60, tone: 'half', say: 'One minute left.', phase: i });
    }
    if (p.sec >= 8) for (const k of [3, 2, 1]) cues.push({ at: t + p.sec - k, tone: 'tick', phase: i });
    t += p.sec;
  });
  cues.push({ at: t, tone: 'done', say: 'Done. Great work.', vibrate: [300, 120, 300, 120, 600], phase: phases.length });
  return cues.sort((a, b) => a.at - b.at);
}

export const totalSec = (phases: Phase[]) => phases.reduce((a, p) => a + p.sec, 0);
