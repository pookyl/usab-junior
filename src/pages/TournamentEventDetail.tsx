import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { fetchTournamentEventDetail } from '../services/rankingsService';
import { TabLoading, TabError, TabEmpty, RefreshButton, getEventColor } from '../components/tournament/shared';
import type { TournamentEventDetailEntry, TournamentEventDetailResponse } from '../types/junior';
import { getTournamentEventOrigin } from '../utils/tournamentReturnState';

function entryMetaLabel(entry: TournamentEventDetailEntry): string | null {
  if (entry.seed) return `Seed ${entry.seed}`;
  if (/reserve list/i.test(entry.entryType)) return 'Reserve list';
  if (/exclude list/i.test(entry.entryType)) return 'Exclude list';
  return null;
}

export default function TournamentEventDetail() {
  const { tswId, eventId } = useParams<{ tswId: string; eventId: string }>();
  const location = useLocation();
  const routeState = location.state as { eventName?: string; fromPath?: string } | null;

  const [data, setData] = useState<TournamentEventDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string>(routeState?.eventName || '');
  const refreshFlag = useRef(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    if (!tswId || !eventId) return;
    let cancelled = false;
    const isRefresh = refreshFlag.current;
    refreshFlag.current = false;
    if (!isRefresh) setData(null);
    setError(null);
    setLoading(true);

    fetchTournamentEventDetail(tswId, eventId, isRefresh)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        if (next.eventName) setEventName(next.eventName);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tswId, eventId, fetchTrigger]);

  const handleRefresh = useCallback(() => {
    refreshFlag.current = true;
    setFetchTrigger((n) => n + 1);
  }, []);

  const sourceOrderedEntries = useMemo(() => data?.entries ?? [], [data]);

  if (!tswId || !eventId) return null;

  const fromPath = routeState?.fromPath ?? getTournamentEventOrigin(location.pathname);
  const isTournamentSubpage = Boolean(
    fromPath &&
      fromPath.startsWith(`/tournaments/${tswId}/`) &&
      !fromPath.includes('/event/') &&
      !fromPath.includes('/player/'),
  );
  const backTarget = isTournamentSubpage ? fromPath! : `/tournaments/${tswId}/events`;
  const color = eventName ? getEventColor(eventName) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={backTarget}
          className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <RefreshButton onClick={handleRefresh} loading={loading} tswId={tswId} />
      </div>

      {loading ? (
        <TabLoading label="event" />
      ) : error ? (
        <TabError error={error} />
      ) : data ? (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                {color && (
                  <span className={`inline-block px-2.5 py-1 rounded text-sm font-bold ${color.bg} ${color.text}`}>
                    {eventName || `Event ${eventId}`}
                  </span>
                )}
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                  Entries
                </h1>
              </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Draws: <span className="font-semibold text-slate-700 dark:text-slate-200">{data.draws.length}</span>
              {' · '}
              Entries: <span className="font-semibold text-slate-700 dark:text-slate-200">{data.entriesCount ?? data.entries.length}</span>
            </p>
          </div>

          {data.draws.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {data.draws.map((draw) => {
                const meta = [
                  draw.type,
                  draw.size != null ? `Size ${draw.size}` : null,
                  draw.qualification ? `Qualification: ${draw.qualification}` : null,
                  draw.consolation ? `Consolation: ${draw.consolation}` : null,
                ].filter((part): part is string => Boolean(part));
                return (
                  <div
                    key={draw.drawId}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3.5"
                  >
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{draw.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{meta.join(' · ') || '—'}</p>
                  </div>
                );
              })}
            </div>
          )}

          {sourceOrderedEntries.length === 0 ? (
            <TabEmpty icon={Users} message="No entries found for this event." />
          ) : (
            <div className="space-y-2.5">
              {sourceOrderedEntries.map((entry, idx) => {
                const meta = entryMetaLabel(entry);
                return (
                  <div
                    key={`${idx}-${entry.players.map((p) => p.playerId).join('-')}`}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3.5 md:p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        {entry.players.map((player, playerIdx) => (
                          <div key={`${player.playerId}-${playerIdx}`} className="text-sm text-slate-700 dark:text-slate-200 truncate">
                            {player.playerId ? (
                              <Link
                                to={`/tournaments/${tswId}/player/${player.playerId}`}
                                state={{ fromPath: location.pathname }}
                                className="font-medium text-violet-600 dark:text-violet-400 hover:underline"
                              >
                                {player.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{player.name}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {meta && (
                        <span className="shrink-0 inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {meta}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
