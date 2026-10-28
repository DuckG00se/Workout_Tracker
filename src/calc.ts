import type { Exercise, SetRow } from './types';

export const e1rm = (w: number, r: number) => (r <= 0 || w <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30));
export const isWork = (s: SetRow) => s.done && !s.warmup;

/** Volume of one set in kg moved. Bodyweight sets count only added load; time sets have none. */
export function setVolume(s: SetRow, type: Exercise['type']) {
  return type === 'wr' || type === 'bw' ? s.weight * s.reps : 0;
}

export function localDate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const fmtKg = (n: number) => (Math.round(n * 100) / 100).toString();
export function fmtDur(sec: number) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtMin(ms: number) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}
export const fmtVol = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)} t` : `${Math.round(n)} kg`);

export function describeSet(s: SetRow, type: Exercise['type']) {
  if (type === 'wr') return `${fmtKg(s.weight)} × ${s.reps}`;
  if (type === 'bw') return s.weight ? `+${fmtKg(s.weight)} × ${s.reps}` : `BW × ${s.reps}`;
  if (type === 'time') return fmtDur(s.duration);
  return `${fmtDur(s.duration)} · ${fmtKg(s.distance)} km`;
}

/** Metrics tracked for PRs per exercise type. */
export function prMetrics(type: Exercise['type']): [string, (s: SetRow) => number][] {
  if (type === 'wr') return [['Weight', (s) => s.weight], ['Est. 1RM', (s) => e1rm(s.weight, s.reps)], ['Set volume', (s) => s.weight * s.reps]];
  if (type === 'bw') return [['Reps', (s) => s.reps], ['Added load', (s) => s.weight]];
  if (type === 'time') return [['Duration', (s) => s.duration]];
  return [['Duration', (s) => s.duration], ['Distance', (s) => s.distance]];
}

export interface PR {
  exerciseId: string;
  name: string;
  label: string;
  value: number;
  prev: number;
  type: Exercise['type'];
}

/** PRs set in `sessionSets` versus earlier history. A lift never done before is not flagged. */
export function findPRs(sessionSets: SetRow[], history: SetRow[], types: Map<string, Exercise['type']>): PR[] {
  const out: PR[] = [];
  const byEx = new Map<string, SetRow[]>();
  for (const s of sessionSets.filter(isWork)) {
    if (!byEx.has(s.exerciseId)) byEx.set(s.exerciseId, []);
    byEx.get(s.exerciseId)!.push(s);
  }
  for (const [exId, sets] of byEx) {
    const type = types.get(exId) ?? 'wr';
    const prior = history.filter((h) => h.exerciseId === exId && isWork(h));
    if (!prior.length) continue;
    for (const [label, fn] of prMetrics(type)) {
      const best = Math.max(...sets.map(fn));
      const prev = Math.max(...prior.map(fn));
      if (best > 0 && best > prev + 1e-9) out.push({ exerciseId: exId, name: sets[0].exerciseName, label, value: best, prev, type });
    }
  }
  return out;
}

export function fmtMetric(label: string, n: number) {
  if (label === 'Duration') return fmtDur(n);
  if (label === 'Reps') return String(n);
  if (label === 'Distance') return `${fmtKg(n)} km`;
  return `${fmtKg(Math.round(n * 10) / 10)} kg`;
}

/** Monday of the week containing `date`, as YYYY-MM-DD. */
export function weekStart(date: string) {
  const d = parseDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}
