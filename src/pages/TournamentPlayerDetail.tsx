import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Swords, Users } from 'lucide-react';
import { fetchTournamentPlayerDetail } from '../services/rankingsService';

import { TabLoading, TabError, TabEmpty, RefreshButton } from '../components/tournament/shared';
import MatchCard from '../components/tournament/MatchCard';
import type { TournamentPlayerDetailResponse } from '../types/junior';

export default function TournamentPlayerDetail() {
  const { tswId, playerId } = useParams<{ tswId: string; playerId: string }>();
  const location = useLocation();


  const [data, setData] = useState<TournamentPlayerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState('');
  const refreshFlag = useRef(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    if (!tswId || !playerId) return;
    let cancelled = false;
    const isRefresh = refreshFlag.current;
    refreshFlag.current = false;
    if (!isRefresh) setData(null);
    setError(null);
    if (!isRefresh) setEventFilter('');
    setLoading(true);
    fetchTournamentPlayerDetail(tswId, playerId, isRefresh)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tswId, playerId, fetchTrigger]);

  const handleRefresh = useCallback(() => {
    refreshFlag.current = true;
    setFetchTrigger(n => n + 1);
  }, []);

  const resolvedUsabId = data?.memberId ?? null;

  const events = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.matches.map(m => m.event).filter(Boolean));
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!eventFilter) return data.matches;
    return data.matches.filter(m => m.event === eventFilter);
  }, [data, eventFilter]);

  if (!tswId || !playerId) return null;

  const parsedPlayerId = Number(playerId);
  const highlightPlayerId = Number.isFinite(parsedPlayerId) ? parsedPlayerId : undefined;
  const originFromPath = (location.state as { fromPath?: string } | null)?.fromPath ?? location.pathname;
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <RefreshButton onClick={handleRefresh} loading={loading} tswId={tswId} />
      </div>

      {loading ? (
        <TabLoading label="player" />
      ) : error ? (
        <TabError error={error} />
      ) : data ? (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                    {data.playerName || 'Player'}
                  </h1>
                  {data.memberId && (
                    <span className="text-sm text-slate-400 dark:text-slate-500 font-mono">({data.memberId})</span>
                  )}
                </div>
              </div>

              {data.winLoss && (
                <div className="shrink-0 sm:text-right">
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Win-Loss</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {data.winLoss.wins}-{data.winLoss.losses}
                    <span className="text-sm font-semibold ml-1">({data.winLoss.total})</span>
                  </p>
                  <div className="w-32 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                      style={{ width: `${data.winLoss.winPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{data.winLoss.winPct}% won</p>
                </div>
              )}
            </div>

            {data.events.length > 0 && (
              <div className="flex flex-wrap gap-x-1 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                {data.events.map((ev, i) => (
                  <span key={i} className="inline-flex items-center">
                    {i > 0 && <span className="text-slate-300 dark:text-slate-600 mr-1">,&nbsp;</span>}
                    {ev}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {resolvedUsabId && (
                <Link
                  to={`/directory/${resolvedUsabId}`}
                  state={{ fromPath: location.pathname }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                >
                  <Users className="w-3 h-3" />
                  Player Profile
                </Link>
              )}
              {/* Schedule link — temporarily disabled for production
              {data.hasUpcomingMatches && (
                <Link
                  to={`/tournaments/${tswId}/player/${playerId}/schedule`}
                  state={{ playerName: data.playerName }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                >
                  <Calendar className="w-3 h-3" />
                  Schedule
                </Link>
              )}
              */}
            </div>
          </div>

          {events.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0">Event:</span>
              {['All', ...events].map(ev => (
                <button
                  key={ev}
                  onClick={() => setEventFilter(ev === 'All' ? '' : ev)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    (ev === 'All' && !eventFilter) || ev === eventFilter
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {ev}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500">
            {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
            {eventFilter && ` in ${eventFilter}`}
          </p>

          {filtered.length === 0 ? (
            <TabEmpty icon={Swords} message={data.matches.length > 0 ? `No matches for "${eventFilter}"` : 'No matches found for this player.'} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((m, i) => (
                <MatchCard
                  key={i}
                  match={m}
                  tswId={tswId}
                  fromPath={originFromPath}
                  highlightPlayerId={highlightPlayerId}
                  highlightPlayerName={data.playerName}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
