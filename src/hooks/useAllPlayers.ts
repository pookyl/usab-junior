import { useState, useEffect, useRef } from 'react';
import type { UniquePlayer } from '../types/junior';
import { fetchAllPlayers } from '../services/rankingsService';
import { staticRankings } from '../data/usaJuniorData';
import type { DataSource } from './useRankings';

export interface UseAllPlayersResult {
  players: UniquePlayer[];
  loading: boolean;
  error: string | null;
  source: DataSource;
  refresh: () => void;
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

export function useAllPlayers(): UseAllPlayersResult {
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

  return { players, loading, error, source, refresh: load };
}
