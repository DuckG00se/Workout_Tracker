import Dexie, { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import type { Exercise, Routine, Session, SetRow } from './types';
import { PLAN_ROUTINES, SEED } from './seed';

export interface Tombstone { key: string; tbl: string; id: string; deletedAt: number }

class AppDB extends Dexie {
  exercises!: Dexie.Table<Exercise, string>;
  routines!: Dexie.Table<Routine, string>;
  sessions!: Dexie.Table<Session, string>;
  sets!: Dexie.Table<SetRow, string>;
  meta!: Dexie.Table<{ key: string; value: unknown }, string>;
  tombstones!: Dexie.Table<Tombstone, string>;

  constructor() {
    super('gym-tracker');
    this.version(1).stores({
      exercises: 'id, name, archived',
      routines: 'id, name',
      sessions: 'id, date, status, startedAt',
      sets: 'id, sessionId, exerciseId, ts, [exerciseId+ts]',
      meta: 'key',
    });
    // v2: every synced record carries `updatedAt` (last local or remote change); deletes leave a tombstone.
    this.version(2)
      .stores({
        exercises: 'id, name, archived, updatedAt',
        routines: 'id, name, updatedAt',
        sessions: 'id, date, status, startedAt, updatedAt',
        sets: 'id, sessionId, exerciseId, ts, [exerciseId+ts], updatedAt',
        meta: 'key',
        tombstones: 'key, deletedAt',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        // Built-in exercises get 0 so they never override an edited copy from another device.
        await tx.table('exercises').toCollection().modify((e: any) => { e.updatedAt = String(e.id).startsWith('ex-') ? 0 : now; });
        for (const t of ['routines', 'sessions', 'sets']) await tx.table(t).toCollection().modify((r: any) => { r.updatedAt = now; });
      });
  }
}

export const db = new AppDB();

export const uid = () => crypto.randomUUID();

/* ---------- change tracking for sync ---------- */
export const SYNCED_TABLES = ['exercises', 'routines', 'sessions', 'sets'] as const;

let writeListener: () => void = () => {};
export const onLocalWrite = (fn: () => void) => { writeListener = fn; };

/** Keys whose delete came from a remote device: they must not leave a (newer) local tombstone. */
export const remoteDeletes = new Set<string>();

for (const name of SYNCED_TABLES) {
  const table = db.table(name);
  table.hook('creating', (_pk, obj: any) => {
    if (obj.updatedAt === undefined) obj.updatedAt = Date.now();
    writeListener();
  });
  table.hook('updating', (mods: any) => {
    writeListener();
    // Writes that already carry updatedAt (remote apply, explicit touch) keep it; everything else is a local edit.
    return 'updatedAt' in mods ? undefined : { updatedAt: Date.now() };
  });
  table.hook('deleting', (pk) => {
    writeListener();
    const id = String(pk);
    const key = `${name}:${id}`;
    if (remoteDeletes.has(key)) return;
    // Hooks cannot await other tables, so record the tombstone right after this operation.
    setTimeout(() => Dexie.ignoreTransaction(() => db.tombstones.put({ key, tbl: name, id, deletedAt: Date.now() })).catch(() => {}), 0);
  });
}

export interface Settings {
  weightStep: number;
  theme: 'dark' | 'light';
  sound: boolean;
  vibrate: boolean;
  notify: boolean;
  voice: boolean;
  weeklyTarget: number;
  lastExport: number | null;
  runPlanStart: string | null; // Monday of plan week 1 (this device only)
}
export const DEFAULTS: Settings = { weightStep: 2.5, theme: 'dark', sound: true, vibrate: true, notify: false, voice: true, weeklyTarget: 3, lastExport: null, runPlanStart: null };

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
  } else {
    // Built-ins added in later versions (never touches ones you already have or edited).
    const have = new Set(await db.exercises.toCollection().primaryKeys());
    const fresh = SEED.filter((e) => !have.has(e.id));
    if (fresh.length) await db.exercises.bulkAdd(fresh);
  }
  if (!(await db.meta.get('planRoutines'))) {
    // updatedAt 0, like built-in exercises: any real edit (on any device) wins, and devices don't fight over them.
    const have = new Set(await db.routines.toCollection().primaryKeys());
    await db.routines.bulkAdd(PLAN_ROUTINES.filter((r) => !have.has(r.id)));
    await db.meta.put({ key: 'planRoutines', value: true });
  }
  try { await navigator.storage?.persist?.(); } catch {}
  const s = await getSettings();
  try { localStorage.setItem('theme', s.theme); } catch {}
  document.documentElement.dataset.theme = s.theme;
}
