import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useTabData, TabLoading, TabError, TabEmpty } from '../shared';
import { fetchTournamentEvents } from '../../../services/rankingsService';
import type { TournamentEventsResponse } from '../../../types/junior';

export default function EventsTab({ tswId, active, refreshTrigger }: { tswId: string; active: boolean; refreshTrigger?: number }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data, loading, error, retry, refresh } = useTabData<TournamentEventsResponse>(tswId, active, fetchTournamentEvents, 'events');
  useEffect(() => { if (refreshTrigger) refresh(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <TabLoading label="events" />;
  if (error) return <TabError error={error} onRetry={retry} />;
  if (!data || data.events.length === 0) return <TabEmpty icon={CalendarDays} message="No events available for this tournament." />;

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {data.events.length} event{data.events.length === 1 ? '' : 's'}
      </p>
      {data.events.map((event) => {
        const metaParts = [
          `${event.draws} ${event.draws === 1 ? 'Draw' : 'Draws'}`,
          `${event.entries} ${event.entries === 1 ? 'Entry' : 'Entries'}`,
        ];

        return (
          <button
            key={event.eventId}
            type="button"
            onClick={() => navigate(`/tournaments/${tswId}/event/${event.eventId}`, { state: { eventName: event.name, fromPath: pathname } })}
            className="group w-full text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-700 hover:shadow-md active:bg-slate-50 dark:active:bg-slate-800 transition-all p-3.5 md:p-4"
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors truncate">
                  {event.name}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {metaParts.join(' · ')}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
