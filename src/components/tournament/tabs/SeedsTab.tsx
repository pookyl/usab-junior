import { useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { useTabData, TabLoading, TabError, TabEmpty, getEventColor } from '../shared';
import { fetchTournamentEvents, fetchTournamentSeeding } from '../../../services/rankingsService';
import type { TournamentEventsResponse, TournamentSeedingEvent, TournamentSeedingResponse } from '../../../types/junior';

export default function SeedsTab({ tswId, active, refreshTrigger }: { tswId: string; active: boolean; refreshTrigger?: number }) {
  const { pathname } = useLocation();
  const { data, loading, error, retry, refresh } = useTabData<TournamentSeedingResponse>(tswId, active, fetchTournamentSeeding, 'seeds');
  const { data: eventsData, refresh: refreshEvents } = useTabData<TournamentEventsResponse>(tswId, active, fetchTournamentEvents, 'events');
  useEffect(() => {
    if (refreshTrigger) {
      refresh();
      refreshEvents();
    }
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedEvents = useMemo(() => {
    if (!data) return [] as TournamentSeedingEvent[];
    if (!eventsData || eventsData.events.length === 0) return data.events;

    const orderByEventId = new Map<number, number>();
    eventsData.events.forEach((event, index) => {
      orderByEventId.set(event.eventId, index);
    });

    return [...data.events].sort((a, b) => {
      const aOrder = orderByEventId.get(a.eventId);
      const bOrder = orderByEventId.get(b.eventId);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a.eventName.localeCompare(b.eventName);
    });
  }, [data, eventsData]);

  if (loading) return <TabLoading label="seeds" />;
  if (error) return <TabError error={error} onRetry={retry} />;
  if (!data || data.events.length === 0) return <TabEmpty icon={Bookmark} message="No seeded entries available for this tournament." />;

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {orderedEvents.length} seeded event{orderedEvents.length === 1 ? '' : 's'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {orderedEvents.map((event) => {
          const color = getEventColor(event.eventName);
          return (
            <div
              key={`${event.eventId}-${event.eventName}`}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${color.bg} ${color.text}`}>
                  {event.eventName}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {event.seeds.length} seed{event.seeds.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-2">
                {event.seeds.map((seedEntry, idx) => (
                  <div key={`${seedEntry.seed}-${idx}`} className="flex items-start gap-3">
                    <span className="shrink-0 w-12 text-center inline-flex items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {seedEntry.seed}
                    </span>
                    <div className="min-w-0 text-sm leading-snug text-slate-700 dark:text-slate-200 space-y-0.5">
                      {seedEntry.players.map((player, playerIdx) => (
                        <div key={`${player.playerId}-${playerIdx}`} className="truncate">
                          <Link
                            to={`/tournaments/${tswId}/player/${player.playerId}`}
                            state={{ fromPath: pathname }}
                            className="font-medium text-violet-600 dark:text-violet-400 hover:underline"
                          >
                            {player.name}
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
