import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, MapPin, Swords, ChevronRight } from 'lucide-react';
import { fetchPlayerSchedule } from '../../services/rankingsService';
import { TabLoading, TabError, TabEmpty } from '../../components/tournament/shared';
import type { PlayerScheduleResponse, ScheduleDay, ScheduleMatch } from '../../types/junior';

function ScheduleMatchCard({ match, tswId, fromPath }: {
  match: ScheduleMatch;
  tswId: string;
  fromPath: string;
}) {
  const isLive = match.status === 'in-progress';
  const isBye = match.status === 'bye' || match.status === 'walkover';

  return (
    <div className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
      isLive
        ? 'border-sky-200 dark:border-sky-800/70 bg-white dark:bg-slate-900'
        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
    }`}>
      {/* Header */}
      <div className={`px-4 py-2 flex items-center justify-between gap-2 ${
        isLive
          ? 'bg-sky-100 dark:bg-sky-900/30'
          : 'bg-slate-200/70 dark:bg-slate-800/60'
      }`}>
        <p className={`text-xs font-medium truncate ${
          isLive ? 'text-sky-800 dark:text-sky-200' : 'text-slate-600 dark:text-slate-300'
        }`}>
          {match.event} &middot; {match.round}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {isLive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500 text-white">
              Now playing
            </span>
          )}
          {isBye && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
              {match.status === 'walkover' ? 'Walkover' : 'Bye'}
            </span>
          )}
          {match.drawType === 'elimination' && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Elim</span>
          )}
          {match.drawType === 'round-robin' && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">RR</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {/* Opponent */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 shrink-0 w-8">vs</span>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 min-w-0">
            {match.opponent.names.map((name, i) => {
              const pid = match.opponent.playerIds[i];
              if (pid && tswId) {
                return (
                  <div key={i} className="truncate">
                    <Link
                      to={`/tournaments/${tswId}/player/${pid}`}
                      state={{ fromPath }}
                      className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
                    >
                      {name}
                    </Link>
                  </div>
                );
              }
              return <div key={i} className="truncate">{name}</div>;
            })}
          </div>
        </div>

        {/* Partner (doubles/mixed) */}
        {match.partner && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 shrink-0 w-8">with</span>
            <div className="text-sm text-slate-600 dark:text-slate-300 min-w-0">
              {match.partner.names.map((name, i) => {
                const pid = match.partner!.playerIds[i];
                if (pid && tswId) {
                  return (
                    <div key={i} className="truncate">
                      <Link
                        to={`/tournaments/${tswId}/player/${pid}`}
                        state={{ fromPath }}
                        className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
                      >
                        {name}
                      </Link>
                    </div>
                  );
                }
                return <div key={i} className="truncate">{name}</div>;
              })}
            </div>
          </div>
        )}

        {/* Time & Court */}
        <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          {match.time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {match.time}
            </span>
          )}
          {match.court && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {match.court}
            </span>
          )}
          {!isLive && !match.time && (
            <span className="text-amber-500 dark:text-amber-400">Time TBD</span>
          )}
        </div>
      </div>

      {/* Potential next matches chain + consolation path */}
      {(match.nextMatches.length > 0 || match.consolation) && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {match.nextMatches.length > 0 && (
            <div className="px-4 py-2 bg-violet-50 dark:bg-violet-950/20 space-y-1">
              {match.nextMatches.map((nm, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-300">
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="font-medium">
                    {idx === 0 ? 'If win' : 'Then'} → {nm.round}
                  </span>
                  {nm.time && <span>&middot; {nm.time}</span>}
                  {nm.date && nm.dateLabel && (
                    <span>&middot; {nm.dateLabel}</span>
                  )}
                  {nm.opponent ? (
                    <span className="truncate">vs {nm.opponent.names.join(' / ')}</span>
                  ) : (
                    <span className="text-violet-400 dark:text-violet-500">Opponent TBD</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {match.consolation && (
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <ChevronRight className="w-3 h-3 shrink-0" />
                <span className="font-medium">If lose → {match.consolation}</span>
              </div>
              {match.consolationMatches.map((cm, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 pl-4">
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span>{cm.round}</span>
                  {cm.time && <span>&middot; {cm.time}</span>}
                  {cm.opponent ? (
                    <span className="truncate">vs {cm.opponent.names.join(' / ')}</span>
                  ) : (
                    <span className="text-amber-400 dark:text-amber-500">Opponent TBD</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlayerSchedulePage() {
  const { tswId, playerId } = useParams<{ tswId: string; playerId: string }>();
  const location = useLocation();
  const routeState = location.state as { playerName?: string } | null;

  const [data, setData] = useState<PlayerScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const requestId = useRef(0);
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);

  useEffect(() => {
    if (!tswId || !playerId) return;
    const reqId = ++requestId.current;
    setLoading(true);
    setError(null);
    fetchPlayerSchedule(tswId, [playerId])
      .then(d => {
        if (unmountedRef.current || reqId !== requestId.current) return;
        setData(d);
        // Auto-select first day (which is today or first future day)
        if (d.days.length > 0 && !selectedDay) {
          setSelectedDay(d.days[0].date);
        }
      })
      .catch(e => {
        if (unmountedRef.current || reqId !== requestId.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (!unmountedRef.current && reqId === requestId.current) setLoading(false);
      });
  }, [tswId, playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentDay: ScheduleDay | null = useMemo(() => {
    if (!data || !selectedDay) return null;
    return data.days.find(d => d.date === selectedDay) ?? null;
  }, [data, selectedDay]);

  const timeGroups = useMemo(() => {
    if (!currentDay) return [];
    const groups: { time: string; matches: ScheduleMatch[] }[] = [];
    for (const m of currentDay.matches) {
      const t = m.time || '';
      const last = groups[groups.length - 1];
      if (last && last.time === t) {
        last.matches.push(m);
      } else {
        groups.push({ time: t, matches: [m] });
      }
    }
    return groups;
  }, [currentDay]);

  const playerName = data?.players[0]?.playerName || routeState?.playerName || '';

  if (!tswId || !playerId) return null;

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
      </div>

      <div>
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
          {playerName ? `${playerName}'s Schedule` : 'Player Schedule'}
        </h1>
        {data?.tournamentName && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{data.tournamentName}</p>
        )}
      </div>

      {loading ? (
        <TabLoading label="schedule" />
      ) : error ? (
        <TabError error={error} />
      ) : data && data.days.length === 0 ? (
        <TabEmpty icon={Calendar} message="No upcoming matches scheduled." />
      ) : data ? (
        <>
          {/* Date tabs */}
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

          {/* Match count */}
          {currentDay && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {currentDay.matches.length} match{currentDay.matches.length !== 1 ? 'es' : ''}
            </p>
          )}

          {/* Matches */}
          {currentDay && currentDay.matches.length === 0 ? (
            <TabEmpty icon={Swords} message="No matches scheduled for this day." />
          ) : currentDay ? (
            <div>
              {timeGroups.flatMap((group, gi) => {
                const items: React.ReactNode[] = [];
                if (group.time) {
                  items.push(
                    <div key={`t-${gi}`} className="sticky top-[3.5rem] md:top-16 z-10 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm py-2">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{group.time}</span>
                    </div>,
                  );
                }
                items.push(
                  <div key={`g-${gi}`} className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                    {group.matches.map((m, i) => (
                      <ScheduleMatchCard
                        key={i}
                        match={m}
                        tswId={tswId}
                        fromPath={location.pathname}
                      />
                    ))}
                  </div>,
                );
                return items;
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
