import { useEffect, useState } from 'preact/hooks';
import { db, getSettings, setSetting, uid, useLive } from './db';
import type { Session, SetRow } from './types';
import { fmtDur, fmtKg, localDate, parseDate, weekStart } from './calc';
import { ask, Chips, go, Header, Sheet, Stepper, toast } from './ui';
import { buildPhases, describe, minsFor, nextMonday, runNote, RunSpec, RunType, TYPE_NAME, weekFor } from './plan';
import { clearRun, pauseRun, rearm, resumeRun, skipPhase, startRun, stopRun, testCues, useRun } from './runner';
import { keepAwake } from './timer';

const WEEKDAY: Record<RunType, number> = { quality: 2, easy: 3, finisher: 5, long: 6 };
const WEEKDAY_NAME: Record<RunType, string> = { quality: 'Tue', easy: 'Wed', finisher: 'Fri', long: 'Sat' };
const mmss = fmtDur;

export const isRun = (s: Session) => !!s.run;
export const paceText = (sec: number, km: number) => {
  if (!km || !sec) return '';
  const p = Math.round(sec / km);
  return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')} /km`;
};

/* ================= RUN TAB ================= */
export function Run() {
  const r = useRun();
  const settings = useLive(getSettings);
  const [pick, setPick] = useState<RunType | null>(null);
  const runs = useLive(async () => (await db.sessions.where('status').equals('done').toArray()).filter(isRun));
  const runSets = useLive(() => db.sets.where('exerciseId').equals('ex-run').toArray());

  // First visit: default week 1 to next Monday and remember it.
  useEffect(() => { if (settings && !settings.runPlanStart) setSetting('runPlanStart', nextMonday()); }, [settings?.runPlanStart, !!settings]);

  if (r.active) return r.stopped ? <FinishRun /> : <Player />;
  if (!settings) return <div class="screen"><p class="muted pad">Loading…</p></div>;

  const start = settings.runPlanStart ?? nextMonday();
  const w = weekFor(start);
  const today = new Date().getDay();
  const types: RunType[] = ['quality', 'easy', 'long'];

  const wk = weekStart(localDate());
  const mine = (runs ?? []).filter((s) => weekStart(s.date) === wk);
  const ids = new Set(mine.map((s) => s.id));
  const mySets = (runSets ?? []).filter((s) => ids.has(s.sessionId));
  const secs = mySets.reduce((a, s) => a + s.duration, 0);
  const km = mySets.reduce((a, s) => a + s.distance, 0);

  return (
    <div class="screen">
      <Header title="Run" />
      <main class="stack">
        <section class="card">
          <div class="row between">
            <div>
              <p class="eyebrow">{w.before ? `Plan starts in ${w.daysUntil} day${w.daysUntil === 1 ? '' : 's'}` : `Week ${w.week} of 6${w.cycle > 1 ? ` · round ${w.cycle}` : ''}`}</p>
              <small class="muted">{w.before ? `Showing week 1. Week 1 starts ${parseDate(start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}.` : w.week === 6 ? 'Deload week: easier.' : 'Weeks run Monday to Sunday.'}</small>
            </div>
          </div>
          <div class="row gap wrap">
            <small class="muted">Week 1 starts</small>
            <input class="field inline" type="date" value={start} onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) setSetting('runPlanStart', weekStart(v)); }} />
          </div>
          <p class="muted sm">This week: {mine.length} run{mine.length === 1 ? '' : 's'} · {Math.round(secs / 60)} min{km ? ` · ${fmtKg(Math.round(km * 10) / 10)} km` : ''}</p>
        </section>

        <section>
          <h2 class="sec">This week's runs</h2>
          <div class="list">
            {types.map((t) => {
              const done = mine.some((s) => s.run?.type === t);
              return (
                <button key={t} class={'list-item runcard' + (today === WEEKDAY[t] ? ' today' : '')} onClick={() => setPick(t)}>
                  <span>
                    <b>{WEEKDAY_NAME[t]} · {TYPE_NAME[t]}</b>
                    {done && <em class="tick"> ✓ done</em>}
                    {today === WEEKDAY[t] && !done && <em class="tick"> today</em>}
                  </span>
                  <small class="muted">{describe(t, w.week)}</small>
                </button>
              );
            })}
            <button class={'list-item runcard' + (today === WEEKDAY.finisher ? ' today' : '')} onClick={() => setPick('finisher')}>
              <span><b>Fri · {TYPE_NAME.finisher}</b>{today === WEEKDAY.finisher && <em class="tick"> today</em>}</span>
              <small class="muted">{describe('finisher', w.week)} · timer only, not logged</small>
            </button>
          </div>
        </section>

        <section class="card pad stack">
          <h2 class="sec">Alarm check</h2>
          <p class="muted sm">Before you head out: play a sample of the beeps and voice, then lock your phone and start a run to confirm you hear the cues.</p>
          <div class="row gap">
            <button class="btn ghost grow" onClick={() => testCues()}>Play sample</button>
            <button class="btn ghost grow" onClick={() => go('/data')}>Sound settings</button>
          </div>
        </section>

        {!!runs?.length && <RecentRuns runs={runs} sets={runSets ?? []} />}
      </main>
      {pick && <StartSheet type={pick} week={w.week} onClose={() => setPick(null)} />}
    </div>
  );
}

function RecentRuns({ runs, sets }: { runs: Session[]; sets: SetRow[] }) {
  const list = [...runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);
  return (
    <section>
      <h2 class="sec">Recent runs</h2>
      <div class="list">
        {list.map((s) => {
          const set = sets.find((x) => x.sessionId === s.id);
          return (
            <button key={s.id} class="list-item" onClick={() => go(`/session/${s.id}`)}>
              <span>{parseDate(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {s.routineName}</span>
              <small class="muted">{runLine(set)}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export const runLine = (set?: SetRow) =>
  set ? [fmtDur(set.duration), set.distance ? `${fmtKg(set.distance)} km` : '', set.distance ? paceText(set.duration, set.distance) : '', set.rpe ? `RPE ${set.rpe}` : ''].filter(Boolean).join(' · ') : '';

/* ================= START SHEET ================= */
function StartSheet({ type, week, onClose }: { type: RunType; week: number; onClose: () => void }) {
  const steady = type === 'easy' || type === 'long';
  const [mins, setMins] = useState(minsFor(type, week) || 30);
  const [rw, setRw] = useState(type === 'long'); // long run default: run-walk, as the plan suggests
  const [runMin, setRunMin] = useState(4);
  const [walkMin, setWalkMin] = useState(1);
  const [awake, setAwake] = useState(false);
  const spec: RunSpec = { type, week, mins: steady ? mins : undefined, runWalk: steady && rw ? { runSec: runMin * 60, walkSec: walkMin * 60 } : null };
  const phases = buildPhases(spec);
  const total = phases.reduce((a, p) => a + p.sec, 0);

  return (
    <Sheet title={`${TYPE_NAME[type]} · week ${week}`} onClose={onClose}>
      <p>{describe(type, week, spec)}</p>
      <p class="muted sm">{runNote(type, week)}</p>
      {steady && (
        <>
          <Stepper label="Duration" unit="min" value={mins} step={5} min={5} max={180} decimals={0} onChange={setMins} />
          <button class="toggle" onClick={() => setRw(!rw)}><span>Run-walk intervals</span><i class={rw ? 'on' : ''} /></button>
          {rw && (
            <div class="two">
              <Stepper label="Run" unit="min" value={runMin} step={1} min={1} max={30} decimals={0} onChange={setRunMin} />
              <Stepper label="Walk" unit="min" value={walkMin} step={1} min={1} max={10} decimals={0} onChange={setWalkMin} />
            </div>
          )}
        </>
      )}
      <button class="toggle" onClick={() => setAwake(!awake)}><span>Keep screen on (uses more battery)</span><i class={awake ? 'on' : ''} /></button>
      <p class="muted sm">{phases.length} phase{phases.length === 1 ? "" : "s"} · {Math.round(total / 60)} min total. Phone can stay locked: beeps are scheduled ahead, voice is best-effort. Put your volume up first.</p>
      <div class="cta">
        <button class="btn primary wide big" onClick={async () => {
          document.body.dataset.awake = awake ? '1' : '0';
          keepAwake(awake);
          await startRun(spec);
          onClose();
        }}>Start</button>
      </div>
    </Sheet>
  );
}

/* ================= PLAYER ================= */
function Player() {
  const r = useRun();
  const p = r.phases[r.phaseIdx];
  const next = r.phases[r.phaseIdx + 1];
  if (!p || !r.spec) return null;
  const pct = Math.min(100, (r.elapsed / r.total) * 100);
  const ph = Math.min(100, (r.phaseElapsed / p.sec) * 100);
  const hard = p.kind === 'hard' || p.kind === 'run';

  return (
    <div class={'screen runner ' + (hard ? 'hard' : 'easy')} onPointerDown={rearm}>
      <Header title={`${TYPE_NAME[r.spec.type]} · wk ${r.spec.week}`} />
      <main class="stack runmain">
        <p class="phase-label">{r.paused ? 'Paused' : p.label}</p>
        <div class="phase-time num" aria-live="off">{mmss(r.phaseLeft)}</div>
        <div class="meter"><i style={{ width: `${ph}%` }} /></div>
        <p class="muted center-text">{next ? `Next: ${next.label} · ${mmss(next.sec)}` : 'Last phase'}</p>
        {r.needsTap && !r.paused && <p class="center-text hint">Sound is off after a reload. Tap the screen once to turn it back on.</p>}
        <div class="runstats">
          <div><b class="num">{mmss(r.elapsed)}</b><small>elapsed</small></div>
          <div><b class="num">{mmss(Math.max(0, r.total - r.elapsed))}</b><small>left</small></div>
        </div>
        <div class="meter slim"><i style={{ width: `${pct}%` }} /></div>
        <div class="row gap">
          <button class="btn primary grow big" onClick={() => (r.paused ? resumeRun() : pauseRun())}>{r.paused ? 'Resume' : 'Pause'}</button>
          <button class="btn ghost grow big" onClick={skipPhase} disabled={!next}>Skip ▸</button>
        </div>
        <button class="btn danger wide" onClick={async () => { if (await ask('End this run now?', 'End run', true)) stopRun(); }}>End run</button>
      </main>
    </div>
  );
}

/* ================= FINISH ================= */
function FinishRun() {
  const r = useRun();
  const [km, setKm] = useState(0);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  if (!r.spec) return null;
  const spec = r.spec;
  const secs = Math.round(r.elapsed);
  const finisher = spec.type === 'finisher';

  const save = async () => {
    const now = Date.now();
    const startedAt = now - secs * 1000;
    const id = uid();
    const ex = await db.exercises.get('ex-run');
    const session: Session = {
      id, date: r.date || localDate(), startedAt, endedAt: now, routineId: null,
      routineName: `${TYPE_NAME[spec.type]} · week ${spec.week}`, notes, effort: rpe, status: 'done',
      exerciseIds: ['ex-run'], run: { type: spec.type as 'quality' | 'easy' | 'long', week: spec.week },
    };
    const set: SetRow = {
      id: uid(), sessionId: id, exerciseId: 'ex-run', exerciseName: ex?.name ?? 'Run', setNo: 1, ts: startedAt,
      weight: 0, reps: 0, duration: secs, distance: km, rpe, warmup: false, done: true,
    };
    await db.transaction('rw', db.sessions, db.sets, async () => { await db.sessions.add(session); await db.sets.add(set); });
    clearRun();
    toast('Run saved');
  };

  return (
    <div class="screen">
      <Header title={finisher ? 'Finisher done' : 'Run complete'} />
      <main class="stack">
        <p class="eyebrow">{TYPE_NAME[spec.type]} · week {spec.week}</p>
        <div class="stats">
          <div><b class="num">{fmtDur(secs)}</b><small>Time</small></div>
          <div><b class="num">{km > 0 ? paceText(secs, km).replace(' /km', '') : '–'}</b><small>Pace (min/km)</small></div>
        </div>
        {finisher ? (
          <button class="btn primary wide big" onClick={() => clearRun()}>Done</button>
        ) : (
          <>
            <Stepper label="Distance (optional)" unit="km" value={km} step={0.1} min={0} max={100} decimals={2} onChange={setKm} />
            <p class="muted">Effort (RPE 1–10)</p>
            <Chips options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} value={rpe} onChange={(v) => setRpe(rpe === v ? null : v)} />
            <textarea class="field" rows={3} placeholder="How did it feel?" value={notes} onInput={(e) => setNotes((e.currentTarget as HTMLTextAreaElement).value)} />
            <button class="btn primary wide big" onClick={save}>Save run</button>
            <button class="btn danger wide" onClick={async () => { if (await ask('Discard this run without saving?', 'Discard', true)) clearRun(); }}>Discard</button>
          </>
        )}
      </main>
    </div>
  );
}

/* ================= PROGRESS: RUNS ================= */
export function RunStats({ runs, sets }: { runs: Session[]; sets: SetRow[] }) {
  const byS = new Map(sets.map((s) => [s.sessionId, s]));
  const rows = runs.map((s) => ({ s, set: byS.get(s.id) })).filter((x) => x.set) as { s: Session; set: SetRow }[];
  if (!rows.length) return <p class="muted center-text pad">Save your first run and its stats show up here.</p>;

  const weeks: { start: string; min: number; km: number }[] = [];
  let wk = weekStart(localDate());
  for (let i = 0; i < 12; i++) {
    const mine = rows.filter((x) => weekStart(x.s.date) === wk);
    weeks.unshift({ start: wk, min: mine.reduce((a, x) => a + x.set.duration, 0) / 60, km: mine.reduce((a, x) => a + x.set.distance, 0) });
    const d = parseDate(wk); d.setDate(d.getDate() - 7); wk = localDate(d);
  }
  const top = Math.max(30, ...weeks.map((w) => w.min));
  const longest = rows.reduce((a, x) => (x.set.duration > a.set.duration ? x : a));
  const withKm = rows.filter((x) => x.set.distance >= 1);
  const fastest = withKm.length ? withKm.reduce((a, x) => (x.set.duration / x.set.distance < a.set.duration / a.set.distance ? x : a)) : null;
  const totalKm = rows.reduce((a, x) => a + x.set.distance, 0);
  const totalMin = rows.reduce((a, x) => a + x.set.duration, 0) / 60;
  const short = (d: string) => parseDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <>
      <div class="stats">
        <div><b class="num">{rows.length}</b><small>Runs</small></div>
        <div><b class="num">{Math.round(totalMin)}</b><small>Minutes</small></div>
        {totalKm > 0 && <div><b class="num">{fmtKg(Math.round(totalKm * 10) / 10)}</b><small>km</small></div>}
      </div>
      <section class="card">
        <h2 class="sec nomb">Minutes per week</h2>
        <div class="bars" role="img" aria-label={`Running minutes per week, last 12 weeks: ${weeks.map((w) => Math.round(w.min)).join(', ')}`}>
          <div class="plot">
            {weeks.map((w, i) => (
              <div key={w.start} class="bar-col">
                <span class="bar-n num">{w.min ? Math.round(w.min) : ''}</span>
                <div class={'bar hit' + (i === weeks.length - 1 ? ' now' : '')} style={{ height: `calc((100% - 18px) * ${w.min / top})` }} />
              </div>
            ))}
          </div>
          <div class="bar-dates">{weeks.map((w, i) => <small key={w.start}>{i % 3 === 0 || i === weeks.length - 1 ? short(w.start) : ''}</small>)}</div>
        </div>
      </section>
      <section class="card">
        <h2 class="sec nomb">Bests</h2>
        <div class="list">
          <div class="pr"><span class="star">★</span><div class="grow"><b>Longest run</b><small class="muted">{short(longest.s.date)}</small></div><b class="num">{fmtDur(longest.set.duration)}</b></div>
          {fastest && <div class="pr"><span class="star">★</span><div class="grow"><b>Fastest pace (1 km+)</b><small class="muted">{short(fastest.s.date)} · {fmtKg(fastest.set.distance)} km</small></div><b class="num">{paceText(fastest.set.duration, fastest.set.distance)}</b></div>}
        </div>
      </section>
    </>
  );
}
