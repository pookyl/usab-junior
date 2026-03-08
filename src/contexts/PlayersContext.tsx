import { createContext, useContext, useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { UniquePlayer } from '../types/junior';
import { fetchAllPlayers, fetchLatestDate, invalidateRankingsCache } from '../services/rankingsService';
import { cachedAllPlayers, RANKINGS_DATE } from '../data/usaJuniorData';

export type DataSource = 'live' | 'cached' | 'none';

interface PlayersContextValue {
  players: UniquePlayer[];
  loading: boolean;
  error: string | null;
  source: DataSource;
  rankingsDate: string;
  refresh: () => void;
  playerNameMap: Map<string, string>;
}

const PlayersContext = createContext<PlayersContextValue | null>(null);

export function PlayersProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<UniquePlayer[]>(cachedAllPlayers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>(cachedAllPlayers.length > 0 ? 'cached' : 'none');
  const [rankingsDate, setRankingsDate] = useState<string>(RANKINGS_DATE);
  const fetchCount = useRef(0);

  const load = (dateOverride?: string) => {
    const id = ++fetchCount.current;
    setLoading(true);
    setError(null);

    const doFetch = async () => {
      const date = dateOverride ?? rankingsDate;
      const data = await fetchAllPlayers(date);
      if (fetchCount.current !== id) return;
      setPlayers(data);
      setSource('live');
      setLoading(false);
    };

    doFetch().catch((err: Error) => {
      if (fetchCount.current !== id) return;
      if (cachedAllPlayers.length > 0) {
        setPlayers(cachedAllPlayers);
        setSource('cached');
      } else {
        setSource('none');
      }
      setError(err.message);
      setLoading(false);
    });
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { latestDate } = await fetchLatestDate();
        if (cancelled) return;

        if (latestDate && latestDate !== RANKINGS_DATE) {
          invalidateRankingsCache();
          setRankingsDate(latestDate);
          load(latestDate);
        } else {
          setSource('live');
        }
      } catch {
        if (cancelled) return;
      }
    })();

    return () => { cancelled = true; };
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
    <PlayersContext.Provider value={{ players, loading, error, source, rankingsDate, refresh: () => load(), playerNameMap }}>
      {children}
    </PlayersContext.Provider>
  );
}

export function usePlayers(): PlayersContextValue {
  const ctx = useContext(PlayersContext);
  if (!ctx) throw new Error('usePlayers must be used within PlayersProvider');
  return ctx;
}
