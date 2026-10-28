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

## Phase 2 (done): Progress tab

- **Lifts:** per-exercise chart (uPlot) with metric switch: est. 1RM (Epley), best set, volume. Time-based exercises chart longest and total time or distance. Best / latest / change, plus recent sessions.
- **Overview:** sessions per week for the last 12 weeks against your target, and a streak of consecutive weeks with 3+ sessions (the current week counts once it reaches 3 but doesn't break the streak while in progress).
- **Sets per muscle:** working sets this week or last week. A set counts 1 for an exercise's first-listed muscle and 0.5 for the others.
- **Records:** best est. 1RM, heaviest and best set volume per exercise with the date, tap to open its chart.

## Notes

- Volume and PRs count completed working sets only (warm-ups excluded). Bodyweight exercises use optional added load.
- Weeks start on Monday.
- Back up regularly: browser storage can be cleared by the OS or browser.
