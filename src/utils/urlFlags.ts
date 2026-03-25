/**
 * URL flags captured once at app startup.
 *
 * These are read from the initial page load URL so that lazy-loaded modules
 * (which evaluate after SPA navigation may have changed the URL) still see them.
 */
const _params = new URLSearchParams(window.location.search);

export const WATCHLIST_FORCE_ENABLED = _params.has('watchlist_enable');

const _parsedMax = parseInt(_params.get('watchlist_max') ?? '', 10);
export const WATCHLIST_MAX = Number.isFinite(_parsedMax) && _parsedMax > 0 ? _parsedMax : 7;
