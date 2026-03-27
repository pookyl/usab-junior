import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Calendar, Swords } from 'lucide-react';
import { RefreshButton } from '../../components/tournament/shared';
import ScheduleMatchCard from '../../components/tournament/ScheduleMatchCard';
import type { PlayerBadge, PlayerCardColor } from '../../components/tournament/ScheduleMatchCard';
import { TabLoading, TabError, TabEmpty } from '../../components/tournament/shared';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { fetchPlayerSchedule } from '../../services/rankingsService';
import type { PlayerScheduleResponse, ScheduleDay, ScheduleMatch } from '../../types/junior';

const PLAYER_COLORS: { bg: string; text: string; dot: string; card: PlayerCardColor }[] = [
  { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500',
    card: { borderL: 'border-l-violet-400', border: 'border-violet-200 dark:border-violet-800', bg: 'bg-violet-50/50 dark:bg-violet-950/20', headerBg: 'bg-violet-100/60 dark:bg-violet-900/30', footerBg: 'bg-violet-50/40 dark:bg-violet-900/10', footerBorder: 'border-violet-100 dark:border-violet-900/30' } },
  { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500',
    card: { borderL: 'border-l-sky-400', border: 'border-sky-200 dark:border-sky-800', bg: 'bg-sky-50/50 dark:bg-sky-950/20', headerBg: 'bg-sky-100/60 dark:bg-sky-900/30', footerBg: 'bg-sky-50/40 dark:bg-sky-900/10', footerBorder: 'border-sky-100 dark:border-sky-900/30' } },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500',
    card: { borderL: 'border-l-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', bg: 'bg-emerald-50/50 dark:bg-emerald-950/20', headerBg: 'bg-emerald-100/60 dark:bg-emerald-900/30', footerBg: 'bg-emerald-50/40 dark:bg-emerald-900/10', footerBorder: 'border-emerald-100 dark:border-emerald-900/30' } },
  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500',
    card: { borderL: 'border-l-amber-400', border: 'border-amber-200 dark:border-amber-800', bg: 'bg-amber-50/50 dark:bg-amber-950/20', headerBg: 'bg-amber-100/60 dark:bg-amber-900/30', footerBg: 'bg-amber-50/40 dark:bg-amber-900/10', footerBorder: 'border-amber-100 dark:border-amber-900/30' } },
  { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500',
    card: { borderL: 'border-l-rose-400', border: 'border-rose-200 dark:border-rose-800', bg: 'bg-rose-50/50 dark:bg-rose-950/20', headerBg: 'bg-rose-100/60 dark:bg-rose-900/30', footerBg: 'bg-rose-50/40 dark:bg-rose-900/10', footerBorder: 'border-rose-100 dark:border-rose-900/30' } },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500',
    card: { borderL: 'border-l-cyan-400', border: 'border-cyan-200 dark:border-cyan-800', bg: 'bg-cyan-50/50 dark:bg-cyan-950/20', headerBg: 'bg-cyan-100/60 dark:bg-cyan-900/30', footerBg: 'bg-cyan-50/40 dark:bg-cyan-900/10', footerBorder: 'border-cyan-100 dark:border-cyan-900/30' } },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30', text: 'text-fuchsia-700 dark:text-fuchsia-300', dot: 'bg-fuchsia-500',
    card: { borderL: 'border-l-fuchsia-400', border: 'border-fuchsia-200 dark:border-fuchsia-800', bg: 'bg-fuchsia-50/50 dark:bg-fuchsia-950/20', headerBg: 'bg-fuchsia-100/60 dark:bg-fuchsia-900/30', footerBg: 'bg-fuchsia-50/40 dark:bg-fuchsia-900/10', footerBorder: 'border-fuchsia-100 dark:border-fuchsia-900/30' } },
];

function buildPlayerBadge(playerId: number, playerMap: Map<number, { name: string; index: number }>): PlayerBadge | undefined {
  const info = playerMap.get(playerId);
  if (!info) return undefined;
  const color = PLAYER_COLORS[info.index % PLAYER_COLORS.length];
  const firstName = info.name.split(' ')[0] || info.name;
  return { name: firstName, dotClass: color.dot, bgClass: color.bg, textClass: color.text, cardColor: color.card };
}

export default function WatchlistSchedulePage() {
  const { tswId } = useParams<{ tswId: string }>();
  const location = useLocation();
  const { players: watchedPlayers, lists, activeIndex } = useWatchlist();

  const [data, setData] = useState<PlayerScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [playerFilter, setPlayerFilter] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const playerMap = useMemo(() => {
    const map = new Map<number, { name: string; index: number }>();
    watchedPlayers.forEach((p, i) => map.set(p.playerId, { name: p.name, index: i }));
    return map;
  }, [watchedPlayers]);

  const playerIds = useMemo(() => watchedPlayers.map(p => p.playerId), [watchedPlayers]);

  const requestId = useRef(0);
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);

  useEffect(() => {
    if (!tswId || playerIds.length === 0) {
      setLoading(false);
      setData(null);
      return;
    }
    const reqId = ++requestId.current;
    setLoading(true);
    setError(null);
    fetchPlayerSchedule(tswId, playerIds, refreshTrigger > 0)
      .then(d => {
        if (unmountedRef.current || reqId !== requestId.current) return;
        setData(d);
        if (d.days.length > 0) {
          setSelectedDay(prev => {
            if (prev && d.days.some(day => day.date === prev)) return prev;
            return d.days[0].date;
          });
        }
      })
      .catch(e => {
        if (unmountedRef.current || reqId !== requestId.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (!unmountedRef.current && reqId === requestId.current) setLoading(false);
      });
  }, [tswId, playerIds.join(','), refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentDay: ScheduleDay | null = useMemo(() => {
    if (!data || selectedDay == null) return null;
    return data.days.find(d => d.date === selectedDay) ?? null;
  }, [data, selectedDay]);

  const filteredMatches: ScheduleMatch[] = useMemo(() => {
    if (!currentDay) return [];
    const matches = currentDay.matches;
    if (playerFilter === null) return matches;
    return matches.filter(m => m.playerId === playerFilter);
  }, [currentDay, playerFilter]);

  // Per-player match counts for the selected day
  const playerMatchCounts = useMemo(() => {
    if (!currentDay) return new Map<number, number>();
    const counts = new Map<number, number>();
    for (const m of currentDay.matches) {
      counts.set(m.playerId, (counts.get(m.playerId) || 0) + 1);
    }
    return counts;
  }, [currentDay]);

  const listName = lists[activeIndex]?.name ?? 'Watchlist';

  if (!tswId) return null;

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
        <RefreshButton onClick={() => setRefreshTrigger(n => n + 1)} loading={loading} tswId={tswId} />
      </div>

      <div>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 md:w-6 md:h-6 text-violet-500" />
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Watchlist Schedule
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {listName} &middot; {watchedPlayers.length} player{watchedPlayers.length !== 1 ? 's' : ''}
        </p>
      </div>

      {watchedPlayers.length === 0 ? (
        <TabEmpty icon={Calendar} message="No players in watchlist. Add players first." />
      ) : loading ? (
        <TabLoading label="schedule" />
      ) : error ? (
        <TabError error={error} />
      ) : data && data.days.length === 0 ? (
        <TabEmpty icon={Calendar} message="No upcoming matches scheduled for watched players." />
      ) : data ? (
        <div className="space-y-5">
          {/* Day tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
            {data.days.map(d => (
              <button
                key={d.date}
                onClick={() => setSelectedDay(d.date)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  d.date === selectedDay
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {d.dateLabel}
              </button>
            ))}
          </div>

          {/* Player filter pills */}
          {watchedPlayers.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setPlayerFilter(null)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  playerFilter === null
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All ({currentDay?.matches.length ?? 0})
              </button>
              {watchedPlayers.map((p, i) => {
                const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
                const count = playerMatchCounts.get(p.playerId) || 0;
                const isActive = playerFilter === p.playerId;
                const hasMatches = count > 0;
                return (
                  <button
                    key={p.playerId}
                    disabled={!hasMatches}
                    onClick={() => hasMatches && setPlayerFilter(isActive ? null : p.playerId)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      !hasMatches
                        ? 'opacity-40 cursor-default line-through'
                        : isActive
                          ? 'bg-violet-600 text-white cursor-pointer'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-white' : hasMatches ? color.dot : 'bg-slate-300 dark:bg-slate-600'}`} />
                    {p.name.split(' ')[0]}
                    {hasMatches && <span className={isActive ? 'text-violet-200' : 'text-slate-400 dark:text-slate-500'}>({count})</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Match count */}
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
            {playerFilter !== null && ` for ${playerMap.get(playerFilter)?.name ?? 'player'}`}
          </p>

          {/* Timeline */}
          {filteredMatches.length === 0 ? (
            <TabEmpty icon={Swords} message="No matches scheduled for this day." />
          ) : (
            <div className="space-y-4">
              {filteredMatches.map((m, i) => {
                const prevMatch = i > 0 ? filteredMatches[i - 1] : null;
                const sameTime = prevMatch && prevMatch.time === m.time && prevMatch.status === m.status;

                return (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="w-20 shrink-0 pt-3 text-left">
                      {sameTime ? null : m.status === 'in-progress' ? (
                        <span className="text-lg font-bold text-sky-500 animate-pulse">NOW</span>
                      ) : m.time ? (
                        <span className="text-lg font-bold text-slate-700 dark:text-slate-200">{m.time}</span>
                      ) : (
                        <span className="text-xs font-medium text-amber-500 dark:text-amber-400">TBD</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <ScheduleMatchCard
                        match={m}
                        tswId={tswId}
                        fromPath={location.pathname}
                        dayDate={currentDay?.date ?? ''}
                        playerBadge={watchedPlayers.length > 1 ? buildPlayerBadge(m.playerId, playerMap) : undefined}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
