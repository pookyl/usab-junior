import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TournamentPlayer } from '../types/junior';
import { useTournamentFocus } from './TournamentFocusContext';

interface WatchlistContextValue {
  players: TournamentPlayer[];
  playerIds: Set<number>;
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
  activeTswIdRef.current = activeTswId;

  useEffect(() => {
    if (!activeTswId) return;
    if (boundTswId.current && activeTswId !== boundTswId.current) {
      setPlayerMap(new Map());
      boundTswId.current = null;
    }
  }, [activeTswId]);

  const addPlayer = useCallback((player: TournamentPlayer) => {
    setPlayerMap(prev => {
      if (prev.has(player.playerId)) return prev;
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
