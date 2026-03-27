import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TournamentPlayer } from '../types/junior';
import { WATCHLIST_MAX, WATCHLIST_FORCE_ENABLED } from '../utils/urlFlags';

export { WATCHLIST_MAX } from '../utils/urlFlags';

const STORAGE_KEY = 'watchlist-data';
const LIST_COUNT = 3;
const TTL_DAYS = 7;

interface WatchlistEntry {
  name: string;
  players: TournamentPlayer[];
}

interface WatchlistStorage {
  tswId: string;
  tournamentEndDate: string;
  activeIndex: number;
  lists: [WatchlistEntry, WatchlistEntry, WatchlistEntry];
}

function defaultLists(): [WatchlistEntry, WatchlistEntry, WatchlistEntry] {
  return [
    { name: 'Watchlist 1', players: [] },
    { name: 'Watchlist 2', players: [] },
    { name: 'Watchlist 3', players: [] },
  ];
}

function loadStorage(): WatchlistStorage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as WatchlistStorage;
    if (!data.tswId || !Array.isArray(data.lists) || data.lists.length !== LIST_COUNT) return null;

    if (data.tournamentEndDate && !WATCHLIST_FORCE_ENABLED) {
      const end = new Date(data.tournamentEndDate + 'T00:00:00');
      if (!isNaN(end.getTime())) {
        const expiry = new Date(end.getTime() + TTL_DAYS * 86_400_000);
        if (new Date() > expiry) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
      }
    }

    return data;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveStorage(data: WatchlistStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota errors are non-critical */ }
}

export interface WatchlistContextValue {
  players: TournamentPlayer[];
  playerIds: Set<number>;
  maxPlayers: number;
  addPlayer: (player: TournamentPlayer) => void;
  removePlayer: (playerId: number) => void;
  clearAll: () => void;

  activeIndex: number;
  lists: { name: string; players: TournamentPlayer[] }[];
  switchList: (index: number) => void;
  renameList: (index: number, name: string) => void;

  boundTswId: string | null;
  bindTournament: (tswId: string, endDate: string) => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const stored = useRef(loadStorage());

  const [boundTswId, setBoundTswId] = useState<string | null>(stored.current?.tswId ?? null);
  const [endDate, setEndDate] = useState<string>(stored.current?.tournamentEndDate ?? '');
  const [activeIndex, setActiveIndex] = useState<number>(stored.current?.activeIndex ?? 0);
  const [lists, setLists] = useState<[WatchlistEntry, WatchlistEntry, WatchlistEntry]>(
    stored.current?.lists ?? defaultLists(),
  );

  // Persist to localStorage on every state change
  useEffect(() => {
    if (!boundTswId) return;
    saveStorage({ tswId: boundTswId, tournamentEndDate: endDate, activeIndex, lists });
  }, [boundTswId, endDate, activeIndex, lists]);

  const bindTournament = useCallback((tswId: string, tournamentEndDate: string) => {
    setBoundTswId(prev => {
      if (prev === tswId) {
        setEndDate(tournamentEndDate);
        return prev;
      }
      setEndDate(tournamentEndDate);
      setActiveIndex(0);
      setLists(defaultLists());
      return tswId;
    });
  }, []);

  const switchList = useCallback((index: number) => {
    if (index >= 0 && index < LIST_COUNT) setActiveIndex(index);
  }, []);

  const renameList = useCallback((index: number, name: string) => {
    if (index < 0 || index >= LIST_COUNT || !name.trim()) return;
    setLists(prev => {
      const next = [...prev] as [WatchlistEntry, WatchlistEntry, WatchlistEntry];
      next[index] = { ...next[index], name: name.trim() };
      return next;
    });
  }, []);

  const addPlayer = useCallback((player: TournamentPlayer) => {
    setLists(prev => {
      const entry = prev[activeIndex];
      if (entry.players.some(p => p.playerId === player.playerId)) return prev;
      if (entry.players.length >= WATCHLIST_MAX) return prev;
      const next = [...prev] as [WatchlistEntry, WatchlistEntry, WatchlistEntry];
      next[activeIndex] = { ...entry, players: [...entry.players, player] };
      return next;
    });
  }, [activeIndex]);

  const removePlayer = useCallback((playerId: number) => {
    setLists(prev => {
      const entry = prev[activeIndex];
      if (!entry.players.some(p => p.playerId === playerId)) return prev;
      const next = [...prev] as [WatchlistEntry, WatchlistEntry, WatchlistEntry];
      next[activeIndex] = { ...entry, players: entry.players.filter(p => p.playerId !== playerId) };
      return next;
    });
  }, [activeIndex]);

  const clearAll = useCallback(() => {
    setLists(prev => {
      const next = [...prev] as [WatchlistEntry, WatchlistEntry, WatchlistEntry];
      next[activeIndex] = { ...next[activeIndex], players: [] };
      return next;
    });
  }, [activeIndex]);

  const activeEntry = lists[activeIndex];
  const players = activeEntry.players;
  const playerIds = useMemo(() => new Set(players.map(p => p.playerId)), [players]);

  const value = useMemo<WatchlistContextValue>(() => ({
    players,
    playerIds,
    maxPlayers: WATCHLIST_MAX,
    addPlayer,
    removePlayer,
    clearAll,
    activeIndex,
    lists,
    switchList,
    renameList,
    boundTswId,
    bindTournament,
  }), [players, playerIds, addPlayer, removePlayer, clearAll, activeIndex, lists, switchList, renameList, boundTswId, bindTournament]);

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}
