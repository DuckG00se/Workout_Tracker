import { useEffect, useRef, useState } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { db, getSettings, Settings, useLive } from './db';
import { Exercise, MUSCLES, Session, SetRow } from './types';
import { describeSet, fmtKg, isWork, localDate, parseDate, weekStart } from './calc';
import { Chips, Header, Sheet } from './ui';
import { metricsFor, MIN_WEEK, Metric, muscleSets, Point, prTable, prevWeek, series, streaks, weeklyCounts } from './stats';

type Tab = 'overview' | 'lifts' | 'prs';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['lifts', 'Lifts'], ['prs', 'Records']];
const shortDate = (d: string) => parseDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function Progress() {
  const [tab, setTab] = useState<Tab>('overview');
  const [exId, setExId] = useState<string | null>(null);
  const data = useLive(async () => {
    const sessions = await db.sessions.where('status').equals('done').toArray();
    const ids = new Set(sessions.map((s) => s.id));
    const sets = (await db.sets.toArray()).filter((s) => ids.has(s.sessionId));
    return { sessions, sets, exercises: await db.exercises.toArray(), settings: await getSettings() };
  });

  return (
    <div class="screen">
      <Header title="Progress" />
      <div class="seg" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {!data ? <p class="muted pad">Loading…</p> : !data.sessions.length ? (
        <p class="muted center-text pad">Finish your first workout and your progress shows up here.</p>
      ) : (
        <main class="stack">
          {tab === 'overview' && <Overview {...data} />}
          {tab === 'lifts' && <Lifts {...data} exId={exId} setExId={setExId} />}
          {tab === 'prs' && <Records {...data} open={(id) => { setExId(id); setTab('lifts'); }} />}
        </main>
      )}
    </div>
  );
}

interface D { sessions: Session[]; sets: SetRow[]; exercises: Exercise[]; settings: Settings }

/* ================= OVERVIEW ================= */
function Overview({ sessions, sets, exercises, settings }: D) {
  const weeks = weeklyCounts(sessions, 12);
  const { current, best, thisWeek } = streaks(sessions);
  const target = settings.weeklyTarget;
  const top = Math.max(target + 1, ...weeks.map((w) => w.count));
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const thisWk = weekStart(localDate());
  const wk = which === 'this' ? thisWk : prevWeek(thisWk);
  const ms = muscleSets(sets, sessions, exercises, wk);
  const rows = MUSCLES.filter((m) => ms.has(m)).sort((a, b) => ms.get(b)! - ms.get(a)!);
  const scale = Math.max(12, ...rows.map((m) => ms.get(m)!));
  const hit = weeks.filter((w) => w.count >= target).length;

  return (
    <>
      <section class="streak card">
        <div>
          <b class="num big-num">{current}</b>
          <small>week streak</small>
        </div>
        <p class="muted sm">
          {current ? `${current} week${current > 1 ? 's' : ''} in a row with ${MIN_WEEK}+ sessions.` : `No streak yet. Train ${MIN_WEEK}+ times in a week to start one.`}
          {' '}This week: {thisWeek}/{MIN_WEEK}. Best: {best}.
        </p>
      </section>

      <section class="card">
        <div class="row between">
          <h2 class="sec nomb">Sessions per week</h2>
          <small class="muted">{hit}/12 weeks at {target}+</small>
        </div>
        <div class="bars" role="img" aria-label={`Sessions per week, last 12 weeks: ${weeks.map((w) => w.count).join(', ')}. Target ${target}.`}>
          <div class="plot">
            <div class="target" style={{ bottom: `calc((100% - 18px) * ${target / top})` }} />
            {weeks.map((w, i) => (
              <div key={w.start} class="bar-col">
                <span class="bar-n num">{w.count || ''}</span>
                <div class={'bar' + (w.count >= target ? ' hit' : '') + (i === weeks.length - 1 ? ' now' : '')} style={{ height: `calc((100% - 18px) * ${w.count / top})` }} />
              </div>
            ))}
          </div>
          <div class="bar-dates">
            {weeks.map((w, i) => <small key={w.start}>{i % 3 === 0 || i === weeks.length - 1 ? shortDate(w.start) : ''}</small>)}
          </div>
        </div>
        <p class="muted sm">Dashed line = your weekly target ({target}). Weeks start on Monday.</p>
      </section>

      <section class="card">
        <h2 class="sec nomb">Sets per muscle</h2>
        <div>
          <Chips options={['this', 'last'] as const} value={which} onChange={setWhich} render={(v) => (v === 'this' ? 'This week' : 'Last week')} />
        </div>
        {rows.length ? (
          <div class="mrows">
            {rows.map((m) => (
              <div key={m} class="mrow">
                <span>{m}</span>
                <div class="mtrack"><i style={{ width: `${(ms.get(m)! / scale) * 100}%` }} /></div>
                <b class="num">{fmtKg(ms.get(m)!)}</b>
              </div>
            ))}
          </div>
        ) : <p class="muted">No working sets {which === 'this' ? 'yet this week' : 'last week'}.</p>}
        <p class="muted sm">Working sets only (no warm-ups). A set counts 1 for an exercise's first-listed muscle and 0.5 for each other one.</p>
      </section>
    </>
  );
}

/* ================= LIFTS ================= */
function Lifts({ sessions, sets, exercises, exId, setExId }: D & { exId: string | null; setExId: (id: string) => void }) {
  const [metricKey, setMetricKey] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const withHistory = exercises
    .map((e) => ({ e, last: Math.max(0, ...sets.filter((s) => s.exerciseId === e.id && isWork(s)).map((s) => s.ts)) }))
    .filter((x) => x.last > 0)
    .sort((a, b) => b.last - a.last);
  const ex = exercises.find((e) => e.id === exId) ?? withHistory[0]?.e;
  if (!ex) return <p class="muted center-text pad">No completed working sets yet.</p>;

  const metrics = metricsFor(ex.type);
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const exSets = sets.filter((s) => s.exerciseId === ex.id);
  const pts = series(exSets, sessions, metric);
  const best = pts.length ? Math.max(...pts.map((p) => p.v)) : 0;
  const latest = pts[pts.length - 1];
  const first = pts[0];
  const change = latest && first && pts.length > 1 ? latest.v - first.v : null;
  const recent = [...pts].reverse().slice(0, 8);

  return (
    <>
      <button class="btn ghost wide pickbtn" onClick={() => setPick(true)}>
        <span>{ex.name}</span><small class="muted">{ex.muscles.join(', ')} ▾</small>
      </button>
      <Chips options={metrics.map((m) => m.key)} value={metric.key} onChange={setMetricKey} render={(k) => metrics.find((m) => m.key === k)!.label} />
      <section class="card">
        <Chart key={ex.id + metric.key} pts={pts} metric={metric} />
        <div class="stats3">
          <div><small>Best</small><b class="num">{best ? metric.fmt(best) : '–'}</b></div>
          <div><small>Latest</small><b class="num">{latest ? metric.fmt(latest.v) : '–'}</b></div>
          <div><small>Change</small><b class={'num ' + (change === null ? '' : change >= 0 ? 'up' : 'down')}>{change === null ? '–' : `${change >= 0 ? '+' : '−'}${metric.fmt(Math.abs(change))}`}</b></div>
        </div>
      </section>
      <section>
        <h2 class="sec">Recent sessions</h2>
        <div class="list">
          {recent.map((p) => (
            <div key={p.x} class="list-item static pad2">
              <div class="grow"><b>{shortDate(p.date)}</b><small class="muted num wrapit">{p.sets.sort((a, b) => a.setNo - b.setNo).map((s) => describeSet(s, ex.type)).join('  ·  ')}</small></div>
              <b class="num">{metric.fmt(p.v)}</b>
            </div>
          ))}
          {!recent.length && <p class="muted">Nothing logged for this metric yet.</p>}
        </div>
      </section>
      {pick && <LiftPicker items={withHistory.map((x) => x.e)} onClose={() => setPick(false)} onPick={(id) => { setExId(id); setMetricKey(null); setPick(false); }} />}
    </>
  );
}

function LiftPicker({ items, onClose, onPick }: { items: Exercise[]; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <Sheet title="Choose exercise" onClose={onClose}>
      <input class="field" type="search" placeholder="Search…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      <div class="list">
        {items.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).map((e) => (
          <button key={e.id} class="list-item" onClick={() => onPick(e.id)}><span>{e.name}</span><small class="muted">{e.muscles.join(', ')}</small></button>
        ))}
      </div>
    </Sheet>
  );
}

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function Chart({ pts, metric }: { pts: Point[]; metric: Metric }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const theme = useLive(async () => (await getSettings()).theme);

  useEffect(() => {
    const el = ref.current;
    if (!el || pts.length < 2) return;
    const accent = cssVar('--accent'), muted = cssVar('--muted'), line = cssVar('--line');
    const font = '12px "DM Mono", monospace';
    const axis = { stroke: muted, font, grid: { stroke: line, width: 1 }, ticks: { stroke: line, width: 1 } };
    const u = new uPlot({
      width: el.clientWidth, height: 220, legend: { show: false },
      padding: [12, 8, 0, 0],
      cursor: { points: { size: 10, fill: accent, stroke: accent }, drag: { x: false, y: false } },
      scales: { x: { time: true }, y: { range: (_u, lo, hi) => { const pad = (hi - lo || hi || 1) * 0.15; return [Math.max(0, lo - pad), hi + pad]; } } },
      axes: [
        { ...axis, size: 32, space: 56, values: (_u, splits) => splits.map((v) => new Date(v * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) },
        { ...axis, size: 52 },
      ],
      series: [{}, { label: metric.label, stroke: accent, width: 2.5, fill: accent + '22', points: { show: true, size: 7, fill: accent, stroke: accent } }],
      hooks: { setCursor: [(s) => setHover(s.cursor.idx ?? null)] },
    }, [pts.map((p) => p.x), pts.map((p) => p.v)], el);
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height: 220 }));
    ro.observe(el);
    return () => { ro.disconnect(); u.destroy(); };
  }, [pts, theme]);

  if (pts.length < 2) {
    return (
      <p class="muted center-text pad">
        {pts.length ? `Only one session so far (${metric.fmt(pts[0].v)} on ${shortDate(pts[0].date)}). Log it once more to see a trend.` : 'No data for this metric yet.'}
      </p>
    );
  }
  const h = hover !== null ? pts[hover] : pts[pts.length - 1];
  return (
    <>
      <p class="readout num" aria-live="polite">{shortDate(h.date)} · {metric.fmt(h.v)}</p>
      <div ref={ref} class="chart" role="img" aria-label={`${metric.label} over time, ${pts.length} sessions, latest ${metric.fmt(pts[pts.length - 1].v)}`} />
    </>
  );
}

/* ================= RECORDS ================= */
function Records({ sessions, sets, exercises, open }: D & { open: (id: string) => void }) {
  const [q, setQ] = useState('');
  const table = prTable(sets, sessions, exercises).filter((t) => t.exercise.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input class="field" type="search" placeholder="Search records…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      <div class="list">
        {table.map(({ exercise, rows }) => (
          <button key={exercise.id} class="prcard" onClick={() => open(exercise.id)}>
            <div class="row between"><b class="prname">{exercise.name}</b><small class="muted">chart ›</small></div>
            {rows.map((r) => (
              <div key={r.label} class="prrow">
                <span class="muted">{r.label}</span>
                <b class="num">{r.fmt(r.value)}</b>
                <small class="muted">{[r.detail, shortDate(r.date)].filter(Boolean).join(' · ')}</small>
              </div>
            ))}
          </button>
        ))}
        {!table.length && <p class="muted center-text">No records found.</p>}
      </div>
    </>
  );
}
