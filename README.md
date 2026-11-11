# Bench Boss: College Hoops

A single-player, offline-first college basketball coaching career simulator that runs entirely in the browser. You create a coach, take a first job (head coach at a small program or assistant at an established one), and manage recruiting, development, game plans, games, the transfer portal, staff, and the coaching carousel across as many seasons as you like.

All schools, conferences, players, and coaches are fictional and generated from a seed.

## Running it

```bash
npm install
npm run dev        # local dev server
npm test           # Vitest: simulation, recruiting, saves, multi-season careers
npm run build      # type-check + static build into dist/
npm run preview    # serve the production build
```

## Deploying (Vercel)

The build is plain static files, so Vercel's Vite preset works as-is: build command `npm run build`, output directory `dist` (already set in `vercel.json`). No server, environment variables, or API routes are needed.

## Offline and saves

- A generated service worker (`vite.config.ts`) precaches every built file. After one online visit the game loads and plays with no connection, and it is installable as a PWA.
- Careers save to IndexedDB on this device: autosave after changes and before/after every advance, three rotating backups, a pre-migration backup when the save schema changes, and JSON export/import from Settings.
- The game makes no network calls during play: no analytics, accounts, or hosted fonts.

## How it's built

| Layer | Where |
|---|---|
| Pure TypeScript simulation (no React, no browser APIs) | `src/sim/` |
| Seeded, serializable RNG (results reproduce from a save) | `src/sim/rng.ts` |
| Possession-based game engine (coach mode, play-by-play, explanations) | `src/sim/gamesim.ts` |
| Season, standings, résumé/RPI, conference + national tournaments | `src/sim/season.ts` |
| Recruiting, signing day, class feedback | `src/sim/recruiting.ts` |
| Development, morale, academics, transfer risk | `src/sim/development.ts` |
| Offseason pipeline: review → signing → departures → portal → carousel → staff → progression | `src/sim/offseason.ts`, `src/sim/career.ts` |
| Web Worker for week/season advancement | `src/worker/` |
| IndexedDB persistence, validation, migrations | `src/storage/db.ts`, `src/sim/migrate.ts` |
| React UI | `src/ui/` |

## Defaults chosen from the design doc

Fictional universe; works offline after the first visit; possession-based play-by-play with instant sim and coach mode; head-coach and assistant career paths; universe sizes of 10, 60, 100, or 312 schools (the full world has 32 conferences and a 68-team national tournament with play-in games); NIL modeled as a simple fictional recruiting resource; redshirts, academic eligibility, pro departures, and buyouts included.
