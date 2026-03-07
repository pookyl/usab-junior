import { createContext, useContext, useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { UniquePlayer } from '../types/junior';
import { fetchAllPlayers } from '../services/rankingsService';
import { staticRankings } from '../data/usaJuniorData';

export type DataSource = 'live' | 'static' | 'none';

interface PlayersContextValue {
  players: UniquePlayer[];
  loading: boolean;
  error: string | null;
  source: DataSource;
  refresh: () => void;
  playerNameMap: Map<string, string>;
}

function buildStaticPlayers(): UniquePlayer[] {
  const map = new Map<string, UniquePlayer>();
  for (const players of Object.values(staticRankings)) {
    if (!players) continue;
    for (const p of players) {
      if (!map.has(p.usabId)) {
        map.set(p.usabId, { usabId: p.usabId, name: p.name, entries: [] });
      }
      map.get(p.usabId)!.entries.push({
        ageGroup: p.ageGroup,
        eventType: p.eventType,
        rank: p.rank,
        rankingPoints: p.rankingPoints,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const staticPlayers = buildStaticPlayers();

const PlayersContext = createContext<PlayersContextValue | null>(null);

export function PlayersProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<UniquePlayer[]>(staticPlayers);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>(staticPlayers.length > 0 ? 'static' : 'none');
  const fetchCount = useRef(0);

  const load = () => {
    const id = ++fetchCount.current;
    setLoading(true);
    setError(null);

    fetchAllPlayers()
      .then((data) => {
        if (fetchCount.current !== id) return;
        setPlayers(data);
        setSource('live');
        setLoading(false);
      })
      .catch((err: Error) => {
        if (fetchCount.current !== id) return;
        if (staticPlayers.length > 0) {
          setPlayers(staticPlayers);
          setSource('static');
        } else {
          setSource('none');
        }
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) {
      map.set(p.name.toLowerCase(), p.usabId);
    }
    return map;
  }, [players]);

  return (
    <PlayersContext.Provider value={{ players, loading, error, source, refresh: load, playerNameMap }}>
      {children}
    </PlayersContext.Provider>
  );
}

export function usePlayers(): PlayersContextValue {
  const ctx = useContext(PlayersContext);
  if (!ctx) throw new Error('usePlayers must be used within PlayersProvider');
  return ctx;
}
