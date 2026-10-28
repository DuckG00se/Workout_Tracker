import { useEffect, useState } from 'preact/hooks';
import { db, getSettings, useLive, Settings } from './db';
import { Exercise, SetRow, Session } from './types';
import { addExerciseToSession, addSet, deleteSet, discardSession, finishSession, lastTime, moveExercise, removeExerciseFromSession } from './ops';
import { adjustRest, keepAwake, startRest, stopRest, unlockAudio, useRest } from './timer';
import { ask, Chips, go, Header, Sheet, Stepper, toast, useNow } from './ui';
import { describeSet, fmtDur, isWork, localDate, parseDate, setVolume } from './calc';
import { ExercisePicker } from './pickers';

export function SessionScreen({ id }: { id: string }) {
  const session = useLive(async () => (await db.sessions.get(id)) ?? null, [id]);
  const sets = useLive(() => db.sets.where('sessionId').equals(id).toArray(), [id]);
  const exercises = useLive(() => db.exercises.toArray());
  const settings = useLive(getSettings);
  const [sel, setSel] = useState<string | null | undefined>(undefined); // undefined = auto
  const [picker, setPicker] = useState(false);
  const [finish, setFinish] = useState(false);
  const [details, setDetails] = useState(false);
  const active = session?.status === 'active';

  useEffect(() => {
    if (!active) return;
    document.body.dataset.awake = '1';
    keepAwake(true);
    return () => { delete document.body.dataset.awake; keepAwake(false); };
  }, [active]);

  if (session === null) { go('/'); return null; }
  if (!session || !sets || !exercises || !settings) return <div class="screen"><p class="muted pad">Loading…</p></div>;

  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const orderedSets = (exId: string) => sets.filter((s) => s.exerciseId === exId).sort((a, b) => a.setNo - b.setNo);
  const firstUndone = active
    ? session.exerciseIds.flatMap(orderedSets).find((s) => !s.done)?.id ?? null
    : null;
  const activeSetId = sel === undefined ? firstUndone : sel;
  const doneCount = sets.filter((s) => s.done).length;

  return (
    <div class="screen with-bar">
      <Header
        title={session.routineName || (active ? 'Workout' : 'Session')}
        back={active ? '/' : 'back'}
        right={active ? <Elapsed start={session.startedAt} /> : <button class="icon-btn" aria-label="Details" onClick={() => setDetails(true)}>⋯</button>}
      />
      {!active && <p class="muted pad-x">{parseDate(session.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>}
      <main class="stack">
        {session.exerciseIds.map((exId, idx) => {
          const ex = exMap.get(exId);
          if (!ex) return null;
          return (
            <ExerciseCard
              key={exId}
              ex={ex}
              session={session}
              sets={orderedSets(exId)}
              settings={settings}
              activeSetId={activeSetId}
              select={setSel}
              first={idx === 0}
              last={idx === session.exerciseIds.length - 1}
            />
          );
        })}
        {!session.exerciseIds.length && <p class="muted center-text pad">Empty session. Add your first exercise.</p>}
        <button class="btn ghost wide" onClick={() => setPicker(true)}>+ Add exercise</button>
      </main>

      <footer class="bottom">
        {active && <RestBar />}
        <div class="row gap">
          {active ? (
            <>
              <button class="btn ghost" onClick={async () => { if (await ask('Discard this whole session? Nothing will be saved.', 'Discard', true)) { await discardSession(id); stopRest(); go('/'); } }}>Discard</button>
              <button class="btn primary grow" onClick={() => (doneCount ? setFinish(true) : toast('Complete at least one set first'))}>Finish workout</button>
            </>
          ) : (
            <button class="btn ghost grow" onClick={() => go(`/summary/${id}`)}>View summary</button>
          )}
        </div>
      </footer>

      {picker && <ExercisePicker exclude={session.exerciseIds} onClose={() => setPicker(false)} onPick={async (e) => { setPicker(false); await addExerciseToSession(id, e.id); }} />}
      {finish && <FinishSheet session={session} sets={sets} onClose={() => setFinish(false)} />}
      {details && <DetailsSheet session={session} onClose={() => setDetails(false)} />}
    </div>
  );
}

function Elapsed({ start }: { start: number }) {
  const now = useNow();
  return <span class="elapsed num">{fmtDur((now - start) / 1000)}</span>;
}

function RestBar() {
  const { remaining, total, active } = useRest();
  if (!active) return null;
  return (
    <div class="rest" role="timer" aria-live="off">
      <div class="rest-fill" style={{ width: `${Math.min(100, (remaining / Math.max(1, total)) * 100)}%` }} />
      <button class="rest-btn" onClick={() => adjustRest(-15)}>−15</button>
      <div class="rest-time num"><small>REST</small>{fmtDur(remaining)}</div>
      <button class="rest-btn" onClick={() => adjustRest(15)}>+15</button>
      <button class="rest-btn skip" onClick={stopRest}>Skip</button>
    </div>
  );
}

function ExerciseCard({ ex, session, sets, settings, activeSetId, select, first, last }: {
  ex: Exercise; session: Session; sets: SetRow[]; settings: Settings; activeSetId: string | null;
  select: (id: string | null | undefined) => void; first: boolean; last: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const prev = useLive(() => lastTime(ex.id, session.id), [ex.id, session.id]);
  const isActive = session.status === 'active';

  const patch = async (s: SetRow, p: Partial<SetRow>) => {
    await db.sets.update(s.id, p);
    if (p.weight !== undefined && !s.done) {
      const later = sets.filter((x) => x.setNo > s.setNo && !x.done && x.weight === s.weight);
      await Promise.all(later.map((x) => db.sets.update(x.id, { weight: p.weight })));
    }
  };
  const toggleDone = async (s: SetRow) => {
    const nowDone = !s.done;
    await db.sets.update(s.id, { done: nowDone });
    if (nowDone) {
      unlockAudio();
      if (isActive) startRest(s.warmup ? Math.min(60, ex.restSec) : ex.restSec);
      if (navigator.vibrate && settings.vibrate) navigator.vibrate(15);
    }
    select(undefined);
  };
  const lastText = prev?.length ? prev.filter((s) => !s.warmup).map((s) => describeSet(s, ex.type)).join('  ·  ') : '';
  const vol = sets.filter(isWork).reduce((a, s) => a + setVolume(s, ex.type), 0);

  return (
    <section class="card">
      <div class="card-head">
        <div class="grow">
          <h3>{ex.name}</h3>
          <p class="muted sm">{ex.muscles.join(' · ')}{vol ? ` · ${Math.round(vol)} kg` : ''}</p>
        </div>
        <button class="icon-btn" aria-label="Exercise menu" onClick={() => setMenu(true)}>⋮</button>
      </div>
      <p class="last"><span>LAST</span> {lastText || 'First time'}</p>
      <ol class="sets">
        {sets.map((s) => {
          const open = activeSetId === s.id;
          return (
            <li key={s.id} class={'set' + (s.done ? ' done' : '') + (open ? ' open' : '')}>
              <div class="set-row">
                <button class="set-main" onClick={() => select(open ? null : s.id)} aria-expanded={open}>
                  <span class={'set-no' + (s.warmup ? ' warm' : '')}>{s.warmup ? 'W' : s.setNo}</span>
                  <span class="set-sum num">{describeSet(s, ex.type)}{s.rpe ? <em> @{s.rpe}</em> : null}</span>
                </button>
                <button class={'check' + (s.done ? ' on' : '')} onClick={() => toggleDone(s)} aria-label={s.done ? 'Mark set not done' : 'Mark set done'} aria-pressed={s.done}>
                  {s.done ? '✓' : ''}
                </button>
              </div>
              {open && <SetEditor s={s} ex={ex} settings={settings} patch={(p) => patch(s, p)} onDone={() => (s.done ? select(null) : toggleDone(s))} onDelete={async () => { await deleteSet(s); select(undefined); }} />}
            </li>
          );
        })}
      </ol>
      <button class="btn ghost small" onClick={async () => { const id = await addSet(session.id, ex); if (id) select(id); }}>+ Add set</button>

      {menu && (
        <Sheet title={ex.name} onClose={() => setMenu(false)}>
          <div class="list">
            <button class="btn ghost wide" disabled={first} onClick={() => { moveExercise(session.id, ex.id, -1); setMenu(false); }}>↑ Move up</button>
            <button class="btn ghost wide" disabled={last} onClick={() => { moveExercise(session.id, ex.id, 1); setMenu(false); }}>↓ Move down</button>
            <button class="btn danger wide" onClick={async () => { setMenu(false); if (await ask(`Remove ${ex.name} and its sets from this session?`, 'Remove', true)) removeExerciseFromSession(session.id, ex.id); }}>Remove exercise</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function SetEditor({ s, ex, settings, patch, onDone, onDelete }: {
  s: SetRow; ex: Exercise; settings: Settings; patch: (p: Partial<SetRow>) => void; onDone: () => void; onDelete: () => void;
}) {
  const t = ex.type;
  return (
    <div class="editor">
      {(t === 'wr' || t === 'bw') && (
        <>
          <Stepper label={t === 'bw' ? 'Added load' : 'Weight'} unit="kg" value={s.weight} step={settings.weightStep} onChange={(weight) => patch({ weight })} />
          <Stepper label="Reps" value={s.reps} step={1} decimals={0} onChange={(reps) => patch({ reps })} />
        </>
      )}
      {(t === 'time' || t === 'timedist') && (
        <Stepper label="Duration" value={s.duration} step={15} decimals={0} format={fmtDur} onChange={(duration) => patch({ duration })} />
      )}
      {t === 'timedist' && <Stepper label="Distance" unit="km" value={s.distance} step={0.1} onChange={(distance) => patch({ distance })} />}
      {t !== 'time' && t !== 'timedist' && (
        <div class="stepper">
          <span class="stepper-label">RPE (optional)</span>
          <div class="rpe">
            {[6, 7, 8, 9, 10].map((n) => (
              <button key={n} class={'chip sq' + (s.rpe === n ? ' on' : '')} aria-label={`RPE ${n}`} aria-pressed={s.rpe === n} onClick={() => patch({ rpe: s.rpe === n ? null : n })}>{n}</button>
            ))}
          </div>
        </div>
      )}
      <div class="row gap">
        <button class="btn ghost" onClick={onDelete} aria-label="Delete set">🗑</button>
        <button class={'chip' + (s.warmup ? ' on' : '')} aria-pressed={s.warmup} onClick={() => patch({ warmup: !s.warmup })}>Warm-up</button>
        <button class="btn primary grow big" onClick={onDone}>{s.done ? 'Close' : 'Done ✓'}</button>
      </div>
    </div>
  );
}

function FinishSheet({ session, sets, onClose }: { session: Session; sets: SetRow[]; onClose: () => void }) {
  const [effort, setEffort] = useState<number | null>(session.effort);
  const [notes, setNotes] = useState(session.notes);
  const open = sets.filter((s) => !s.done).length;
  return (
    <Sheet title="Finish workout" onClose={onClose}>
      <p class="muted">How hard was it overall?</p>
      <Chips options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} value={effort} onChange={(v) => setEffort(effort === v ? null : v)} />
      <textarea class="field" rows={3} placeholder="Notes (optional)" value={notes} onInput={(e) => setNotes((e.currentTarget as HTMLTextAreaElement).value)} />
      {open > 0 && <p class="muted sm">{open} unfinished set{open > 1 ? 's' : ''} will be dropped.</p>}
      <button class="btn primary wide big" onClick={async () => {
        await db.sessions.update(session.id, { effort, notes });
        stopRest();
        await finishSession(session.id);
        go(`/summary/${session.id}`);
      }}>Save workout</button>
    </Sheet>
  );
}

function DetailsSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const [notes, setNotes] = useState(session.notes);
  return (
    <Sheet title="Session details" onClose={onClose}>
      <label class="lbl">Date
        <input class="field" type="date" value={session.date} max={localDate()} onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) db.sessions.update(session.id, { date: v }); }} />
      </label>
      <p class="muted">Overall effort</p>
      <Chips options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} value={session.effort} onChange={(v) => db.sessions.update(session.id, { effort: session.effort === v ? null : v })} />
      <textarea class="field" rows={3} placeholder="Notes" value={notes} onInput={(e) => setNotes((e.currentTarget as HTMLTextAreaElement).value)} onBlur={() => db.sessions.update(session.id, { notes })} />
      <button class="btn danger wide" onClick={async () => {
        if (await ask('Delete this session permanently?', 'Delete', true)) { await discardSession(session.id); onClose(); go('/history'); }
      }}>Delete session</button>
    </Sheet>
  );
}

