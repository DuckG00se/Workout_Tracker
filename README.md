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

## Deploy (Cloudflare Pages)

Build command `npm run build`, output directory `dist`, no environment variables needed.

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

## Phase 2 (planned)

Per-exercise charts (est. 1RM, best set, volume), weekly consistency and streak, weekly sets per muscle group, PR list.

## Notes

- Volume and PRs count completed working sets only (warm-ups excluded). Bodyweight exercises use optional added load.
- Weeks start on Monday.
- Back up regularly: browser storage can be cleared by the OS or browser.
