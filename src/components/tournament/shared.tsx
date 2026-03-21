import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { isTournamentCached } from '../../services/rankingsService';

// ── Tab definitions ─────────────────────────────────────────────────────────

export const TABS = [
  { id: 'matches', label: 'Matches', icon: () => null },
  { id: 'players', label: 'Players', icon: () => null },
  { id: 'draws', label: 'Draws', icon: () => null },
  { id: 'events', label: 'Events', icon: () => null },
  { id: 'seeds', label: 'Seeds', icon: () => null },
  { id: 'winners', label: 'Winners', icon: () => null },
  { id: 'medals', label: 'Medals', icon: () => null },
] as const;

export type TabId = (typeof TABS)[number]['id'];

// ── Caches ──────────────────────────────────────────────────────────────────

export const UI_CACHE_MAX = 50;
export const tabDataCache = new Map<string, unknown>();

export function cappedMapSet<K, V>(map: Map<K, V>, key: K, value: V) {
  if (map.size >= UI_CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

// ── Shared helpers ──────────────────────────────────────────────────────────

export function TabLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 text-slate-400 dark:text-slate-500 py-16">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span>Loading {label}…</span>
    </div>
  );
}

export function TabError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="text-center text-red-500 dark:text-red-400 py-12">
      <p className="font-medium">Failed to load data</p>
      <p className="text-sm mt-1">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      )}
    </div>
  );
}

export function TabEmpty({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="text-center text-slate-400 dark:text-slate-500 py-16">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ── useTabData hook ─────────────────────────────────────────────────────────

export function useTabData<T>(tswId: string | undefined, active: boolean, fetcher: (id: string, refresh?: boolean) => Promise<T>, cacheKey?: string) {
  const fullKey = cacheKey && tswId ? `${tswId}:${cacheKey}` : '';
  const cached = fullKey ? tabDataCache.get(fullKey) as T | undefined : undefined;

  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(!!cached);
  const reqId = useRef(0);
  const refreshFlag = useRef(false);

  useEffect(() => {
    if (!tswId || !active || fetched) return;
    const currentReq = ++reqId.current;
    const isRefresh = refreshFlag.current;
    refreshFlag.current = false;
    setLoading(true);
    setError(null);
    fetcher(tswId, isRefresh)
      .then(d => {
        if (currentReq !== reqId.current) return;
        setData(d);
        setFetched(true);
        if (fullKey) cappedMapSet(tabDataCache, fullKey, d);
      })
      .catch(e => { if (currentReq === reqId.current) setError(e.message); })
      .finally(() => { if (currentReq === reqId.current) setLoading(false); });
  }, [tswId, active, fetched, fetcher, fullKey]);

  const retry = useCallback(() => {
    setError(null);
    setFetched(false);
  }, []);

  const refresh = useCallback(() => {
    if (fullKey) tabDataCache.delete(fullKey);
    refreshFlag.current = true;
    setError(null);
    setFetched(false);
  }, [fullKey]);

  return { data, loading, error, retry, refresh };
}

// ── Refresh button ──────────────────────────────────────────────────────────

export function RefreshButton({ onClick, loading, tswId }: { onClick: () => void; loading: boolean; tswId?: string }) {
  if (tswId && isTournamentCached(tswId)) return null;
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}

// ── Color helpers ───────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  BS: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  GS: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
  BD: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  GD: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
  XD: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
};

export function getEventColor(name: string) {
  const upper = name.toUpperCase();
  if (upper.startsWith('XD') || upper.includes('MIXED')) return EVENT_TYPE_COLORS.XD;
  if (upper.startsWith('GD') || upper.startsWith('GS')) return EVENT_TYPE_COLORS.GS;
  if (upper.startsWith('BD') || upper.startsWith('BS')) return EVENT_TYPE_COLORS.BS;
  return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' };
}

// ── Date helper ─────────────────────────────────────────────────────────────

export function todayYYYYMMDD(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}
