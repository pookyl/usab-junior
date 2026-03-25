import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TournamentPlayer } from '../types/junior';
import { useTournamentFocus } from './TournamentFocusContext';

const _parsedMax = parseInt(new URLSearchParams(window.location.search).get('watchlist_max') ?? '', 10);
export const WATCHLIST_MAX = Number.isFinite(_parsedMax) && _parsedMax > 0 ? _parsedMax : 7;

interface WatchlistContextValue {
  players: TournamentPlayer[];
  playerIds: Set<number>;
  maxPlayers: number;
  addPlayer: (player: TournamentPlayer) => void;
  removePlayer: (playerId: number) => void;
  clearAll: () => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { activeTswId } = useTournamentFocus();
  const [playerMap, setPlayerMap] = useState<Map<number, TournamentPlayer>>(new Map());
  const boundTswId = useRef<string | null>(null);
  const activeTswIdRef = useRef(activeTswId);

  useEffect(() => {
    activeTswIdRef.current = activeTswId;
    if (!activeTswId) return;
    if (boundTswId.current && activeTswId !== boundTswId.current) {
      setPlayerMap(new Map());
      boundTswId.current = null;
    }
  }, [activeTswId]);

  const addPlayer = useCallback((player: TournamentPlayer) => {
    setPlayerMap(prev => {
      if (prev.has(player.playerId)) return prev;
      if (prev.size >= WATCHLIST_MAX) return prev;
      if (activeTswIdRef.current) {
        boundTswId.current = activeTswIdRef.current;
      }
      const next = new Map(prev);
      next.set(player.playerId, player);
      return next;
    });
  }, []);

  const removePlayer = useCallback((playerId: number) => {
    setPlayerMap(prev => {
      if (!prev.has(playerId)) return prev;
      const next = new Map(prev);
      next.delete(playerId);
      if (next.size === 0) boundTswId.current = null;
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setPlayerMap(new Map());
    boundTswId.current = null;
  }, []);

  const players = useMemo(() => [...playerMap.values()], [playerMap]);
  const playerIds = useMemo(() => new Set(playerMap.keys()), [playerMap]);

  const value = useMemo(() => ({
    players,
    playerIds,
    maxPlayers: WATCHLIST_MAX,
    addPlayer,
    removePlayer,
    clearAll,
  }), [players, playerIds, addPlayer, removePlayer, clearAll]);

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
