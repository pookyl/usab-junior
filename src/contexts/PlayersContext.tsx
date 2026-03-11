import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import type { UniquePlayer } from '../types/junior';
import { fetchAllPlayers, fetchCachedDates, invalidateRankingsCache } from '../services/rankingsService';
import { RANKINGS_DATE } from '../data/usaJuniorData';
import ToastContainer, { type ToastItem } from '../components/Toast';

export type DataSource = 'live' | 'cached' | 'none';

interface PlayersContextValue {
  players: UniquePlayer[];
  loading: boolean;
  error: string | null;
  source: DataSource;
  rankingsDate: string;
  availableDates: string[];
  changeDate: (date: string) => void;
  refresh: () => void;
  playerNameMap: Map<string, string[]>;
}

const PlayersContext = createContext<PlayersContextValue | null>(null);

let nextToastId = 0;

export function PlayersProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<UniquePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>('none');
  const [rankingsDate, setRankingsDate] = useState<string>(RANKINGS_DATE);
  const [availableDates, setAvailableDates] = useState<string[]>([RANKINGS_DATE]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const fetchCount = useRef(0);
  const lastGoodPlayers = useRef<UniquePlayer[]>([]);
  const lastGoodDate = useRef<string>(RANKINGS_DATE);

  const pushToast = useCallback((message: string, type: ToastItem['type']) => {
    const id = String(++nextToastId);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const load = useCallback((dateOverride?: string) => {
    const id = ++fetchCount.current;
    setLoading(true);
    setError(null);

    const doFetch = async () => {
      const date = dateOverride ?? rankingsDate;
      const result = await fetchAllPlayers(date);
      if (fetchCount.current !== id) return;
      lastGoodPlayers.current = result.players;
      lastGoodDate.current = date;
      setPlayers(result.players);
      setSource('live');
      setLoading(false);

      if (result.partial) {
        const cats = result.failedCategories.join(', ');
        pushToast(`Some categories could not be loaded: ${cats}`, 'warning');
      }
    };

    doFetch().catch((err: Error) => {
      if (fetchCount.current !== id) return;
      const hadData = lastGoodPlayers.current.length > 0;
      setPlayers(lastGoodPlayers.current);
      setRankingsDate(lastGoodDate.current);
      setSource(hadData ? 'live' : 'none');
      setError(err.message);
      setLoading(false);

      if (hadData) {
        pushToast(`Could not load rankings — showing previous data`, 'error');
      }
    });
  }, [rankingsDate, pushToast]);

  const changeDate = useCallback((date: string) => {
    if (date === rankingsDate) return;
    invalidateRankingsCache();
    setRankingsDate(date);
    load(date);
  }, [rankingsDate, load]);

  // Auto-fetch on mount + load available dates
  useEffect(() => {
    load(RANKINGS_DATE);

    let cancelled = false;
    (async () => {
      try {
        const cachedDates = await fetchCachedDates();
        if (cancelled) return;
        if (cachedDates.length > 0) setAvailableDates(cachedDates);
      } catch {
        // keep default availableDates
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playerNameMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of players) {
      const key = p.name.toLowerCase();
      const ids = map.get(key);
      if (ids) {
        ids.push(p.usabId);
      } else {
        map.set(key, [p.usabId]);
      }
    }
    return map;
  }, [players]);

  return (
    <PlayersContext.Provider value={{ players, loading, error, source, rankingsDate, availableDates, changeDate, refresh: () => load(), playerNameMap }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </PlayersContext.Provider>
  );
}

export function usePlayers(): PlayersContextValue {
  const ctx = useContext(PlayersContext);
  if (!ctx) throw new Error('usePlayers must be used within PlayersProvider');
  return ctx;
}
