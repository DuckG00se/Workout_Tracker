# Workout_Tracker (Logbook)

Personal, offline-first gym workout tracker. Mobile-first PWA, no backend, no accounts. All data lives in IndexedDB on your device.

**Stack:** Preact + Vite + TypeScript, Dexie (IndexedDB), vite-plugin-pwa (service worker + manifest). uPlot is installed for the Phase 2 charts.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build (service worker active)
```

## Deploy (Cloudflare Workers + static assets)

`wrangler.jsonc` defines one Worker named `workout-tracker`: it serves `dist/` and runs `worker/index.ts` for `/api/*`.
Build command `npm run build`, deploy command `npx wrangler deploy` (the default for Workers Builds).

## Sync across devices

Local IndexedDB stays the source of truth (works offline). With sync on, each device pushes its changes to a D1 database through `/api/sync` and pulls everyone else's. Newest `updatedAt` wins per record; deletes sync too. Finished sessions, exercises and routines sync; an in-progress workout stays on its device.

One-time setup:
1. D1 database `workout-tracker` with the schema in `worker/schema.sql` (already applied; the `database_id` is in `wrangler.jsonc`).
2. In Cloudflare: Worker → Settings → Variables and secrets → add a **secret** named `SYNC_KEY` (any long random string; the app's "Generate" button makes one).
3. In the app: Data → Sync across devices → paste the same key on every device → Connect.

Local sync testing: `npx wrangler d1 execute workout-tracker --local --file worker/schema.sql`, put `SYNC_KEY=...` in `.dev.vars`, run `npx wrangler dev --port 8787` and `npm run dev` (Vite proxies `/api` to it).

## Phase 1 (done)

- Sessions from a routine or empty; add, reorder and remove exercises mid-session
- Prefilled sets from last time, big +/- steppers, one-tap set completion, optional RPE and warm-up flag
- Rest timer (per-exercise default, ±15 s, vibration and sound, survives phone lock)
- "Last time" line per exercise, finish screen with duration, volume, sets and new PRs
- History calendar and list, with edit and delete
- Seeded library of 43 exercises, plus your own (edit, archive)
- Routines: create, edit, duplicate
- Backup: JSON export/import, CSV export, reminder when the last backup is over 14 days old
- Active session survives closing the app

## Phase 2 (done): Progress tab

- **Lifts:** per-exercise chart (uPlot) with metric switch: est. 1RM (Epley), best set, volume. Time-based exercises chart longest and total time or distance. Best / latest / change, plus recent sessions.
- **Overview:** sessions per week for the last 12 weeks against your target, and a streak of consecutive weeks with 3+ sessions (the current week counts once it reaches 3 but doesn't break the streak while in progress).
- **Sets per muscle:** working sets this week or last week. A set counts 1 for an exercise's first-listed muscle and 0.5 for the others.
- **Records:** best est. 1RM, heaviest and best set volume per exercise with the date, tap to open its chart.

## Running (Run tab)

Built from the 5-Day Hybrid Training Plan PDF.

- **Plan:** week 1 starts on a Monday you set (default: next Monday). The tab shows this week's Tue quality run, Wed easy run and Sat long run for the current plan week, and repeats from week 3 after week 6. A Fri conditioning finisher timer (10 × 30 s hard / 60 s easy) is included and isn't logged.
- **Interval timer:** warm-up, hard/easy reps, cool-down (and optional run-walk blocks for easy/long runs). Each phase change has its own beep pattern, a 3-2-1 countdown, halfway and one-minute-left calls on long phases, vibration, and spoken cues ("Hard. Rep 3 of 6. One minute.").
- **Locked screen:** beeps are scheduled ahead on the Web Audio clock and a silent looping `<audio>` + MediaSession keeps the page alive (lock-screen pause/skip controls on Android). Voice and vibration run from a JS timer, so they are best-effort with the screen off. Use "Alarm check" on the Run tab and test once on the phone.
- **Logging:** at the end enter distance (optional), RPE and notes. A run is saved as a finished session with an `ex-run` set, so it syncs, backs up and shows in History. Progress → Runs charts minutes per week, longest run and fastest pace. Runs are left out of the strength streak and muscle stats.
- Days 1, 3 and 4 of the plan are added once as routines (`Day 1 · Lower strength`, …) with the missing exercises added to the library.

## Notes

- Volume and PRs count completed working sets only (warm-ups excluded). Bodyweight exercises use optional added load.
- Weeks start on Monday.
- Back up regularly: browser storage can be cleared by the OS or browser.
