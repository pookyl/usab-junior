import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ensureTournamentMeta, getTournamentMetaSnapshot } from '../services/rankingsService';

interface TournamentMeta {
  name: string;
  hostClub: string;
  startDate: string;
  endDate: string;
}

export function mergeTournamentMeta(
  routeState: {
    name?: string;
    hostClub?: string;
    startDate?: string;
    endDate?: string;
  } | null,
  cachedMeta: Partial<TournamentMeta> | null,
): TournamentMeta {
  return {
    name: routeState?.name || cachedMeta?.name || '',
    hostClub: routeState?.hostClub || cachedMeta?.hostClub || '',
    startDate: routeState?.startDate || cachedMeta?.startDate || '',
    endDate: routeState?.endDate || cachedMeta?.endDate || '',
  };
}

export function useTournamentMeta(tswId: string | undefined): TournamentMeta {
  const location = useLocation();
  const routeState = location.state as {
    name?: string;
    hostClub?: string;
    startDate?: string;
    endDate?: string;
  } | null;

  const seed = useMemo(
    () => mergeTournamentMeta(routeState, getTournamentMetaSnapshot(tswId)),
    [tswId, routeState],
  );
  const [meta, setMeta] = useState<TournamentMeta>(seed);

  useEffect(() => {
    setMeta(seed);
  }, [seed]);

  useEffect(() => {
    if (!tswId) return;
    const needsFetch = !seed.name || !seed.hostClub || !seed.startDate || !seed.endDate;
    if (!needsFetch) return;
    let cancelled = false;
    ensureTournamentMeta(tswId)
      .then((resolvedMeta) => {
        if (cancelled) return;
        if (resolvedMeta) {
          setMeta((current) => ({
            name: current.name || resolvedMeta.name,
            hostClub: current.hostClub || resolvedMeta.hostClub,
            startDate: current.startDate || resolvedMeta.startDate,
            endDate: current.endDate || resolvedMeta.endDate,
          }));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) console.warn('[useTournamentMeta] failed to load metadata:', err.message);
      });
    return () => { cancelled = true; };
  }, [tswId, seed.name, seed.hostClub, seed.startDate, seed.endDate]);

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
