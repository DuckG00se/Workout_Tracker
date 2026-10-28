import { db, setSetting } from './db';
import { localDate } from './calc';
import { resetSyncCursors, SYNC_META_KEYS } from './sync';
import type { Exercise, Routine, Session, SetRow } from './types';

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportJSON() {
  const data = {
    app: 'gym-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.toArray(),
    routines: await db.routines.toArray(),
    sessions: await db.sessions.toArray(),
    sets: await db.sets.toArray(),
    meta: (await db.meta.toArray()).filter((m) => m.key !== 'lastExport' && !SYNC_META_KEYS.includes(m.key)),
  };
  download(`logbook-backup-${localDate()}.json`, JSON.stringify(data), 'application/json');
  await setSetting('lastExport', Date.now());
}

export async function importJSON(text: string) {
  const d = JSON.parse(text);
  if (d.app !== 'gym-tracker' || !Array.isArray(d.sessions) || !Array.isArray(d.sets) || !Array.isArray(d.exercises)) {
    throw new Error('Not a Logbook backup file');
  }
  // The restored data matches the file it came from, so keep the reminder clock at the newer of the two.
  const prevExport = ((await db.meta.get('lastExport'))?.value as number | undefined) ?? 0;
  const fileExport = Date.parse(d.exportedAt) || 0;
  // Keep this device's sync connection. Imported records are stamped "now" so, once synced, the import wins.
  const syncMeta = (await db.meta.bulkGet(SYNC_META_KEYS)).filter((m): m is NonNullable<typeof m> => !!m);
  const now = Date.now();
  const stamp = <T,>(rows: T[]) => rows.map((r) => ({ ...r, updatedAt: now }));
  await db.transaction('rw', [db.exercises, db.routines, db.sessions, db.sets, db.meta, db.tombstones], async () => {
    await Promise.all([db.exercises.clear(), db.routines.clear(), db.sessions.clear(), db.sets.clear(), db.meta.clear(), db.tombstones.clear()]);
    await db.exercises.bulkPut(stamp<Exercise>(d.exercises));
    await db.routines.bulkPut(stamp<Routine>(d.routines ?? []));
    await db.sessions.bulkPut(stamp<Session>(d.sessions));
    await db.sets.bulkPut(stamp<SetRow>(d.sets));
    await db.meta.bulkPut([...(d.meta ?? []).filter((m: { key: string }) => !SYNC_META_KEYS.includes(m.key)), ...syncMeta, { key: 'seeded', value: true }]);
    const last = Math.max(prevExport, fileExport);
    if (last) await db.meta.put({ key: 'lastExport', value: last });
  });
  await resetSyncCursors();
  const theme = (await db.meta.get('theme'))?.value;
  if (theme === 'light' || theme === 'dark') await setSetting('theme', theme);
}

const q = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per set. A CSV is not a full backup, so it does not reset the backup reminder. */
export async function exportCSV() {
  const sessions = new Map((await db.sessions.toArray()).map((s) => [s.id, s]));
  const rows = (await db.sets.toArray()).filter((s) => sessions.has(s.sessionId)).sort((a, b) => a.ts - b.ts || a.setNo - b.setNo);
  const lines = ['date,routine,exercise,set,warmup,weight_kg,reps,duration_s,distance_km,rpe,completed'];
  for (const s of rows) {
    const se = sessions.get(s.sessionId)!;
    lines.push([se.date, se.routineName, s.exerciseName, s.setNo, s.warmup ? 1 : 0, s.weight, s.reps, s.duration, s.distance, s.rpe ?? '', s.done ? 1 : 0].map(q).join(','));
  }
  download(`logbook-sets-${localDate()}.csv`, lines.join('\n'), 'text/csv');
}
