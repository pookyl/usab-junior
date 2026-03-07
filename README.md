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

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later

### Install and Run

```bash
# Clone the repository
git clone https://github.com/<your-username>/badminton.git
cd badminton

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

| Command           | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `npm run dev`     | Start Vite dev server + API server concurrently             |
| `npm run build`   | Type-check with TypeScript and build for production         |
| `npm run start`   | Start API server only (serves `dist/` and API on port 3001) |
| `npm run preview` | Preview the production build via Vite                       |
| `npm run lint`    | Run ESLint                                                  |

## API Endpoints

All endpoints are served by `api-server.mjs` on port 3001.

| Endpoint | Description |
| --- | --- |
| `GET /api/latest-date` | Latest available ranking date and all available dates |
| `GET /api/rankings?age_group=U13&category=BS&date=...` | Rankings for a specific age group + event |
| `GET /api/all-players?date=...` | All ranked players across every age group and event |
| `GET /api/player/:usabId?age_group=U11&category=BS&date=...` | USAB ranking detail for a player |
| `GET /api/player/:usabId/tsw-stats?name=...` | Tournament history, W-L stats, and recent matches from TournamentSoftware |
| `GET /api/h2h?player1=ID1&player2=ID2` | Head-to-head match history between two players |

## Project Structure

```
├── api-server.mjs            # Node.js API proxy server
├── index.html                # HTML entry point
├── vite.config.ts            # Vite config (React, Tailwind, API proxy)
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
└── data/
    └── rankings-cache.json   # Auto-generated disk cache (git-ignored)
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Recharts, React Router 7, Lucide Icons
- **Backend:** Node.js HTTP server (zero dependencies, pure `node:http`)
- **Build:** Vite 7
- **Dev tooling:** ESLint, concurrently
