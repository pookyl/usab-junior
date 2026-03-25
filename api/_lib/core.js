import { getCached, setCache, setCors } from './runtime.js';

export const USAB_BASE = 'https://usabjrrankings.org';
export const TSW_BASE = 'https://www.tournamentsoftware.com';
export const TSW_ORG_CODE = 'C36A90FE-DFA8-414B-A8B6-F2BCF6B9B8BD';

export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export { getCached, setCache, setCors };

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

export function decodeHtmlEntities(str) {
  return str.replace(/&(#?\w+);/g, (match, code) => {
    if (ENTITY_MAP[code]) return ENTITY_MAP[code];
    if (code.startsWith('#x')) return String.fromCharCode(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCharCode(parseInt(code.slice(1), 10));
    return match;
  });
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function fetchWithRetry(url, options = {}, config = {}) {
  const retries = config.retries ?? 1;
  const timeoutMs = config.timeoutMs ?? 30_000;
  const baseDelayMs = config.baseDelayMs ?? 400;
  const retryableStatuses = config.retryableStatuses ?? RETRYABLE_STATUS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      const shouldRetry = !response.ok
        && attempt < retries
        && retryableStatuses.has(response.status);
      if (!shouldRetry) return response;
    } catch (err) {
      if (attempt >= retries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
  }
}
