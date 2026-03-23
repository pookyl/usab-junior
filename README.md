# USA Badminton Junior Rankings Dashboard

A web application for exploring USA Badminton junior player rankings, tournament results, player profiles, head-to-head records, and tournament analytics. Data is sourced from [usabjrrankings.org](https://usabjrrankings.org), [usabadminton.org](https://usabadminton.org) (schedule), and [tournamentsoftware.com](https://www.tournamentsoftware.com) (TSW).

## Features

- **Dashboard** — Home page with age group overview (U11–U19), player counts, gender breakdowns, top-ranked players, and a spotlight tournament card
- **Rankings** — Browse rankings by age group and event type (BS, GS, BD, GD, XD) with historical date selection, aggregate stats, and analytics charts
- **Player Directory** — Searchable, alphabetically indexed directory of all players ever ranked, aggregated across all historical snapshots
- **Player Profiles** — Detailed view with ranking history charts, TSW career W-L stats (singles, doubles, mixed), and full tournament-by-tournament match history
- **Head-to-Head** — Compare two players' complete match history with scores, tournament context, career W-L records, and ranking trend overlays. Uses a three-layer merge algorithm combining TSW's H2H feed with each player's individual stats
- **Tournaments** — Season schedule with region and type filters, spotlight banner, and per-tournament hub with:
  - **Matches** — Match results by day with court, time, and status
  - **Players** — Searchable tournament player list
  - **Draws** — Full elimination brackets (with feed-in detection) and round-robin standings
  - **Events** — Event list with entries and draw links
  - **Seeds** — Seedings by event
  - **Winners** — Final placements (gold through fourth)
  - **Medals** — Club-level medal tally and per-draw breakdowns
  - **Player Detail** — Individual player matches within a tournament, with schedule link for upcoming matches
  - **Watchlist** — Track selected players during live tournaments with aggregated match feed and W-L summary
- **Tournament Focus Mode** — Immersive mode that locks navigation to a specific tournament during live events
- **Dark Mode** — System/light/dark theme toggle

## Architecture

The app consists of two parts that run together:

1. **Vite + React frontend** (port 5173) — SPA with client-side routing
2. **Node.js API server** (port 3001) — Lightweight server that fetches and parses HTML from upstream sources, with in-memory caching and persistent disk caching as fallback

In development, Vite proxies `/api/*` requests to the API server automatically.

Data is populated through two pipelines:

- **Offline pipeline** — Scripts (run manually or via GitHub Actions) scrape upstream sources and persist JSON to `data/`. The API serves from these files first.
- **Live pipeline** — When disk cache misses, the API fetches and parses upstream HTML in real time.

### Deployment (Vercel)

In production the app is deployed to **Vercel**. The `api/` directory contains serverless functions that mirror the local API server, with shared parsing and caching logic in `api/_lib/shared.js`. The built frontend is served as a static SPA with a catch-all rewrite (see `vercel.json`). Tournament data files in `data/` are bundled with the serverless functions.

Vercel Web Analytics tracks page views with custom route normalization for SPA navigation. See [docs/vercel-analytics-setup.md](docs/vercel-analytics-setup.md) for details.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later

### Install and Run

```bash
git clone <repo-url>
cd usab-junior
npm install
npm run dev
```

The app will be available at **http://localhost:5173**.

> `node_modules/` is not stored in git. Run `npm install` before `npm run dev` after every fresh clone. `package-lock.json` ensures identical dependency versions across machines.

### Production Build

```bash
npm run build     # Type-check + build into dist/
npm run start     # Serve API + dist/ on port 3001
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server + API server concurrently |
| `npm run dev:restart` | Kill any running dev processes and restart |
| `npm run api` | Start the API server only (port 3001) |
| `npm run build` | Type-check with TypeScript and build for production |
| `npm run start` | Start API server (serves `dist/` and API on port 3001) |
| `npm run refresh-rankings-cache` | Fetch latest rankings and write `data/rankings-*.json` |
| `npm run refresh-tournaments-cache` | Fetch tournament schedules and write `data/tournaments-*.json` |
| `npm run patch-tournaments-tsw` | Search TSW for tournament IDs and patch them into season files |
| `npm test` | Run tests with Vitest |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint on the full project |
| `npm run lint:api` | Run ESLint on API files only (used in CI) |
| `npm run preview` | Preview the production build via Vite |

## API Endpoints

All endpoints are served by `api-server.mjs` on port 3001. In production, these are Vercel serverless functions under `api/`.

### Rankings & Players

| Endpoint | Description |
| --- | --- |
| `GET /api/cached-dates` | Ranking dates available in disk cache |
| `GET /api/rankings?age_group=U13&category=BS&date=...` | Rankings for a specific age group + event |
| `GET /api/all-players?date=...` | All ranked players across every age group and event |
| `GET /api/player-directory` | Cumulative directory of players across all cached dates |
| `GET /api/player/:usabId?age_group=&category=&date=` | USAB ranking detail for a player |
| `GET /api/player/:usabId/tsw-stats?name=...` | TSW tournament history, W-L stats, and recent matches |
| `GET /api/player/:usabId/ranking-trend` | Historical ranking entries across cached date snapshots |
| `GET /api/h2h?player1=ID1&player2=ID2` | Head-to-head match history between two players |

### Tournaments

| Endpoint | Description |
| --- | --- |
| `GET /api/tournaments?season=YYYY-YYYY` | Tournament seasons, schedule, and spotlight |
| `GET /api/tournaments/:tswId/detail` | Tournament metadata, draws list |
| `GET /api/tournaments/:tswId/matches?d=YYYYMMDD` | Matches for a specific day |
| `GET /api/tournaments/:tswId/players` | Player list for a tournament |
| `GET /api/tournaments/:tswId/events` | Event list for a tournament |
| `GET /api/tournaments/:tswId/event-detail?eventId=` | Event entries and draws |
| `GET /api/tournaments/:tswId/draw-bracket?drawId=` | Bracket data (elimination or round-robin) |
| `GET /api/tournaments/:tswId/seeds` | Seedings by event |
| `GET /api/tournaments/:tswId/winners` | Final placements by event |
| `GET /api/tournaments/:tswId/medals` | Medal tally by club and draw |
| `GET /api/tournaments/:tswId/player-detail?playerId=` | Player matches within a tournament |
| `GET /api/tournaments/:tswId/player-schedule?playerId=` | Player upcoming match schedule with bracket predictions |

## Project Structure

```
├── api-server.mjs                  # Local Node.js API server
├── api/                            # Vercel serverless functions (production)
│   ├── _lib/
│   │   ├── shared.js               # TSW cookie wall, parsers, in-memory cache
│   │   ├── rankingsDiskCache.js     # Read/write rankings JSON disk cache
│   │   └── http.js                 # ApiError, sendJson, sendApiError helpers
│   ├── rankings.js
│   ├── all-players.js
│   ├── cached-dates.js
│   ├── player-directory.js
│   ├── h2h.js
│   ├── tournaments.js
│   ├── player/
│   │   ├── [id].js                 # Player detail
│   │   └── [id]/[action].js        # Player actions (tsw-stats, ranking-trend)
│   └── tournaments/
│       └── [tswId]/[action].js     # Tournament dynamic router (detail, matches, draws, etc.)
├── scripts/
│   ├── refresh-rankings-cache.mjs  # Fetch latest rankings into disk cache
│   ├── refresh-tournaments-cache.mjs  # Fetch season schedules from USAB
│   ├── refresh-medals-cache.mjs    # Compute and cache medal tallies
│   ├── scrape-tournament-fixtures.mjs  # Scrape full tournament data from TSW
│   ├── patch-tournaments-tsw.mjs   # Match USAB tournaments to TSW IDs
│   └── tsw-fetch.mjs              # Standalone TSW fetch utility
├── data/
│   ├── rankings-cache.json         # Pre-built rankings cache
│   ├── rankings-meta.json          # Default rankings date and metadata
│   ├── rankings-{date}.json        # Per-date ranking snapshots
│   ├── tournaments-{season}.json   # Season schedule files
│   ├── medals-{tswId}.json         # Per-tournament medal data
│   └── tournament-cache/{tswId}/   # Pre-scraped tournament data trees
├── .github/workflows/
│   ├── ci.yml                      # PR/push: test → lint:api → build
│   └── refresh-rankings-cache.yml  # Daily 08:00 UTC rankings refresh
├── docs/
│   ├── design/                     # Architecture and page-level design docs
│   └── vercel-analytics-setup.md   # Vercel Web Analytics configuration guide
├── public/
│   ├── a/script.js                 # First-party Vercel Analytics script
│   ├── manifest.json               # PWA manifest
│   └── sw.js                       # Service worker
├── index.html
├── vite.config.ts                  # Vite config (React, Tailwind, API proxy)
├── vercel.json                     # Vercel deployment config
├── eslint.config.js                # ESLint flat config
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx                    # App entry point
    ├── App.tsx                     # Provider tree, routing, error boundary, analytics
    ├── index.css                   # Global styles (Tailwind)
    ├── components/
    │   ├── Navbar.tsx              # Navigation bar (standard + tournament focus mode)
    │   ├── StatCard.tsx            # Stat display card
    │   ├── Toast.tsx               # Toast notification component
    │   └── tournament/
    │       ├── BracketView.tsx     # Elimination bracket rendering
    │       ├── RoundRobinView.tsx  # Round-robin standings and matches
    │       ├── MatchCard.tsx       # Shared match card component
    │       ├── SubPageLayout.tsx   # Tournament sub-page chrome
    │       ├── shared.tsx          # Tab helpers, loading/error/empty states
    │       └── tabs/               # DrawsTab, EventsTab, MatchesTab, MedalsTab,
    │                               # PlayersTab, SeedsTab, WatchlistTab, WinnersTab
    ├── contexts/
    │   ├── PlayersContext.tsx       # Global player data provider
    │   ├── ThemeContext.tsx         # Dark/light/system theme provider
    │   ├── TournamentFocusContext.tsx  # Tournament focus mode state
    │   └── WatchlistContext.tsx     # Per-tournament watchlist state
    ├── hooks/
    │   ├── useScrollRestore.ts     # Scroll position restoration on navigation
    │   └── useTournamentMeta.ts    # Tournament metadata resolution hook
    ├── pages/
    │   ├── Dashboard.tsx           # Home page with feature cards and spotlight
    │   ├── Players.tsx             # Rankings browser with stats and analytics
    │   ├── AllPlayers.tsx          # Full player directory
    │   ├── PlayerProfile.tsx       # Individual player detail
    │   ├── HeadToHead.tsx          # H2H comparison tool
    │   ├── Tournaments.tsx         # Tournament schedule by season
    │   ├── TournamentHub.tsx       # Tournament landing page with section pills
    │   ├── TournamentDrawDetail.tsx  # Draw bracket or round-robin view
    │   ├── TournamentEventDetail.tsx # Event entries and draws
    │   ├── TournamentPlayerDetail.tsx # Player matches within a tournament
    │   └── tournament/             # TournamentMatchesPage, TournamentPlayersPage,
    │                               # TournamentDrawsPage, TournamentEventsPage,
    │                               # TournamentSeedsPage, TournamentWinnersPage,
    │                               # TournamentMedalsPage, TournamentWatchlistPage,
    │                               # PlayerSchedulePage
    ├── services/
    │   └── rankingsService.ts      # API client functions with LRU caching
    ├── types/
    │   └── junior.ts               # TypeScript type definitions
    ├── constants/
    │   └── ageGroupStyles.ts       # Age-group-specific color schemes
    ├── utils/
    │   ├── tournamentFocus.ts      # Focus mode navigation helpers
    │   ├── tournamentReturnState.ts  # Tournament detail back-navigation state
    │   └── playerUtils.ts          # Player name/gender utility functions
    └── data/
        └── usaJuniorData.ts        # Static reference data (default rankings date)
```

## Data Freshness

Rankings data is refreshed automatically by a [GitHub Actions workflow](.github/workflows/refresh-rankings-cache.yml) that runs daily at 08:00 UTC. The workflow executes `scripts/refresh-rankings-cache.mjs`, and if the cache has changed, commits updated files back to the repo. You can also trigger a manual refresh from the GitHub Actions UI or locally with `npm run refresh-rankings-cache`.

Tournament season schedules are refreshed with `npm run refresh-tournaments-cache`. Individual tournament data (draws, matches, players) is scraped with `scripts/scrape-tournament-fixtures.mjs <tswId>`.

## Testing

Tests use [Vitest](https://vitest.dev/) and cover API contract tests, parser logic, and UI utilities:

```bash
npm test            # Run all tests
npm run test:watch  # Run in watch mode
```

Test files: `api/rankings.contract.test.ts`, `api/player-action.contract.test.ts`, `api/_lib/RankingsParser.test.ts`, `api/_lib/RoundRobin.test.ts`, `api/_lib/EliminationDraw.test.ts`, `src/pages/HeadToHead.test.ts`, `src/pages/BracketDisplay.test.ts`, `src/utils/tournamentFocus.test.ts`.

## CI/CD

GitHub Actions runs on every PR and push to `main`/`master`:

1. `npm test` — Vitest test suite
2. `npm run lint:api` — ESLint on API files
3. `npm run build` — TypeScript check + Vite production build

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Recharts, React Router 7, Lucide Icons
- **Backend:** Node.js HTTP server (zero external dependencies, pure `node:http`)
- **Deployment:** Vercel (serverless functions + static SPA)
- **Build:** Vite 7 with `@tailwindcss/vite`
- **Testing:** Vitest
- **Linting:** ESLint 9 (flat config)
- **Analytics:** Vercel Web Analytics (first-party script path)
- **Dev tooling:** concurrently, Playwright (screenshots)

## Design Documentation

Detailed architecture and page-level design docs are in [`docs/design/`](docs/design/README.md).
