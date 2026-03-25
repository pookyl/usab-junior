import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TournamentPlayer } from '../types/junior';
import { WATCHLIST_MAX } from '../utils/urlFlags';

export { WATCHLIST_MAX } from '../utils/urlFlags';

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
  const [playerMap, setPlayerMap] = useState<Map<number, TournamentPlayer>>(new Map());

  const addPlayer = useCallback((player: TournamentPlayer) => {
    setPlayerMap(prev => {
      if (prev.has(player.playerId)) return prev;
      if (prev.size >= WATCHLIST_MAX) return prev;
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
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setPlayerMap(new Map());
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
