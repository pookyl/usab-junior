---
name: tsw-scraping
description: Fetch and parse HTML from TournamentSoftware.com (TSW), handling its cookie wall. Use when scraping TSW pages, adding new TSW data parsing, debugging TSW HTML structure, or when the user shares a tournamentsoftware.com URL.
---

# TSW Scraping

## Cookie Wall

TSW blocks requests without cookies. The project handles this via `tswFetch()` in `api/_lib/shared.js`, which:

1. POSTs to `/cookiewall/Save` to accept cookies
2. Sets sport selection to Badminton (`/sportselection/setsportselection/2`)
3. Caches cookies in memory with a TTL

**Never use raw `fetch()` for TSW URLs.** Always use `tswFetch(path)`.

## Quick Reference

### Fetching in API handlers

```js
import { tswFetch, TSW_BASE } from '../../_lib/shared.js';

const resp = await tswFetch('/tournament/{tswId}/player/{playerId}');
const html = await resp.text();
```

`tswFetch` accepts a **path** (not full URL). The base `https://www.tournamentsoftware.com` is prepended automatically.

### Manual inspection from terminal

```bash
node scripts/tsw-fetch.mjs <full-tsw-url>
node scripts/tsw-fetch.mjs <full-tsw-url> > output.html
node scripts/tsw-fetch.mjs <full-tsw-url> | grep "keyword"
```

Use this to inspect raw HTML before writing parsers.

### Bulk scraping a tournament

```bash
node scripts/scrape-tournament-fixtures.mjs <tswId>          # without player-id-map
node scripts/scrape-tournament-fixtures.mjs <tswId> --all    # includes player-id-map (slow)
```

Outputs to `data/tournament-cache/{tswId}/`. The API server (`api-server.mjs`) serves this cache automatically and sets `X-Source: cache` on responses.

## Parsing Conventions

All TSW HTML parsers live in `api/_lib/shared.js` and follow this pattern:

- Accept raw HTML string as input
- Use regex-based parsing (no DOM library)
- Return plain objects matching TypeScript types in `src/types/junior.ts`
- Export with `parseTsw*` naming (e.g., `parseTswPlayerMatches`, `parseTswOverviewStats`)

## Common TSW HTML Patterns

| Element | CSS Class | Contains |
|---------|-----------|----------|
| Player/tournament name | `media__title` | `nav-link__value` span with text |
| Member ID | `media__title-aside` | `(123456)` text |
| Subheading (org/date) | `media__subheading--muted` | Tournament-level info, NOT player club |
| Player events/partners | `media__subheading-wrapper` > `media__subheading` | Event entries like "BD U13 with Allen Wu" |
| Win-Loss stats | `progress-bar-container` | `flex-item` spans + `aria-valuenow` on progress bar |
| Match block | `<div class="match">` | Header items, team rows, scores |
| Team row | `match__row` | Player names in `match__row-title-value-content` |
| Player ID | `data-player-id="123"` | On player links within match rows |
| Scores | `<ul class="points">` | `points__cell` list items |

## API Response Pattern

TSW API handlers in `api/tournaments/[tswId]/[action].js` use raw Node.js `http.ServerResponse`:

```js
// Correct — raw Node.js response
res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify(data));

// WRONG — Express-style, will crash the server
res.status(200).json(data);
```

Use `setCors(res)` from shared.js for CORS headers. Use `getCached(key)` / `setCache(key, data)` for in-memory caching.
