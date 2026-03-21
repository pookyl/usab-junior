# USA Badminton Junior Rankings Dashboard

A web application for exploring USA Badminton junior player rankings, tournament results, player profiles, head-to-head records, and analytics. Data is sourced live from [usabjrrankings.org](https://usabjrrankings.org) and [tournamentsoftware.com](https://www.tournamentsoftware.com).

## Features

- **Dashboard** — Overview of all age groups (U11–U19) with player counts, gender breakdowns, and top-ranked players
- **Rankings** — Browse rankings by age group and event type (BS, GS, BD, GD, XD) with date selection
- **Player Directory** — Searchable directory of all ranked junior players across every category
- **Player Profiles** — Detailed view with ranking history, tournament results, win/loss stats (singles, doubles, mixed), and recent match history
- **Head-to-Head** — Compare two players' match history with scores, tournament context, and career W-L records
- **Analytics** — Charts and insights across the player pool

## Architecture

The app consists of two parts that run together:

1. **Vite + React frontend** (port 5173) — SPA with client-side routing
2. **Node.js API server** (port 3001) — Lightweight proxy that fetches and parses HTML from USAB and TournamentSoftware, avoiding browser CORS issues. Includes in-memory caching (10-min TTL) and persistent disk caching as a fallback.

In development, Vite proxies `/api/*` requests to the API server automatically.

### Deployment (Vercel)

In production the app is deployed to **Vercel**. The `api/` directory contains serverless functions that mirror the local API server, with shared parsing and caching logic in `api/_lib/shared.js`. The built frontend is served as a static SPA with a catch-all rewrite (see `vercel.json`).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later

### Install and Run

```bash
# Clone the repository
git clone https://github.com/<your-username>/usab-junior.git
cd usab-junior

# Install dependencies (required after every fresh clone)
npm install

# Start development server (frontend + API)
npm run dev
```

The app will be available at **http://localhost:5173**.

> **Note:** `node_modules/` is not stored in git. You must run `npm install` before `npm run dev` every time you clone or pull the repo on a new machine. The `package-lock.json` file ensures everyone gets identical dependency versions.

### Production Build

```bash
npm run build     # Type-check + build into dist/
npm run start     # Start the API server (also serves dist/ as static files)
```

The production server runs on **http://localhost:3001** and serves both the API and the built frontend.

## Scripts

| Command                          | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                    | Start Vite dev server + API server concurrently                |
| `npm run dev:restart`            | Kill any running dev processes and restart                     |
| `npm run api`                    | Start the API server only (port 3001)                          |
| `npm run build`                  | Type-check with TypeScript and build for production            |
| `npm run start`                  | Start API server (serves `dist/` and API on port 3001)         |
| `npm run refresh-rankings-cache` | Fetch latest rankings and write `data/rankings-cache.json`     |
| `npm run preview`                | Preview the production build via Vite                          |
| `npm run lint`                   | Run ESLint                                                     |

## API Endpoints

All endpoints are served by `api-server.mjs` on port 3001.

| Endpoint | Description |
| --- | --- |
| `GET /api/cached-dates` | Ranking dates available in disk cache |
| `GET /api/rankings?age_group=U13&category=BS&date=...` | Rankings for a specific age group + event |
| `GET /api/all-players?date=...` | All ranked players across every age group and event |
| `GET /api/player-directory` | Cumulative directory of players across cached dates |
| `GET /api/player/:usabId?age_group=U11&category=BS&date=...` | USAB ranking detail for a player |
| `GET /api/player/:usabId/tsw-stats?name=...` | Tournament history, W-L stats, and recent matches from TournamentSoftware |
| `GET /api/player/:usabId/ranking-trend` | Historical ranking entries across cached dates |
| `GET /api/h2h?player1=ID1&player2=ID2` | Head-to-head match history between two players |
| `GET /api/tournaments` | Tournament seasons + spotlight from cached season files |

## Project Structure

```
├── api-server.mjs            # Local Node.js API proxy server
├── api/                      # Vercel serverless functions (production)
│   ├── _lib/shared.js        # Shared parsers, caching, and TSW helpers
│   ├── rankings.js
│   ├── all-players.js
│   ├── cached-dates.js
│   ├── player-directory.js
│   ├── h2h.js
│   └── player/
│       ├── [id].js                # Player detail
│       └── [id]/[action].js       # Player actions (tsw-stats, ranking-trend)
├── scripts/
│   └── refresh-rankings-cache.mjs  # Fetch latest rankings into disk cache
├── .github/workflows/
│   └── refresh-rankings-cache.yml  # Daily GitHub Action to refresh cache
├── data/
│   └── rankings-cache.json   # Pre-built rankings cache (committed for Vercel fallback)
├── index.html                # HTML entry point
├── vite.config.ts            # Vite config (React, Tailwind, API proxy)
├── vercel.json               # Vercel deployment config
├── package.json
├── tsconfig.json
├── src/
│   ├── main.tsx              # App entry point
│   ├── App.tsx               # Routes and layout
│   ├── index.css             # Global styles (Tailwind)
│   ├── components/
│   │   ├── Navbar.tsx        # Navigation bar
│   │   ├── RadarChart.tsx    # Radar chart component
│   │   └── StatCard.tsx      # Stat display card
│   ├── contexts/
│   │   └── PlayersContext.tsx # Global player data provider
│   ├── hooks/
│   │   ├── useRankings.ts    # Hook for fetching rankings
│   │   └── useAllPlayers.ts  # Hook for all-players endpoint
│   ├── pages/
│   │   ├── Dashboard.tsx     # Home page with age group overview
│   │   ├── Players.tsx       # Rankings browser
│   │   ├── AllPlayers.tsx    # Full player directory
│   │   ├── PlayerProfile.tsx # Individual player detail
│   │   ├── Analytics.tsx     # Charts and analytics
│   │   └── HeadToHead.tsx    # Player comparison
│   ├── services/
│   │   └── rankingsService.ts # API client functions
│   ├── types/
│   │   └── junior.ts         # TypeScript type definitions
│   └── data/
│       ├── mockData.ts       # Mock/fallback data
│       └── usaJuniorData.ts  # Static reference data
```

## Data Freshness

Rankings data is refreshed automatically by a [GitHub Actions workflow](.github/workflows/refresh-rankings-cache.yml) that runs daily at 08:00 UTC. The workflow executes `scripts/refresh-rankings-cache.mjs`, and if the cache has changed, commits the updated `data/rankings-cache.json` back to the repo. You can also trigger a manual refresh from the GitHub Actions UI or locally with `npm run refresh-rankings-cache`.

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Recharts, React Router 7, Lucide Icons
- **Backend:** Node.js HTTP server (zero dependencies, pure `node:http`)
- **Deployment:** Vercel (serverless functions + static SPA)
- **Build:** Vite 7
- **Dev tooling:** ESLint, Playwright, concurrently
