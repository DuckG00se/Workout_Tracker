import { db, uid } from './db';
import { localDate, isWork } from './calc';
import type { Exercise, Routine, Session, SetRow } from './types';

/** The most recent finished/other-session sets of an exercise, ordered by set number. */
export async function lastTime(exerciseId: string, excludeSessionId?: string): Promise<SetRow[]> {
  const all = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  const done = all.filter((s) => s.done && s.sessionId !== excludeSessionId);
  if (!done.length) return [];
  const ts = Math.max(...done.map((s) => s.ts));
  return done.filter((s) => s.ts === ts).sort((a, b) => a.setNo - b.setNo);
}

function blankSet(session: Session, ex: Exercise, setNo: number, from?: Partial<SetRow>): SetRow {
  return {
    id: uid(),
    sessionId: session.id,
    exerciseId: ex.id,
    exerciseName: ex.name,
    setNo,
    ts: session.startedAt,
    weight: from?.weight ?? 0,
    reps: from?.reps ?? (ex.type === 'time' || ex.type === 'timedist' ? 0 : 10),
    duration: from?.duration ?? (ex.type === 'time' || ex.type === 'timedist' ? 60 : 0),
    distance: from?.distance ?? 0,
    rpe: null,
    warmup: false,
    done: false,
  };
}

/** Create the working sets for an exercise, prefilled from the last time (or the routine defaults). */
async function buildSets(session: Session, ex: Exercise, defaults?: { sets: number; reps: number }): Promise<SetRow[]> {
  const last = (await lastTime(ex.id, session.id)).filter((s) => !s.warmup);
  const count = last.length || defaults?.sets || 3;
  const out: SetRow[] = [];
  for (let i = 0; i < count; i++) {
    const src = last[Math.min(i, last.length - 1)];
    out.push(blankSet(session, ex, i + 1, src ?? (defaults ? { reps: defaults.reps } : undefined)));
  }
  return out;
}

export async function getActiveSession() {
  return db.sessions.where('status').equals('active').first();
}

export async function startSession(routine?: Routine | null): Promise<string> {
  const existing = await getActiveSession();
  if (existing) return existing.id;
  const now = Date.now();
  const session: Session = {
    id: uid(),
    date: localDate(),
    startedAt: now,
    endedAt: null,
    routineId: routine?.id ?? null,
    routineName: routine?.name ?? '',
    notes: '',
    effort: null,
    status: 'active',
    exerciseIds: routine ? routine.items.map((i) => i.exerciseId) : [],
  };
  const sets: SetRow[] = [];
  if (routine) {
    for (const item of routine.items) {
      const ex = await db.exercises.get(item.exerciseId);
      if (ex) sets.push(...(await buildSets(session, ex, item)));
    }
    session.exerciseIds = session.exerciseIds.filter((id) => sets.some((s) => s.exerciseId === id));
  }
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sessions.add(session);
    await db.sets.bulkAdd(sets);
  });
  return session.id;
}

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const session = await db.sessions.get(sessionId);
  const ex = await db.exercises.get(exerciseId);
  if (!session || !ex || session.exerciseIds.includes(exerciseId)) return;
  const sets = await buildSets(session, ex);
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sessions.update(sessionId, { exerciseIds: [...session.exerciseIds, exerciseId] });
    await db.sets.bulkAdd(sets);
  });
}

export async function removeExerciseFromSession(sessionId: string, exerciseId: string) {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sessions.update(sessionId, { exerciseIds: session.exerciseIds.filter((i) => i !== exerciseId) });
    await db.sets.where('sessionId').equals(sessionId).filter((s) => s.exerciseId === exerciseId).delete();
  });
}

export async function moveExercise(sessionId: string, exerciseId: string, dir: -1 | 1) {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const ids = [...session.exerciseIds];
  const i = ids.indexOf(exerciseId), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await db.sessions.update(sessionId, { exerciseIds: ids });
}

export async function addSet(sessionId: string, ex: Exercise) {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const mine = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter((s) => s.exerciseId === ex.id).sort((a, b) => a.setNo - b.setNo);
  const prev = mine[mine.length - 1];
  const set = blankSet(session, ex, (prev?.setNo ?? 0) + 1, prev);
  await db.sets.add(set);
  return set.id;
}

export async function deleteSet(set: SetRow) {
  await db.transaction('rw', db.sets, async () => {
    await db.sets.delete(set.id);
    const rest = (await db.sets.where('sessionId').equals(set.sessionId).toArray()).filter((s) => s.exerciseId === set.exerciseId).sort((a, b) => a.setNo - b.setNo);
    await Promise.all(rest.map((s, i) => (s.setNo === i + 1 ? null : db.sets.update(s.id, { setNo: i + 1 }))));
  });
}

export async function finishSession(sessionId: string) {
  const session = await db.sessions.get(sessionId);
  if (!session) return false;
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray();
  const done = sets.filter(isWork).length + sets.filter((s) => s.done && s.warmup).length;
  if (!done) {
    await discardSession(sessionId);
    return false;
  }
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.bulkDelete(sets.filter((s) => !s.done).map((s) => s.id));
    const left = sets.filter((s) => s.done);
    const ids = session.exerciseIds.filter((id) => left.some((s) => s.exerciseId === id));
    await db.sessions.update(sessionId, { status: 'done', endedAt: Date.now(), exerciseIds: ids });
    // Sets of an active session are not synced; touching them now makes them eligible for the next push.
    const now = Date.now();
    await db.sets.where('sessionId').equals(sessionId).modify((s: SetRow) => { s.updatedAt = now; });
  });
  return true;
}

export async function discardSession(sessionId: string) {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export async function duplicateRoutine(r: Routine) {
  const copy: Routine = { ...r, id: uid(), name: r.name + ' (copy)', items: r.items.map((i) => ({ ...i })) };
  await db.routines.add(copy);
  return copy.id;
}
