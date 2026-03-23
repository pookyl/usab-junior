# Vercel Web Analytics — Setup & Lessons Learned

> **Project**: USAB Junior Badminton Hub (React + Vite SPA on Vercel)
> **Package**: `@vercel/analytics@^2.0.1`
> **Date**: March 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration Files](#configuration-files)
4. [Key Pitfalls & Solutions](#key-pitfalls--solutions)
5. [Applying to Another Project](#applying-to-another-project)
6. [Debugging](#debugging)
7. [FAQ](#faq)

---

## Overview

Vercel Web Analytics tracks **page views** and **unique visitors** on Vercel-hosted sites. For a React SPA (single-page app), extra configuration is required because:

- Route changes happen client-side (no full page reloads).
- Ad blockers and browser privacy features (Safari ITP, Brave Shield, uBlock Origin) block the default analytics script URL (`/_vercel/insights/script.js`).

Our setup solves both problems by:
1. Using custom **route-aware** pageview tracking with the React component.
2. Serving the analytics script from a **first-party path** (`/a/script.js`) to avoid ad-blocker filters.

---

## Architecture

```
Browser
  │
  ├─ Loads /a/script.js          ← static file in public/a/script.js
  │                                 (copy of /_vercel/insights/script.js)
  │
  └─ On each route change:
       React <Analytics> component
         ├─ calls pageview({ route, path })
         └─ script POSTs to /_vercel/insights/view   ← Vercel's built-in endpoint
                                                        (no proxy needed)
```

### Why not proxy the POST endpoint too?

We tried two approaches and both had problems:

| Approach | Result |
|----------|--------|
| `vercel.json` rewrite of `/a/:path*` → `/_vercel/insights/:path*` | **405 Method Not Allowed** — Vercel rewrites don't proxy POST to internal `/_vercel/*` paths |
| Serverless function `api/a/[type].js` as POST proxy | Worked, but added latency and complexity; ultimately unnecessary |

The analytics script only needs the **script file** to be served from a non-blocked path. The POST goes directly to `/_vercel/insights/view`, which ad blockers don't typically block (it's a first-party POST to the same domain, not a recognizable tracking URL pattern).

---

## Configuration Files

### 1. React Component — `src/App.tsx`

```tsx
import { Analytics } from '@vercel/analytics/react';
import { useLocation, matchPath } from 'react-router-dom';

const ROUTE_PATTERNS = [
  '/tournaments/:tswId/event/:eventId',
  '/tournaments/:tswId/draw/:drawId',
  '/tournaments/:tswId/player/:playerId',
  '/tournaments/:tswId/matches',
  '/tournaments/:tswId',
  '/directory/:id',
  '/players',
  '/directory',
  '/head-to-head',
  '/tournaments',
  '/',
];

function AnalyticsWithRoutes() {
  const { pathname } = useLocation();
  const route =
    ROUTE_PATTERNS.find(pattern => matchPath(pattern, pathname)) ?? pathname;

  return (
    <Analytics
      route={route}
      path={pathname}
      scriptSrc="/a/script.js"
      beforeSend={(event) => {
        if (new URLSearchParams(window.location.search).has('debug_analytics')) {
          console.log('[Analytics]', event);
        }
        return event;
      }}
    />
  );
}
```

**Critical props:**

| Prop | Purpose |
|------|---------|
| `route` | Parameterized route pattern (e.g. `/tournaments/:tswId`) for grouping in the dashboard. **Setting this disables auto-tracking.** |
| `path` | The actual pathname (e.g. `/tournaments/abc123`). **Required when `route` is set**, otherwise `pageview()` never fires. |
| `scriptSrc` | Custom path for the analytics script to avoid ad-blocker detection. |
| `beforeSend` | Optional hook for debugging; logs events when `?debug_analytics` is in the URL. |

> **Pitfall**: If you pass `route` without `path`, the component sets `disableAutoTrack: true` (because route-based tracking is enabled) but never calls `pageview()` (because `path` is falsy). Result: **zero pageviews are ever sent**. This was the root cause of our "0 visitors" bug.

### 2. Static Script File — `public/a/script.js`

This is a **direct copy** of the Vercel-generated analytics script. To obtain it:

```bash
curl -o public/a/script.js "https://<your-app>.vercel.app/_vercel/insights/script.js"
```

The file must be refreshed periodically if Vercel updates their analytics script version (check `sv` field in the payload — currently `0.1.3`).

### 3. Vercel Configuration — `vercel.json`

```json
{
  "rewrites": [
    { "source": "/((?!api/|a/).*)", "destination": "/index.html" }
  ]
}
```

The SPA catch-all rewrite sends all non-API routes to `index.html`. The `/a/` exclusion is **critical** — without it, requests to `/a/script.js` would be intercepted by the catch-all and return HTML instead of JavaScript, causing `SyntaxError: Unexpected token '<'`.

### 4. Build Version in Footer — `vite.config.ts`

```ts
export default defineConfig({
  define: {
    __VERCEL_GIT_COMMIT_SHA__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA ?? null
    ),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
});
```

Displays the git SHA and build date in the footer so you can always confirm which build is deployed.

---

## Key Pitfalls & Solutions

### 1. "0 Visitors" — Missing `path` prop

**Symptom**: Script loads, no errors in console, but no POST requests to `/_vercel/insights/view`.

**Cause**: The `<Analytics route={route} />` component disables auto-tracking when `route` is set. It then requires **both** `route` and `path` to fire `pageview()`. Without `path`, the condition `props.route && props.path` is false and no pageview is sent.

**Fix**: Always pass both `route` and `path`:
```tsx
<Analytics route={route} path={pathname} />
```

### 2. `SyntaxError: Unexpected token '<'` on script.js

**Symptom**: Browser console shows a syntax error on line 1 of `script.js`. The "script" is actually HTML.

**Cause**: The SPA catch-all rewrite in `vercel.json` was intercepting `/a/script.js` and returning `index.html`.

**Fix**: Two changes:
- Serve the script as a real static file at `public/a/script.js` (not via a rewrite to `/_vercel/*`).
- Exclude `/a/` from the SPA catch-all: `/((?!api/|a/).*)`.

### 3. Vercel rewrites cannot target `/_vercel/*` internal paths

**Symptom**: Rewrite `{ "source": "/a/script.js", "destination": "/_vercel/insights/script.js" }` silently fails; the catch-all serves HTML instead.

**Cause**: Vercel's internal `/_vercel/*` namespace is not available as a rewrite destination.

**Fix**: Download the script and serve it as a static file from `public/`.

### 4. Bot detection when testing with curl

**Symptom**: POST to `/_vercel/insights/view` returns `{"code":"bot_detected"}`.

**Cause**: Non-browser User-Agent string.

**Fix**: Use a realistic browser User-Agent header:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ..." \
  -d '{"o":"https://your-app.vercel.app/","sv":"0.1.3","ts":'$(date +%s000)'}' \
  "https://your-app.vercel.app/_vercel/insights/view"
```

### 5. Preview vs. Production analytics are separate

Vercel Analytics tracks preview and production deployments **independently**. A visitor on a preview URL does not appear in the production dashboard and vice versa. Select the correct environment filter in the Vercel dashboard.

### 6. Unique visitor deduplication

Vercel counts a "visitor" as a unique (IP + User-Agent) combination per time window. Visiting the same site 50 times from the same browser/network counts as **1 visitor**. Page views still increment.

---

## Applying to Another Project

### Minimal setup for a React + Vite SPA on Vercel:

1. **Install the package**:
   ```bash
   npm install @vercel/analytics
   ```

2. **Download the analytics script**:
   ```bash
   mkdir -p public/a
   curl -o public/a/script.js "https://<your-app>.vercel.app/_vercel/insights/script.js"
   ```

3. **Add the component** (inside your Router):
   ```tsx
   import { Analytics } from '@vercel/analytics/react';
   import { useLocation, matchPath } from 'react-router-dom';

   const ROUTE_PATTERNS = [
     // List all your parameterized routes here
     '/items/:id',
     '/items',
     '/',
   ];

   function AnalyticsWithRoutes() {
     const { pathname } = useLocation();
     const route =
       ROUTE_PATTERNS.find(p => matchPath(p, pathname)) ?? pathname;

     return <Analytics route={route} path={pathname} scriptSrc="/a/script.js" />;
   }
   ```

4. **Update `vercel.json`** — exclude `/a/` from the SPA catch-all:
   ```json
   {
     "rewrites": [
       { "source": "/((?!api/|a/).*)", "destination": "/index.html" }
     ]
   }
   ```

5. **Enable Web Analytics** in the Vercel dashboard:
   Project Settings → Analytics → Enable Web Analytics.

---

## Debugging

### Browser DevTools

1. Open **Network** tab, filter by `insights` or `view`.
2. On each navigation you should see a **POST** to `/_vercel/insights/view` with status **200**.
3. If no POST appears, check the Console for script loading errors.

### Debug mode

Append `?debug_analytics` to any page URL. The `beforeSend` callback logs each analytics event to the console:

```
[Analytics] { url: "https://...", route: "/tournaments/:tswId", ... }
```

### curl test

```bash
HOST="your-app.vercel.app"
curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -d "{\"o\":\"https://${HOST}/\",\"sv\":\"0.1.3\",\"ts\":$(date +%s000)}" \
  "https://${HOST}/_vercel/insights/view"
```

Expected: `200`. If `bot_detected`, check the User-Agent header.

---

## FAQ

**Q: Do I need to update `public/a/script.js` over time?**
A: Vercel occasionally updates their analytics script. If you notice analytics stop working after a Vercel platform update, re-download the script. Check the `sv` field in the POST payload to compare versions.

**Q: Does this work on mobile Safari / iPhone?**
A: Yes. Safari's Intelligent Tracking Prevention (ITP) blocks third-party tracking, but since both the script and the POST endpoint are first-party (same domain), ITP does not interfere.

**Q: Why not just use `<Analytics />` with no props?**
A: That works for basic tracking, but for an SPA you'll see raw URLs (e.g. `/tournaments/abc123`) instead of grouped route patterns (e.g. `/tournaments/:tswId`) in the dashboard. The `route` prop solves this — but requires `path` alongside it.

**Q: Can ad blockers still block this?**
A: The `/a/script.js` path avoids most filter lists. However, aggressive network-level blockers (Pi-hole, VPN-based blockers) that inspect response content rather than URLs could still block it. There's no client-side workaround for those.
