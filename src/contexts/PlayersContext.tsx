import { createContext, useContext, useState, useRef, useMemo, useCallback, type ReactNode } from 'react';
import type { UniquePlayer, DirectoryPlayer } from '../types/junior';
import { fetchAllPlayers, fetchCachedDates, fetchPlayerDirectory, invalidateRankingsCache } from '../services/rankingsService';
import { RANKINGS_DATE } from '../data/usaJuniorData';
import ToastContainer, { type ToastItem } from '../components/Toast';

export type DataSource = 'live' | 'cached' | 'none';

interface PlayersRankingsContextValue {
  players: UniquePlayer[];
  loading: boolean;
  error: string | null;
  source: DataSource;
  rankingsDate: string;
  availableDates: string[];
  changeDate: (date: string) => void;
  refresh: () => void;
  ensurePlayers: () => Promise<void>;
  ensureAvailableDates: () => Promise<void>;
}

interface PlayersDirectoryContextValue {
  directoryPlayers: DirectoryPlayer[];
  directoryLoading: boolean;
  ensureDirectoryPlayers: () => Promise<void>;
}

type PlayersContextValue = PlayersRankingsContextValue & PlayersDirectoryContextValue;

const PlayersRankingsContext = createContext<PlayersRankingsContextValue | null>(null);
const PlayersDirectoryContext = createContext<PlayersDirectoryContextValue | null>(null);

let nextToastId = 0;

export function PlayersProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<UniquePlayer[]>([]);
  const [directoryPlayers, setDirectoryPlayers] = useState<DirectoryPlayer[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>('none');
  const [rankingsDate, setRankingsDate] = useState<string>(RANKINGS_DATE);
  const [availableDates, setAvailableDates] = useState<string[]>([RANKINGS_DATE]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const fetchCount = useRef(0);
  const lastGoodPlayers = useRef<UniquePlayer[]>([]);
  const lastGoodDate = useRef<string>(RANKINGS_DATE);
  const playersPromise = useRef<Promise<void> | null>(null);
  const datesPromise = useRef<Promise<void> | null>(null);
  const directoryPromise = useRef<Promise<void> | null>(null);

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

    const promise = (async () => {
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
    })().catch((err: Error) => {
      if (fetchCount.current !== id) return;
      const hadData = lastGoodPlayers.current.length > 0;
      setPlayers(lastGoodPlayers.current);
      setRankingsDate(lastGoodDate.current);
      setSource(hadData ? 'cached' : 'none');
      setError(err.message);
      setLoading(false);

      if (hadData) {
        pushToast(`Could not load rankings — showing previous data`, 'error');
      }
    }).finally(() => {
      if (playersPromise.current === promise) {
        playersPromise.current = null;
      }
    });

    playersPromise.current = promise;
    return promise;
  }, [rankingsDate, pushToast]);

  const ensurePlayers = useCallback(async () => {
    if (playersPromise.current) {
      await playersPromise.current;
      return;
    }
    if (lastGoodPlayers.current.length > 0 && lastGoodDate.current === rankingsDate) {
      return;
    }
    await load(rankingsDate);
  }, [load, rankingsDate]);

  const ensureAvailableDates = useCallback(async () => {
    if (availableDates.length > 1) return;
    if (!datesPromise.current) {
      datesPromise.current = (async () => {
        try {
          const cachedDates = await fetchCachedDates();
          if (cachedDates.length > 0) setAvailableDates(cachedDates);
        } catch {
          // Keep default availableDates.
        } finally {
          datesPromise.current = null;
        }
      })();
    }
    await datesPromise.current;
  }, [availableDates.length]);

  const ensureDirectoryPlayers = useCallback(async () => {
    if (directoryPlayers.length > 0) return;
    if (!directoryPromise.current) {
      directoryPromise.current = (async () => {
        setDirectoryLoading(true);
        try {
          const dir = await fetchPlayerDirectory();
          if (dir.length > 0) setDirectoryPlayers(dir);
        } finally {
          setDirectoryLoading(false);
          directoryPromise.current = null;
        }
      })();
    }
    await directoryPromise.current;
  }, [directoryPlayers.length]);

  const changeDate = useCallback((date: string) => {
    if (date === rankingsDate) return;
    invalidateRankingsCache();
    setRankingsDate(date);
    void load(date);
  }, [rankingsDate, load]);

  const refresh = useCallback(() => load(), [load]);

  const rankingsValue = useMemo(() => ({
    players,
    loading,
    error,
    source,
    rankingsDate,
    availableDates,
    changeDate,
    refresh,
    ensurePlayers,
    ensureAvailableDates,
  }), [players, loading, error, source, rankingsDate, availableDates, changeDate, refresh, ensurePlayers, ensureAvailableDates]);

  const directoryValue = useMemo(() => ({
    directoryPlayers,
    directoryLoading,
    ensureDirectoryPlayers,
  }), [directoryPlayers, directoryLoading, ensureDirectoryPlayers]);

  return (
    <PlayersRankingsContext.Provider value={rankingsValue}>
      <PlayersDirectoryContext.Provider value={directoryValue}>
        {children}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </PlayersDirectoryContext.Provider>
    </PlayersRankingsContext.Provider>
  );
}

export function usePlayersRankings(): PlayersRankingsContextValue {
  const ctx = useContext(PlayersRankingsContext);
  if (!ctx) throw new Error('usePlayers must be used within PlayersProvider');
  return ctx;
}

export function usePlayersDirectory(): PlayersDirectoryContextValue {
  const ctx = useContext(PlayersDirectoryContext);
  if (!ctx) throw new Error('usePlayers must be used within PlayersProvider');
  return ctx;
}

export function usePlayers(): PlayersContextValue {
  return {
    ...usePlayersRankings(),
    ...usePlayersDirectory(),
  };
}
