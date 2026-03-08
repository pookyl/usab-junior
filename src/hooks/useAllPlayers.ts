import { useState, useEffect, useRef } from 'react';
import type { UniquePlayer } from '../types/junior';
import { fetchAllPlayers } from '../services/rankingsService';
import { cachedAllPlayers } from '../data/usaJuniorData';
export type DataSource = 'live' | 'cached' | 'none';

export interface UseAllPlayersResult {
  players: UniquePlayer[];
  loading: boolean;
  error: string | null;
  source: DataSource;
  refresh: () => void;
}

export function useAllPlayers(): UseAllPlayersResult {
  const [players, setPlayers] = useState<UniquePlayer[]>(cachedAllPlayers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>(cachedAllPlayers.length > 0 ? 'cached' : 'none');
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { players, loading, error, source, refresh: load };
}
