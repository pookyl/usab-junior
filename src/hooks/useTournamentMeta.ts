import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchTournaments } from '../services/rankingsService';

interface TournamentMeta {
  name: string;
  hostClub: string;
  startDate: string;
  endDate: string;
}

export function useTournamentMeta(tswId: string | undefined): TournamentMeta {
  const location = useLocation();
  const routeState = location.state as {
    name?: string;
    hostClub?: string;
    startDate?: string;
    endDate?: string;
  } | null;

  const [meta, setMeta] = useState<TournamentMeta>({
    name: routeState?.name || '',
    hostClub: routeState?.hostClub || '',
    startDate: routeState?.startDate || '',
    endDate: routeState?.endDate || '',
  });

  useEffect(() => {
    if (meta.name || !tswId) return;
    let cancelled = false;
    fetchTournaments()
      .then(data => {
        if (cancelled) return;
        const allTournaments = data.tournaments
          ?? Object.values(data.seasons ?? {}).flatMap(s => s.tournaments);
        const match = allTournaments.find(
          t => t.tswId?.toUpperCase() === tswId.toUpperCase(),
        );
        if (match) {
          setMeta({
            name: match.name,
            hostClub: match.hostClub,
            startDate: match.startDate ?? '',
            endDate: match.endDate ?? '',
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tswId, meta.name]);

  return meta;
}

export function formatDateRange(start: string, end: string): string {
  if (!start) return '';
  const s = new Date(start + 'T00:00:00');
  const e = end ? new Date(end + 'T00:00:00') : s;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  if (start === end || !end) return s.toLocaleDateString('en-US', opts);
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`;
}
