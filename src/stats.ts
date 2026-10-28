import type { Exercise, Session, SetRow } from './types';
import { e1rm, fmtDur, fmtKg, isWork, localDate, parseDate, weekStart } from './calc';

export const MIN_WEEK = 3; // a week "counts" toward the streak with at least this many sessions

export const prevWeek = (wk: string) => {
  const d = parseDate(wk);
  d.setDate(d.getDate() - 7);
  return localDate(d);
};

export interface WeekCount { start: string; count: number }

/** Sessions per Monday-based week for the last `n` weeks, oldest first (current week last). */
export function weeklyCounts(sessions: Session[], n: number, today = localDate()): WeekCount[] {
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(weekStart(s.date), (counts.get(weekStart(s.date)) ?? 0) + 1);
  const out: WeekCount[] = [];
  let wk = weekStart(today);
  for (let i = 0; i < n; i++) {
    out.unshift({ start: wk, count: counts.get(wk) ?? 0 });
    wk = prevWeek(wk);
  }
  return out;
}

/**
 * Consecutive weeks with >= MIN_WEEK sessions. The current week is counted once it qualifies,
 * but does not break the streak while it is still in progress.
 */
export function streaks(sessions: Session[], today = localDate()) {
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(weekStart(s.date), (counts.get(weekStart(s.date)) ?? 0) + 1);
  const cur = weekStart(today);
  let current = 0;
  if ((counts.get(cur) ?? 0) >= MIN_WEEK) current++;
  for (let w = prevWeek(cur); (counts.get(w) ?? 0) >= MIN_WEEK; w = prevWeek(w)) current++;

  let best = 0, run = 0;
  if (counts.size) {
    const first = [...counts.keys()].sort()[0];
    const weeks: string[] = [];
    for (let w = cur; w >= first; w = prevWeek(w)) weeks.unshift(w);
    for (const w of weeks) {
      if ((counts.get(w) ?? 0) >= MIN_WEEK) best = Math.max(best, ++run);
      else if (w !== cur) run = 0;
    }
  }
  return { current, best, thisWeek: counts.get(cur) ?? 0 };
}

/** Working sets per muscle for the week starting `wk`. Primary (first-listed) muscle counts 1, others 0.5. */
export function muscleSets(sets: SetRow[], sessions: Session[], exercises: Exercise[], wk: string) {
  const dates = new Map(sessions.map((s) => [s.id, s.date]));
  const ex = new Map(exercises.map((e) => [e.id, e]));
  const out = new Map<string, number>();
  for (const s of sets) {
    if (!isWork(s)) continue;
    const d = dates.get(s.sessionId);
    if (!d || weekStart(d) !== wk) continue;
    ex.get(s.exerciseId)?.muscles.forEach((m, i) => out.set(m, (out.get(m) ?? 0) + (i === 0 ? 1 : 0.5)));
  }
  return out;
}

/* ---------- per-exercise series ---------- */
export interface Metric { key: string; label: string; unit: string; pick: (sets: SetRow[]) => number; fmt: (n: number) => string }
const kg = (n: number) => `${fmtKg(Math.round(n * 10) / 10)} kg`;
const max = (f: (s: SetRow) => number) => (sets: SetRow[]) => Math.max(0, ...sets.map(f));
const sum = (f: (s: SetRow) => number) => (sets: SetRow[]) => sets.reduce((a, s) => a + f(s), 0);

export function metricsFor(type: Exercise['type']): Metric[] {
  if (type === 'wr') return [
    { key: 'e1rm', label: 'Est. 1RM', unit: 'kg', pick: max((s) => e1rm(s.weight, s.reps)), fmt: kg },
    { key: 'best', label: 'Best set', unit: 'kg', pick: max((s) => s.weight), fmt: kg },
    { key: 'vol', label: 'Volume', unit: 'kg', pick: sum((s) => s.weight * s.reps), fmt: (n) => `${Math.round(n)} kg` },
  ];
  if (type === 'bw') return [
    { key: 'reps', label: 'Best reps', unit: 'reps', pick: max((s) => s.reps), fmt: (n) => `${n} reps` },
    { key: 'load', label: 'Added load', unit: 'kg', pick: max((s) => s.weight), fmt: kg },
    { key: 'vol', label: 'Total reps', unit: 'reps', pick: sum((s) => s.reps), fmt: (n) => `${n} reps` },
  ];
  if (type === 'time') return [
    { key: 'long', label: 'Longest', unit: 's', pick: max((s) => s.duration), fmt: fmtDur },
    { key: 'total', label: 'Total time', unit: 's', pick: sum((s) => s.duration), fmt: fmtDur },
  ];
  return [
    { key: 'long', label: 'Longest', unit: 's', pick: max((s) => s.duration), fmt: fmtDur },
    { key: 'dist', label: 'Distance', unit: 'km', pick: sum((s) => s.distance), fmt: (n) => `${fmtKg(n)} km` },
  ];
}

export interface Point { x: number; date: string; v: number; sets: SetRow[] }

/** One point per session for an exercise, oldest first, from working sets only. */
export function series(exSets: SetRow[], sessions: Session[], metric: Metric): Point[] {
  const byS = new Map(sessions.map((s) => [s.id, s]));
  const groups = new Map<string, SetRow[]>();
  for (const s of exSets) {
    if (!isWork(s) || !byS.has(s.sessionId)) continue;
    if (!groups.has(s.sessionId)) groups.set(s.sessionId, []);
    groups.get(s.sessionId)!.push(s);
  }
  return [...groups.entries()]
    .map(([id, sets]) => ({ x: Math.floor(byS.get(id)!.startedAt / 1000), date: byS.get(id)!.date, v: metric.pick(sets), sets }))
    .filter((p) => p.v > 0)
    .sort((a, b) => a.x - b.x);
}

/* ---------- PR table ---------- */
export interface PRRow { label: string; value: number; fmt: (n: number) => string; date: string; detail: string }
export interface PRExercise { exercise: Exercise; rows: PRRow[]; lastDate: string }

export function prTable(sets: SetRow[], sessions: Session[], exercises: Exercise[]): PRExercise[] {
  const dates = new Map(sessions.map((s) => [s.id, s.date]));
  const out: PRExercise[] = [];
  for (const ex of exercises) {
    const mine = sets.filter((s) => s.exerciseId === ex.id && isWork(s) && dates.has(s.sessionId));
    if (!mine.length) continue;
    const rows: PRRow[] = [];
    const add = (label: string, f: (s: SetRow) => number, fmt: (n: number) => string, det: (s: SetRow) => string) => {
      // Earliest set that reached the max (a repeat does not move the date); ties in a session prefer more reps.
      let best: SetRow | null = null, bv = 0;
      for (const s of [...mine].sort((a, b) => a.ts - b.ts || b.reps - a.reps)) { const v = f(s); if (v > bv + 1e-9) { bv = v; best = s; } }
      if (best) rows.push({ label, value: bv, fmt, date: dates.get(best.sessionId)!, detail: det(best) });
    };
    const wxr = (s: SetRow) => `${fmtKg(s.weight)} kg × ${s.reps}`;
    if (ex.type === 'wr') {
      add('Est. 1RM', (s) => e1rm(s.weight, s.reps), kg, wxr);
      add('Heaviest', (s) => s.weight, kg, wxr);
      add('Set volume', (s) => s.weight * s.reps, (n) => `${Math.round(n)} kg`, wxr);
    } else if (ex.type === 'bw') {
      add('Most reps', (s) => s.reps, (n) => `${n}`, (s) => (s.weight ? `+${fmtKg(s.weight)} kg` : 'bodyweight'));
      add('Added load', (s) => s.weight, kg, wxr);
    } else {
      add('Longest', (s) => s.duration, fmtDur, (s) => (ex.type === 'timedist' ? `${fmtKg(s.distance)} km` : ''));
      if (ex.type === 'timedist') add('Distance', (s) => s.distance, (n) => `${fmtKg(n)} km`, (s) => fmtDur(s.duration));
    }
    if (rows.length) out.push({ exercise: ex, rows, lastDate: rows.map((r) => r.date).sort().pop()! });
  }
  return out.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.exercise.name.localeCompare(b.exercise.name));
}
