# Performance Report

## What Changed

- Narrowed `vercel.json` function bundling so routes no longer ship all of `data/**`.
- Split hot rankings/player routes away from the monolithic backend shared import into smaller modules:
  - `api/_lib/core.js`
  - `api/_lib/rankingsData.js`
  - `api/_lib/tswStats.js`
  - `api/_lib/tswH2h.js`
- Extracted shared tournament disk-cache resolution into `api/_lib/tournamentDiskCache.js` and reused it from both `api-server.mjs` and `api/tournaments/[tswId]/[action].js`.
- Switched player directory and ranking trend APIs to precomputed indexes instead of historical scans.
- Made rankings index refresh incremental in `scripts/refresh-rankings-cache.mjs`.
- Added reusable TSW lookup artifacts in `scripts/refresh-tournaments-cache.mjs`:
  - `data/tournament-tsw-lookup.json`
  - `data/tournament-tsw-details.json`
- Changed `src/contexts/PlayersContext.tsx` to lazy-load rankings data on page demand instead of fetching `all-players` on provider mount.

## Measurements

Warm local API benchmark, 5 samples per route.

| Endpoint | Before p95 | After p95 | Notes |
| --- | ---: | ---: | --- |
| `/api/cached-dates` | 1.6 ms | 1.3 ms | unchanged |
| `/api/rankings?age_group=U13&category=BS` | 3.4 ms | 3.0 ms | unchanged on warm cache |
| `/api/all-players` | 2.9 ms | 2.9 ms | unchanged on warm cache |
| `/api/player-directory` | 119.5 ms | 2.6 ms | now index-first |
| `/api/player/:id/ranking-trend` | 50.6 ms | 32.4 ms | now index-first |
| `/api/tournaments?spotlight=true` | 50.7 ms | 14.3 ms | benefited from fresh cache / lighter path |

Client bundle:

- Before main entry chunk: `270.97 kB` (`86.75 kB` gzip)
- After main entry chunk: `271.41 kB` (`86.88 kB` gzip)
- After total JS: `933428 B` (`287778 B` gzip)
- After total CSS: `102310 B` (`14774 B` gzip)

Refresh runtime:

- `npm run refresh-rankings-cache -- --rebuild-indexes`: about `0.31s`
- `npm run refresh-tournaments-cache`: about `8.47s` for the current season refresh run

Notes:

- This slice was backend-heavy, so frontend bundle size stayed effectively flat.
- The biggest measured gain is the removal of scan-based player directory work.
- Serverless cold-start improvement was addressed structurally through narrower `includeFiles`, but not directly benchmarked here against a deployed environment.

## Rerun

```bash
npm run measure:api
npm run build
npm run measure:dist
npm run refresh-rankings-cache -- --rebuild-indexes
npm run refresh-tournaments-cache
```
