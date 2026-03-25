import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ensureTournamentMeta, getTournamentMetaSnapshot } from '../services/rankingsService';

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
    name: routeState?.name || getTournamentMetaSnapshot(tswId)?.name || '',
    hostClub: routeState?.hostClub || getTournamentMetaSnapshot(tswId)?.hostClub || '',
    startDate: routeState?.startDate || getTournamentMetaSnapshot(tswId)?.startDate || '',
    endDate: routeState?.endDate || getTournamentMetaSnapshot(tswId)?.endDate || '',
  });

  useEffect(() => {
    if (meta.name || !tswId) return;
    let cancelled = false;
    ensureTournamentMeta(tswId)
      .then((resolvedMeta) => {
        if (cancelled) return;
        if (resolvedMeta) {
          setMeta({
            name: resolvedMeta.name,
            hostClub: resolvedMeta.hostClub,
            startDate: resolvedMeta.startDate,
            endDate: resolvedMeta.endDate,
          });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) console.warn('[useTournamentMeta] failed to load metadata:', err.message);
      });
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
