import {
  BROWSER_HEADERS,
  TSW_BASE,
  TSW_ORG_CODE,
  fetchWithRetry,
} from './core.js';

let tswCookies = '';
let tswCookiesTimestamp = 0;
const COOKIE_TTL_MS = 30 * 60 * 1000;
let cookiePromise = null;

function parseCookieMap(cookieStr) {
  const map = new Map();
  if (!cookieStr) return map;
  for (const cookie of cookieStr.split('; ')) {
    const idx = cookie.indexOf('=');
    if (idx > -1) map.set(cookie.slice(0, idx), cookie.slice(idx + 1));
    else map.set(cookie, '');
  }
  return map;
}

async function fetchTswCookies() {
  try {
    const resp = await fetchWithRetry(`${TSW_BASE}/cookiewall/Save`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${TSW_BASE}/cookiewall`,
      },
      body: 'ReturnUrl=%2F&CookiePurposes=1&CookiePurposes=2&SettingsOpen=false',
      redirect: 'manual',
    }, { timeoutMs: 20_000, retries: 1 });
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    tswCookies = setCookies.map((cookie) => cookie.split(';')[0]).join('; ');

    const sportResp = await fetchWithRetry(
      `${TSW_BASE}/sportselection/setsportselection/2?returnUrl=%2F`,
      { headers: { ...BROWSER_HEADERS, Cookie: tswCookies }, redirect: 'manual' },
      { timeoutMs: 20_000, retries: 1 },
    );
    const sportCookies = sportResp.headers.getSetCookie?.() ?? [];
    if (sportCookies.length) {
      const existing = parseCookieMap(tswCookies);
      for (const cookie of sportCookies) {
        const [pair] = cookie.split(';');
        const [key, ...rest] = pair.split('=');
        existing.set(key, rest.join('='));
      }
      tswCookies = [...existing].map(([key, value]) => `${key}=${value}`).join('; ');
    }
    tswCookiesTimestamp = Date.now();
  } catch (err) {
    console.error('[tsw] cookie setup failed:', err.message);
  } finally {
    cookiePromise = null;
  }
}

export async function ensureTswCookies() {
  if (tswCookies && (Date.now() - tswCookiesTimestamp) < COOKIE_TTL_MS) return;
  tswCookies = '';
  if (!cookiePromise) cookiePromise = fetchTswCookies();
  await cookiePromise;
}

export async function tswFetch(path, opts = {}) {
  await ensureTswCookies();
  const url = `${TSW_BASE}${path}`;
  return fetchWithRetry(url, {
    method: opts.method || 'GET',
    headers: {
      ...BROWSER_HEADERS,
      Cookie: tswCookies,
      'X-Requested-With': 'XMLHttpRequest',
      ...opts.extraHeaders,
    },
    body: opts.body !== undefined ? opts.body : undefined,
  }, {
    timeoutMs: opts.timeoutMs ?? 30_000,
    retries: opts.retries ?? 1,
  });
}

export function tswUsabProfilePath(usabId) {
  const encoded = Buffer.from(`base64:${usabId}`).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}`;
}

export function tswUsabTournamentsPath(usabId) {
  const encoded = Buffer.from(`base64:${usabId}`).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}/tournaments/TournamentsPartial`;
}

export function tswUsabOverviewPath(usabId) {
  const encoded = Buffer.from(`base64:${usabId}`).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}/OverviewPartial`;
}
