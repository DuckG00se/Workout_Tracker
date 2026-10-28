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

## Notes

- Volume and PRs count completed working sets only (warm-ups excluded). Bodyweight exercises use optional added load.
- Weeks start on Monday.
- Back up regularly: browser storage can be cleared by the OS or browser.
