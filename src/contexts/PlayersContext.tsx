import { createContext, useContext, useState, useRef, useMemo, useCallback, type ReactNode } from 'react';
import type { UniquePlayer, DirectoryPlayer } from '../types/junior';
import { fetchAllPlayers, fetchCachedDates, fetchPlayerDirectory, invalidateRankingsCache } from '../services/rankingsService';
import { RANKINGS_DATE } from '../data/usaJuniorData';
import ToastContainer, { type ToastItem } from '../components/Toast';

export type DataSource = 'live' | 'cached' | 'none';

interface PlayersContextValue {
  players: UniquePlayer[];
  directoryPlayers: DirectoryPlayer[];
  directoryLoading: boolean;
  loading: boolean;
  error: string | null;
  source: DataSource;
  rankingsDate: string;
  availableDates: string[];
  changeDate: (date: string) => void;
  refresh: () => void;
  ensurePlayers: () => Promise<void>;
  ensureAvailableDates: () => Promise<void>;
  ensureDirectoryPlayers: () => Promise<void>;
  playerNameMap: Map<string, string[]>;
  playerIdSet: Set<string>;
}

const PlayersContext = createContext<PlayersContextValue | null>(null);

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

  const playerNameMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const nameSource = directoryPlayers.length > 0 ? directoryPlayers : players;
    for (const p of nameSource) {
      const allNames = 'names' in p && Array.isArray(p.names) ? p.names : [p.name];
      for (const name of allNames) {
        const key = name.toLowerCase();
        const ids = map.get(key);
        if (ids) {
          if (!ids.includes(p.usabId)) ids.push(p.usabId);
        } else {
          map.set(key, [p.usabId]);
        }
      }
    }
    return map;
  }, [directoryPlayers, players]);

  const playerIdSet = useMemo(() => {
    const set = new Set<string>();
    const source = directoryPlayers.length > 0 ? directoryPlayers : players;
    for (const p of source) set.add(p.usabId);
    return set;
  }, [directoryPlayers, players]);

  const refresh = useCallback(() => load(), [load]);

  const contextValue = useMemo(() => ({
    players, directoryPlayers, directoryLoading, loading, error,
    source, rankingsDate, availableDates, changeDate, refresh, ensurePlayers, ensureAvailableDates,
    ensureDirectoryPlayers, playerNameMap, playerIdSet,
  }), [players, directoryPlayers, directoryLoading, loading, error,
       source, rankingsDate, availableDates, changeDate, refresh, ensurePlayers, ensureAvailableDates,
       ensureDirectoryPlayers, playerNameMap, playerIdSet]);

  return (
    <PlayersContext.Provider value={contextValue}>
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
