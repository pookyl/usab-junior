import { useState, useEffect, useRef } from 'react';
import type { JuniorPlayer, AgeGroup, EventType, RankingsKey } from '../types/junior';
import { fetchRankings } from '../services/rankingsService';
import { staticRankings } from '../data/usaJuniorData';

export type DataSource = 'live' | 'cached' | 'none';

export interface UseRankingsResult {
  players: JuniorPlayer[];
  loading: boolean;
  error: string | null;
  source: DataSource;
  refresh: () => void;
}

export function useRankings(ageGroup: AgeGroup, eventType: EventType, date?: string): UseRankingsResult {
  const key: RankingsKey = `${ageGroup}-${eventType}`;
  const cachedData = staticRankings[key] ?? [];

  const [players, setPlayers] = useState<JuniorPlayer[]>(cachedData);
  const [loading, setLoading] = useState(cachedData.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>(cachedData.length > 0 ? 'cached' : 'none');
  const fetchCount = useRef(0);

  const load = () => {
    const id = ++fetchCount.current;
    setLoading(true);
    setError(null);

    fetchRankings(ageGroup, eventType, date)
      .then((data) => {
        if (fetchCount.current !== id) return;
        setPlayers(data);
        setSource('live');
        setLoading(false);
      })
      .catch((err: Error) => {
        if (fetchCount.current !== id) return;
        if (cachedData.length > 0) {
          setPlayers(cachedData);
          setSource('cached');
        } else {
          setSource('none');
          setError(err.message);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    const cached = staticRankings[key];
    if (cached) {
      setPlayers(cached);
      setSource('cached');
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroup, eventType, date]);

  return { players, loading, error, source, refresh: load };
}
