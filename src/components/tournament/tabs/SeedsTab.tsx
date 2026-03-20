import { useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { useTabData, TabLoading, TabError, TabEmpty, getEventColor } from '../shared';
import { fetchTournamentSeeding } from '../../../services/rankingsService';
import type { TournamentSeedingEvent, TournamentSeedingResponse } from '../../../types/junior';

const EVENT_TYPE_ORDER = ['BS', 'GS', 'BD', 'GD', 'XD', 'OTHER'] as const;
const EVENT_TYPE_LABELS: Record<(typeof EVENT_TYPE_ORDER)[number], string> = {
  BS: 'Boys Singles',
  GS: 'Girls Singles',
  BD: 'Boys Doubles',
  GD: 'Girls Doubles',
  XD: 'Mixed Doubles',
  OTHER: 'Other',
};

function getEventType(eventName: string): (typeof EVENT_TYPE_ORDER)[number] {
  const upper = eventName.toUpperCase();
  if (upper.startsWith('BS')) return 'BS';
  if (upper.startsWith('GS')) return 'GS';
  if (upper.startsWith('BD')) return 'BD';
  if (upper.startsWith('GD')) return 'GD';
  if (upper.startsWith('XD')) return 'XD';
  return 'OTHER';
}

function getAgeOrder(eventName: string): number {
  const m = eventName.match(/U(\d+)/i);
  return m ? parseInt(m[1], 10) : 999;
}

function sortEvents(a: TournamentSeedingEvent, b: TournamentSeedingEvent): number {
  const typeA = getEventType(a.eventName);
  const typeB = getEventType(b.eventName);
  const typeDiff = EVENT_TYPE_ORDER.indexOf(typeA) - EVENT_TYPE_ORDER.indexOf(typeB);
  if (typeDiff !== 0) return typeDiff;

  const ageDiff = getAgeOrder(a.eventName) - getAgeOrder(b.eventName);
  if (ageDiff !== 0) return ageDiff;

  return a.eventName.localeCompare(b.eventName);
}

export default function SeedsTab({ tswId, active, refreshTrigger }: { tswId: string; active: boolean; refreshTrigger?: number }) {
  const { pathname } = useLocation();
  const { data, loading, error, retry, refresh } = useTabData<TournamentSeedingResponse>(tswId, active, fetchTournamentSeeding, 'seeds');
  useEffect(() => { if (refreshTrigger) refresh(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    if (!data) return [] as Array<{ type: (typeof EVENT_TYPE_ORDER)[number]; events: TournamentSeedingEvent[] }>;

    const sorted = [...data.events].sort(sortEvents);
    const byType = new Map<(typeof EVENT_TYPE_ORDER)[number], TournamentSeedingEvent[]>();
    for (const type of EVENT_TYPE_ORDER) byType.set(type, []);
    for (const event of sorted) {
      byType.get(getEventType(event.eventName))!.push(event);
    }
    return EVENT_TYPE_ORDER
      .map((type) => ({ type, events: byType.get(type)! }))
      .filter((group) => group.events.length > 0);
  }, [data]);

  if (loading) return <TabLoading label="seeds" />;
  if (error) return <TabError error={error} onRetry={retry} />;
  if (!data || data.events.length === 0) return <TabEmpty icon={Bookmark} message="No seeded entries available for this tournament." />;

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {data.events.length} seeded event{data.events.length === 1 ? '' : 's'}
      </p>

      {grouped.map((group) => (
        <section key={group.type} className="space-y-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {EVENT_TYPE_LABELS[group.type]}
            </h3>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {group.events.length}
            </span>
            <div className="h-px bg-slate-100 dark:bg-slate-800 flex-1" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.events.map((event) => {
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
        </section>
      ))}
    </div>
  );
}
