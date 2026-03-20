import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Trophy, Medal } from 'lucide-react';
import { useTabData, TabLoading, TabError, TabEmpty, getEventColor } from '../shared';
import { fetchTournamentWinners } from '../../../services/rankingsService';
import type { TournamentWinnersResponse } from '../../../types/junior';

const PLACE_STYLES: Record<string, { label: string; color: string; ring: string }> = {
  '1': { label: '1st', color: 'text-yellow-500', ring: 'ring-yellow-400/30' },
  '2': { label: '2nd', color: 'text-slate-400', ring: 'ring-slate-300/30' },
  '3': { label: '3rd', color: 'text-amber-700 dark:text-amber-600', ring: 'ring-amber-400/30' },
  '3/4': { label: '3rd/4th', color: 'text-amber-700 dark:text-amber-600', ring: 'ring-amber-400/30' },
  '4': { label: '4th', color: 'text-amber-700 dark:text-amber-600', ring: 'ring-amber-400/20' },
};

export default function WinnersTab({ tswId, active, refreshTrigger }: { tswId: string; active: boolean; refreshTrigger?: number }) {
  const { pathname } = useLocation();
  const { data, loading, error, retry, refresh } = useTabData<TournamentWinnersResponse>(tswId, active, fetchTournamentWinners, 'winners');
  useEffect(() => { if (refreshTrigger) refresh(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <TabLoading label="winners" />;
  if (error) return <TabError error={error} onRetry={retry} />;
  if (!data || data.events.length === 0) return <TabEmpty icon={Trophy} message="No winners data available for this tournament." />;

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {data.events.length} winner event{data.events.length === 1 ? '' : 's'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.events.map((event, idx) => {
          const color = getEventColor(event.eventName);
          const gold = event.results.find(r => r.place.replace(/\s/g, '') === '1');
          return (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
            >
              <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${color.bg} ${color.text}`}>
                  {event.eventName}
                </span>
                {gold && <Trophy className="w-5 h-5 text-yellow-400 opacity-60" />}
              </div>

              <div className="px-5 pb-4 space-y-2.5">
                {event.results.map((result, ri) => {
                  const placeInfo = PLACE_STYLES[result.place.replace(/\s/g, '')] ?? { label: result.place, color: 'text-slate-500', ring: '' };
                  return (
                    <div key={ri} className="flex items-start gap-3">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full ring-2 ${placeInfo.ring} bg-slate-50 dark:bg-slate-800 shrink-0`}>
                        <Medal className={`w-4 h-4 ${placeInfo.color}`} />
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${placeInfo.color}`}>
                          {placeInfo.label}
                        </span>
                        <div className="text-sm text-slate-700 dark:text-slate-200 leading-snug">
                          {result.players.map((p, pi) => (
                            <span key={pi}>
                              {pi > 0 && <span className="text-slate-400 dark:text-slate-500"> &amp; </span>}
                              {p.playerId ? (
                                <Link
                                  to={`/tournaments/${tswId}/player/${p.playerId}`}
                                  state={{ fromPath: pathname }}
                                  className="text-violet-600 dark:text-violet-400 hover:underline font-medium"
                                >
                                  {p.name}
                                </Link>
                              ) : (
                                <span className="font-medium">{p.name}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
