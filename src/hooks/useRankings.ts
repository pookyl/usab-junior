import { useState, useEffect, useRef } from 'react';
import type { JuniorPlayer, AgeGroup, EventType, RankingsKey } from '../types/junior';
import { fetchRankings } from '../services/rankingsService';
import { staticRankings } from '../data/usaJuniorData';

export type DataSource = 'live' | 'static' | 'none';

export interface UseRankingsResult {
  players: JuniorPlayer[];
  loading: boolean;
  error: string | null;
  source: DataSource;
  refresh: () => void;
}

export function useRankings(ageGroup: AgeGroup, eventType: EventType): UseRankingsResult {
  const key: RankingsKey = `${ageGroup}-${eventType}`;
  const staticData = staticRankings[key] ?? [];

  const [players, setPlayers] = useState<JuniorPlayer[]>(staticData);
  const [loading, setLoading] = useState(staticData.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>(staticData.length > 0 ? 'static' : 'none');
  const fetchCount = useRef(0);

  const load = () => {
    const id = ++fetchCount.current;
    setLoading(true);
    setError(null);

    fetchRankings(ageGroup, eventType)
      .then((data) => {
        if (fetchCount.current !== id) return;
        setPlayers(data);
        setSource('live');
        setLoading(false);
      })
      .catch((err: Error) => {
        if (fetchCount.current !== id) return;
        if (staticData.length > 0) {
          setPlayers(staticData);
          setSource('static');
        } else {
          setSource('none');
          setError(err.message);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    // Always seed with static data immediately if available
    const cached = staticRankings[key];
    if (cached) {
      setPlayers(cached);
      setSource('static');
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroup, eventType]);

  return { players, loading, error, source, refresh: load };
}
