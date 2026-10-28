import Dexie, { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import type { Exercise, Routine, Session, SetRow } from './types';
import { SEED } from './seed';

class AppDB extends Dexie {
  exercises!: Dexie.Table<Exercise, string>;
  routines!: Dexie.Table<Routine, string>;
  sessions!: Dexie.Table<Session, string>;
  sets!: Dexie.Table<SetRow, string>;
  meta!: Dexie.Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('gym-tracker');
    this.version(1).stores({
      exercises: 'id, name, archived',
      routines: 'id, name',
      sessions: 'id, date, status, startedAt',
      sets: 'id, sessionId, exerciseId, ts, [exerciseId+ts]',
      meta: 'key',
    });
  }
}

export const db = new AppDB();

export const uid = () => crypto.randomUUID();

export interface Settings {
  weightStep: number;
  theme: 'dark' | 'light';
  sound: boolean;
  vibrate: boolean;
  notify: boolean;
  weeklyTarget: number;
  lastExport: number | null;
}
export const DEFAULTS: Settings = { weightStep: 2.5, theme: 'dark', sound: true, vibrate: true, notify: false, weeklyTarget: 3, lastExport: null };

export async function getSettings(): Promise<Settings> {
  const rows = await db.meta.toArray();
  const out: any = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out;
}
export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.meta.put({ key, value });
  if (key === 'theme') {
    try { localStorage.setItem('theme', value as string); } catch {}
    document.documentElement.dataset.theme = value as string;
  }
}

/** Subscribe a component to a Dexie query; re-renders when underlying tables change. */
export function useLive<T>(fn: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  const [val, setVal] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({ next: setVal, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return val;
}

export async function initDb() {
  const seeded = await db.meta.get('seeded');
  if (!seeded) {
    await db.transaction('rw', db.exercises, db.meta, async () => {
      await db.exercises.bulkPut(SEED);
      await db.meta.put({ key: 'seeded', value: true });
    });
  }
  try { await navigator.storage?.persist?.(); } catch {}
  const s = await getSettings();
  try { localStorage.setItem('theme', s.theme); } catch {}
  document.documentElement.dataset.theme = s.theme;
}
