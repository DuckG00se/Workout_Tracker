import { useState } from 'preact/hooks';
import { db, getSettings, uid, useLive } from './db';
import { Exercise, MUSCLES, EQUIPMENT, ExType, Routine, RoutineItem, TYPE_LABEL } from './types';
import { duplicateRoutine, getActiveSession, startSession } from './ops';
import { ask, Chips, go, Header, Sheet, Stepper, toast } from './ui';
import { exportCSV, exportJSON, importJSON } from './backup';
import { setSetting } from './db';
import { fmtMetric, fmtMin, fmtVol, findPRs, isWork, localDate, parseDate, setVolume } from './calc';
import { ExercisePicker } from './pickers';

const DAY = 86400000;

/* ================= HOME ================= */
export function Home() {
  const active = useLive(async () => (await getActiveSession()) ?? null);
  const routines = useLive(() => db.routines.toArray());
  const settings = useLive(getSettings);
  const recent = useLive(() => db.sessions.where('status').equals('done').reverse().sortBy('startedAt').then((r) => r.reverse().slice(0, 3)));
  const stale = settings && (!settings.lastExport || Date.now() - settings.lastExport > 14 * DAY);
  const hasData = useLive(async () => (await db.sessions.count()) > 0);

  return (
    <div class="screen">
      <Header title="Logbook" />
      <main class="stack">
        {stale && hasData && (
          <div class="banner">
            <p><b>Back up your data.</b> {settings!.lastExport ? `Last backup ${Math.floor((Date.now() - settings!.lastExport) / DAY)} days ago.` : 'You have never exported a backup.'}</p>
            <button class="btn primary small" onClick={async () => { await exportJSON(); toast('Backup saved'); }}>Export now</button>
          </div>
        )}
        {active && (
          <button class="resume" onClick={() => go(`/session/${active.id}`)}>
            <small>IN PROGRESS</small>
            <b>{active.routineName || 'Workout'}</b>
            <span>Resume →</span>
          </button>
        )}
        <section>
          <h2 class="sec">Start</h2>
          <button class="btn primary wide big" disabled={!!active} onClick={async () => go(`/session/${await startSession(null)}`)}>Empty workout</button>
        </section>
        <section>
          <h2 class="sec">Routines</h2>
          <div class="list">
            {routines?.map((r) => (
              <button key={r.id} class="list-item" disabled={!!active} onClick={async () => go(`/session/${await startSession(r)}`)}>
                <span>{r.name}</span>
                <small class="muted">{r.items.length} exercises ▸ start</small>
              </button>
            ))}
            {routines && !routines.length && <p class="muted">No routines yet. <a href="#/routines">Create one</a>.</p>}
          </div>
        </section>
        {!!recent?.length && (
          <section>
            <h2 class="sec">Recent</h2>
            <SessionList sessions={recent} />
          </section>
        )}
      </main>
    </div>
  );
}

/* ================= SESSION LIST / HISTORY ================= */
function SessionList({ sessions }: { sessions: import('./types').Session[] }) {
  const sets = useLive(() => db.sets.toArray());
  const exs = useLive(() => db.exercises.toArray());
  const types = new Map((exs ?? []).map((e) => [e.id, e.type]));
  return (
    <div class="list">
      {sessions.map((s) => {
        const mine = (sets ?? []).filter((x) => x.sessionId === s.id && isWork(x));
        const vol = mine.reduce((a, x) => a + setVolume(x, types.get(x.exerciseId) ?? 'wr'), 0);
        return (
          <button key={s.id} class="list-item" onClick={() => go(`/session/${s.id}`)}>
            <span>{parseDate(s.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {s.routineName || 'Workout'}</span>
            <small class="muted">{mine.length} sets · {fmtVol(vol)}{s.endedAt ? ` · ${fmtMin(s.endedAt - s.startedAt)}` : ''}</small>
          </button>
        );
      })}
    </div>
  );
}

export function History() {
  const sessions = useLive(async () => (await db.sessions.where('status').equals('done').toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt));
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState<string | null>(null);
  const days = new Set((sessions ?? []).map((s) => s.date));
  const first = (month.getDay() + 6) % 7;
  const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const iso = (d: number) => localDate(new Date(month.getFullYear(), month.getMonth(), d));
  const shown = (sessions ?? []).filter((s) => (day ? s.date === day : s.date.startsWith(iso(1).slice(0, 7))));

  return (
    <div class="screen">
      <Header title="History" />
      <main class="stack">
        <section class="card cal">
          <div class="row between">
            <button class="icon-btn" aria-label="Previous month" onClick={() => { setDay(null); setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); }}>‹</button>
            <b>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
            <button class="icon-btn" aria-label="Next month" onClick={() => { setDay(null); setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); }}>›</button>
          </div>
          <div class="cal-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} class="dow">{d}</span>)}
            {cells.map((d, i) => d === null ? <span key={i} /> : (
              <button key={i} class={'day' + (days.has(iso(d)) ? ' has' : '') + (day === iso(d) ? ' sel' : '') + (iso(d) === localDate() ? ' today' : '')}
                onClick={() => setDay(day === iso(d) ? null : iso(d))}>{d}</button>
            ))}
          </div>
        </section>
        <SessionList sessions={shown} />
        {sessions && !shown.length && <p class="muted center-text">No sessions {day ? 'on this day' : 'this month'}.</p>}
      </main>
    </div>
  );
}

/* ================= SUMMARY ================= */
export function Summary({ id }: { id: string }) {
  const data = useLive(async () => {
    const session = await db.sessions.get(id);
    if (!session) return null;
    const sets = await db.sets.where('sessionId').equals(id).toArray();
    const history = (await db.sets.where('ts').below(session.startedAt).toArray());
    const exs = await db.exercises.toArray();
    return { session, sets, history, exs };
  }, [id]);
  if (data === null) { go('/'); return null; }
  if (!data) return <div class="screen"><p class="muted pad">Loading…</p></div>;
  const { session, sets, history, exs } = data;
  const types = new Map(exs.map((e) => [e.id, e.type]));
  const work = sets.filter((s) => s.done);
  const vol = work.filter((s) => !s.warmup).reduce((a, s) => a + setVolume(s, types.get(s.exerciseId) ?? 'wr'), 0);
  const prs = findPRs(sets, history, types);
  const dur = session.endedAt ? session.endedAt - session.startedAt : 0;

  return (
    <div class="screen">
      <Header title="Workout complete" back="/" />
      <main class="stack">
        <p class="eyebrow">{parseDate(session.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}{session.routineName ? ` · ${session.routineName}` : ''}</p>
        <div class="stats">
          <div><b class="num">{fmtMin(dur)}</b><small>Duration</small></div>
          <div><b class="num">{fmtVol(vol)}</b><small>Volume</small></div>
          <div><b class="num">{work.length}</b><small>Sets</small></div>
          {session.effort && <div><b class="num">{session.effort}/10</b><small>Effort</small></div>}
        </div>
        <section>
          <h2 class="sec">{prs.length ? 'New personal records' : 'Personal records'}</h2>
          {prs.length ? (
            <div class="list">
              {prs.map((p, i) => (
                <div key={i} class="pr">
                  <span class="star">★</span>
                  <div class="grow"><b>{p.name}</b><small class="muted">{p.label}, was {fmtMetric(p.label, p.prev)}</small></div>
                  <b class="num">{fmtMetric(p.label, p.value)}</b>
                </div>
              ))}
            </div>
          ) : <p class="muted">No PRs this time. Consistency is the signal.</p>}
        </section>
        {session.notes && <p class="card pad">{session.notes}</p>}
        <div class="row gap">
          <button class="btn ghost grow" onClick={() => go(`/session/${id}`)}>Edit session</button>
          <button class="btn primary grow" onClick={() => go('/')}>Done</button>
        </div>
      </main>
    </div>
  );
}

/* ================= EXERCISES ================= */
export function Exercises() {
  const all = useLive(() => db.exercises.toArray());
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('All');
  const [archived, setArchived] = useState(false);
  const [edit, setEdit] = useState<Exercise | null>(null);
  const list = (all ?? [])
    .filter((e) => e.archived === archived)
    .filter((e) => muscle === 'All' || e.muscles.includes(muscle))
    .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const blank = (): Exercise => ({ id: uid(), name: '', muscles: [], equipment: 'Barbell', type: 'wr', notes: '', archived: false, restSec: 90 });

  return (
    <div class="screen">
      <Header title="Exercises" right={<button class="btn primary small" onClick={() => setEdit(blank())}>+ New</button>} />
      <main class="stack">
        <input class="field" type="search" placeholder="Search…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
        <Chips options={['All', ...MUSCLES]} value={muscle} onChange={setMuscle} />
        <div class="list">
          {list.map((e) => (
            <button key={e.id} class="list-item" onClick={() => setEdit(e)}>
              <span>{e.name}</span>
              <small class="muted">{e.muscles.join(', ')} · {e.equipment}</small>
            </button>
          ))}
          {!list.length && <p class="muted center-text">Nothing here.</p>}
        </div>
        <button class="btn ghost wide" onClick={() => setArchived(!archived)}>{archived ? 'Show active' : 'Show archived'}</button>
      </main>
      {edit && <ExerciseForm ex={edit} isNew={!all?.some((e) => e.id === edit.id)} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ExerciseForm({ ex, isNew, onClose }: { ex: Exercise; isNew: boolean; onClose: () => void }) {
  const [f, setF] = useState<Exercise>(ex);
  const set = <K extends keyof Exercise>(k: K, v: Exercise[K]) => setF({ ...f, [k]: v });
  const toggleMuscle = (m: string) => set('muscles', f.muscles.includes(m) ? f.muscles.filter((x) => x !== m) : [...f.muscles, m]);
  return (
    <Sheet title={isNew ? 'New exercise' : 'Edit exercise'} onClose={onClose}>
      <input class="field" placeholder="Name" value={f.name} onInput={(e) => set('name', (e.currentTarget as HTMLInputElement).value)} />
      <p class="muted">Muscles</p>
      <div class="chips">{MUSCLES.map((m) => <button key={m} class={'chip' + (f.muscles.includes(m) ? ' on' : '')} onClick={() => toggleMuscle(m)}>{m}</button>)}</div>
      <p class="muted">Equipment</p>
      <Chips options={EQUIPMENT} value={f.equipment} onChange={(v) => set('equipment', v)} />
      <p class="muted">Type</p>
      <Chips options={Object.keys(TYPE_LABEL) as ExType[]} value={f.type} onChange={(v) => set('type', v)} render={(v) => TYPE_LABEL[v]} />
      <Stepper label="Default rest" unit="s" value={f.restSec} step={15} decimals={0} onChange={(v) => set('restSec', v)} />
      <textarea class="field" rows={2} placeholder="Notes (seat height, cues…)" value={f.notes} onInput={(e) => set('notes', (e.currentTarget as HTMLTextAreaElement).value)} />
      <button class="btn primary wide big" onClick={async () => {
        if (!f.name.trim()) return toast('Give it a name');
        await db.exercises.put({ ...f, name: f.name.trim() });
        onClose();
      }}>Save</button>
      {!isNew && (
        <button class="btn ghost wide" onClick={async () => { await db.exercises.update(f.id, { archived: !f.archived }); toast(f.archived ? 'Restored' : 'Archived'); onClose(); }}>
          {f.archived ? 'Restore' : 'Archive'}
        </button>
      )}
    </Sheet>
  );
}

/* ================= ROUTINES ================= */
export function Routines() {
  const routines = useLive(() => db.routines.toArray());
  const [edit, setEdit] = useState<Routine | null>(null);
  return (
    <div class="screen">
      <Header title="Routines" right={<button class="btn primary small" onClick={() => setEdit({ id: uid(), name: '', items: [] })}>+ New</button>} />
      <main class="stack">
        <div class="list">
          {routines?.map((r) => (
            <div key={r.id} class="list-item static">
              <button class="grow left" onClick={() => setEdit(r)}><span>{r.name}</span><small class="muted">{r.items.length} exercises</small></button>
              <button class="icon-btn" aria-label="Duplicate routine" onClick={async () => { await duplicateRoutine(r); toast('Duplicated'); }}>⧉</button>
            </div>
          ))}
          {routines && !routines.length && <p class="muted center-text pad">Build a routine to start workouts in one tap.</p>}
        </div>
      </main>
      {edit && <RoutineForm r={edit} isNew={!routines?.some((x) => x.id === edit.id)} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RoutineForm({ r, isNew, onClose }: { r: Routine; isNew: boolean; onClose: () => void }) {
  const [f, setF] = useState<Routine>(r);
  const [pick, setPick] = useState(false);
  const exs = useLive(() => db.exercises.toArray());
  const name = (id: string) => exs?.find((e) => e.id === id)?.name ?? 'Unknown';
  const upd = (i: number, p: Partial<RoutineItem>) => setF({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  const move = (i: number, d: number) => {
    const items = [...f.items]; const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    setF({ ...f, items });
  };
  return (
    <Sheet title={isNew ? 'New routine' : 'Edit routine'} onClose={onClose}>
      <input class="field" placeholder="Routine name (e.g. Push A)" value={f.name} onInput={(e) => setF({ ...f, name: (e.currentTarget as HTMLInputElement).value })} />
      {f.items.map((it, i) => (
        <div key={it.exerciseId} class="card pad">
          <div class="row between">
            <b>{name(it.exerciseId)}</b>
            <div class="row">
              <button class="icon-btn" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
              <button class="icon-btn" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
              <button class="icon-btn" aria-label="Remove" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })}>✕</button>
            </div>
          </div>
          <div class="trio">
            <Stepper label="Sets" value={it.sets} step={1} min={1} decimals={0} onChange={(v) => upd(i, { sets: v })} />
            <Stepper label="Reps" value={it.reps} step={1} min={1} decimals={0} onChange={(v) => upd(i, { reps: v })} />
            <Stepper label="Rest s" value={it.restSec} step={15} decimals={0} onChange={(v) => upd(i, { restSec: v })} />
          </div>
        </div>
      ))}
      <button class="btn ghost wide" onClick={() => setPick(true)}>+ Add exercise</button>
      <button class="btn primary wide big" onClick={async () => {
        if (!f.name.trim()) return toast('Give it a name');
        await db.routines.put({ ...f, name: f.name.trim() });
        onClose();
      }}>Save routine</button>
      {!isNew && <button class="btn danger wide" onClick={async () => { if (await ask('Delete this routine? Past sessions are kept.', 'Delete', true)) { await db.routines.delete(f.id); onClose(); } }}>Delete routine</button>}
      {pick && <ExercisePicker exclude={f.items.map((i) => i.exerciseId)} onClose={() => setPick(false)} onPick={(e) => { setF({ ...f, items: [...f.items, { exerciseId: e.id, sets: 3, reps: 10, restSec: e.restSec }] }); setPick(false); }} />}
    </Sheet>
  );
}

/* ================= DATA / SETTINGS ================= */
export function Data() {
  const s = useLive(getSettings);
  const persisted = useLive(async () => (await navigator.storage?.persisted?.()) ?? false);
  if (!s) return null;
  return (
    <div class="screen">
      <Header title="Data & settings" />
      <main class="stack">
        <section class="card pad stack">
          <h2 class="sec">Backup</h2>
          <p class="muted sm">{s.lastExport ? `Last backup: ${new Date(s.lastExport).toLocaleDateString()}` : 'No backup yet.'} Storage is {persisted ? 'protected' : 'not guaranteed'} on this device.</p>
          <button class="btn primary wide" onClick={async () => { await exportJSON(); toast('Backup saved'); }}>Export full backup (JSON)</button>
          <button class="btn ghost wide" onClick={() => exportCSV()}>Export sets (CSV)</button>
          <label class="btn ghost wide filebtn">Import backup…
            <input type="file" accept="application/json,.json" onChange={async (e) => {
              const file = (e.currentTarget as HTMLInputElement).files?.[0];
              (e.currentTarget as HTMLInputElement).value = '';
              if (!file) return;
              if (!(await ask('Importing REPLACES all data on this device with the backup. Continue?', 'Replace', true))) return;
              try { await importJSON(await file.text()); toast('Backup restored'); } catch (err) { toast((err as Error).message); }
            }} />
          </label>
        </section>
        <section class="card pad stack">
          <h2 class="sec">Preferences</h2>
          <p class="muted">Theme</p>
          <Chips options={['dark', 'light']} value={s.theme} onChange={(v) => setSetting('theme', v as 'dark' | 'light')} render={(v) => (v === 'dark' ? 'Dark' : 'Light')} />
          <Stepper label="Weight step" unit="kg" value={s.weightStep} step={0.5} min={0.5} onChange={(v) => setSetting('weightStep', v)} />
          <Stepper label="Weekly target" unit="sessions" value={s.weeklyTarget} step={1} min={1} max={7} decimals={0} onChange={(v) => setSetting('weeklyTarget', v)} />
          <Toggle label="Rest timer sound" on={s.sound} onChange={(v) => setSetting('sound', v)} />
          <Toggle label="Vibration" on={s.vibrate} onChange={(v) => setSetting('vibrate', v)} />
          <Toggle label="Notify when rest ends (app in background)" on={s.notify} onChange={async (v) => {
            if (v && 'Notification' in window && Notification.permission !== 'granted') {
              const p = await Notification.requestPermission();
              if (p !== 'granted') return toast('Notifications blocked');
            }
            setSetting('notify', v);
          }} />
        </section>
      </main>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button class="toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span>{label}</span><i class={on ? 'on' : ''} />
    </button>
  );
}

