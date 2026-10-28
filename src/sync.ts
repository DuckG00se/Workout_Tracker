import { useEffect, useState } from 'preact/hooks';
import { db, onLocalWrite, remoteDeletes, SYNCED_TABLES } from './db';

/**
 * Offline-first sync. The local IndexedDB stays the source of truth; this pushes local changes to the
 * Worker API and pulls everyone else's. Conflicts: newest `updatedAt` wins per record.
 * Only finished sessions (and their sets), exercises and routines sync; an active workout stays on its device.
 */

const CHUNK = 40; // D1 free tier allows ~50 queries per request: 40 upserts + 1 read
const AUTO_MIN_GAP = 15_000;

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'auth' | 'error';
export interface SyncState { status: SyncStatus; last: number | null; error?: string; progress?: string }

let state: SyncState = { status: 'off', last: null };
const listeners = new Set<() => void>();
const set = (p: Partial<SyncState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };

export function useSync() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return state;
}

/* ---------- meta helpers ---------- */
const getMeta = async <T>(k: string): Promise<T | undefined> => (await db.meta.get(k))?.value as T | undefined;
const setMeta = (k: string, value: unknown) => db.meta.put({ key: k, value });
export const SYNC_META_KEYS = ['syncKey', 'syncCursor', 'syncLastPush', 'syncLast'];

export const getSyncKey = () => getMeta<string>('syncKey');

export function generateKey() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------- wire format ---------- */
interface Change { t: string; id: string; u: number; d: 0 | 1; data: string | null }
interface PullResult { records: Change[]; cursor: number; more: boolean }

class SyncError extends Error {
  constructor(public kind: 'auth' | 'server' | 'offline', msg: string) { super(msg); }
}

async function call(key: string, since: number, changes: Change[]): Promise<PullResult> {
  let res: Response;
  try {
    res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ since, changes }),
    });
  } catch {
    throw new SyncError('offline', 'No connection');
  }
  if (res.status === 401) throw new SyncError('auth', 'The server rejected this key');
  if (res.status === 503) throw new SyncError('server', 'The server has no SYNC_KEY set yet');
  if (!res.ok) throw new SyncError('server', `Server error ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) throw new SyncError('server', 'Sync API not found on this site');
  return res.json();
}

/* ---------- collect local changes ---------- */
async function collectChanges(lastPush: number): Promise<Change[]> {
  const out: Change[] = [];
  const doneIds = new Set(await db.sessions.where('status').equals('done').primaryKeys());
  const add = (t: string, r: any) => out.push({ t, id: r.id, u: r.updatedAt, d: 0, data: JSON.stringify(r) });

  for (const r of await db.exercises.where('updatedAt').above(lastPush).toArray()) add('exercises', r);
  for (const r of await db.routines.where('updatedAt').above(lastPush).toArray()) add('routines', r);
  for (const r of await db.sessions.where('updatedAt').above(lastPush).toArray()) if (r.status === 'done') add('sessions', r);
  for (const r of await db.sets.where('updatedAt').above(lastPush).toArray()) if (doneIds.has(r.sessionId)) add('sets', r);
  for (const t of await db.tombstones.where('deletedAt').above(lastPush).toArray()) out.push({ t: t.tbl, id: t.id, u: t.deletedAt, d: 1, data: null });
  return out;
}

/* ---------- apply remote changes ---------- */
async function applyRemote(r: Change) {
  if (!(SYNCED_TABLES as readonly string[]).includes(r.t)) return;
  const table = db.table(r.t);
  const key = `${r.t}:${r.id}`;
  const local = await table.get(r.id);
  const tomb = await db.tombstones.get(key);
  const localTime = Math.max(local?.updatedAt ?? -1, tomb?.deletedAt ?? -1);
  if (r.u <= localTime) return; // our copy is as new or newer; it will be pushed instead

  if (r.d) {
    if (local) {
      remoteDeletes.add(key);
      try { await table.delete(r.id); } finally { remoteDeletes.delete(key); }
    }
    await db.tombstones.put({ key, tbl: r.t, id: r.id, deletedAt: r.u });
  } else if (r.data) {
    const rec = JSON.parse(r.data);
    if (r.t === 'sessions' && rec.status !== 'done') return;
    rec.updatedAt = r.u;
    await table.put(rec);
    if (tomb) await db.tombstones.delete(key);
  }
}

/* ---------- the sync run ---------- */
let running = false;
let again = false;
let lastRun = 0;

export async function syncNow(): Promise<void> {
  const key = await getSyncKey();
  if (!key) { set({ status: 'off' }); return; }
  if (running) { again = true; return; }
  running = true;
  lastRun = Date.now();
  set({ status: 'syncing', error: undefined, progress: undefined });
  try {
    const startedAt = Date.now();
    const lastPush = (await getMeta<number>('syncLastPush')) ?? -1;
    let cursor = (await getMeta<number>('syncCursor')) ?? 0;
    const changes = await collectChanges(lastPush);
    const chunks = Math.max(1, Math.ceil(changes.length / CHUNK));

    for (let i = 0; i < chunks; i++) {
      if (chunks > 1) set({ progress: `Uploading ${Math.min(changes.length, (i + 1) * CHUNK)} / ${changes.length}` });
      let res = await call(key, cursor, changes.slice(i * CHUNK, (i + 1) * CHUNK));
      for (;;) {
        for (const r of res.records) await applyRemote(r);
        cursor = Math.max(cursor, res.cursor);
        if (!res.more) break;
        res = await call(key, cursor, []);
      }
    }
    // Re-push a 1 s overlap next time; upserts are idempotent.
    await setMeta('syncLastPush', startedAt - 1000);
    await setMeta('syncCursor', cursor);
    await setMeta('syncLast', Date.now());
    set({ status: 'idle', last: Date.now(), progress: undefined });
  } catch (e) {
    const err = e as SyncError;
    if (err.kind === 'offline') set({ status: 'offline', progress: undefined });
    else if (err.kind === 'auth') set({ status: 'auth', error: err.message, progress: undefined });
    else set({ status: 'error', error: err.message || 'Sync failed', progress: undefined });
  } finally {
    running = false;
    if (again) { again = false; scheduleSync(2000); }
  }
}

let timer: number | undefined;
export function scheduleSync(delay = 8000) {
  clearTimeout(timer);
  timer = window.setTimeout(async () => {
    if (!(await getSyncKey())) return;
    if (Date.now() - lastRun < AUTO_MIN_GAP && !again) { scheduleSync(AUTO_MIN_GAP); return; }
    syncNow();
  }, delay);
}

/** Validate a key against the server, then store it and run the first sync. */
export async function connect(key: string): Promise<void> {
  key = key.trim();
  if (key.length < 16) throw new Error('That key looks too short');
  await call(key, 0, []).then(() => undefined); // throws on 401/503/offline
  await db.meta.bulkPut([
    { key: 'syncKey', value: key },
    { key: 'syncCursor', value: 0 },
    { key: 'syncLastPush', value: -1 },
  ]);
  syncNow();
}

export async function disconnect() {
  await db.meta.bulkDelete(SYNC_META_KEYS);
  set({ status: 'off', last: null, error: undefined, progress: undefined });
}

export async function startSync() {
  onLocalWrite(() => scheduleSync());
  state = { ...state, last: (await getMeta<number>('syncLast')) ?? null };
  if (await getSyncKey()) {
    set({ status: 'idle' });
    syncNow();
  }
  addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(500); });
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) scheduleSync(0); }, 60_000);
}

/** After an import: push everything again and re-read the server. */
export async function resetSyncCursors() {
  if (await getSyncKey()) await db.meta.bulkPut([{ key: 'syncCursor', value: 0 }, { key: 'syncLastPush', value: -1 }]);
}
