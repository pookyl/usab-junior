import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Swords, Trophy, ShieldAlert } from 'lucide-react';
import { fetchPlayerSchedule } from '../../services/rankingsService';
import { TabLoading, TabError, TabEmpty } from '../../components/tournament/shared';
import type { PlayerScheduleResponse, ScheduleDay, ScheduleMatch, ScheduleNextMatch } from '../../types/junior';

function PlayerLink({ name, playerId, tswId, fromPath }: {
  name: string; playerId: number | null; tswId: string; fromPath: string;
}) {
  if (playerId && tswId) {
    return (
      <Link
        to={`/tournaments/${tswId}/player/${playerId}`}
        state={{ fromPath }}
        className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
      >
        {name}
      </Link>
    );
  }
  return <>{name}</>;
}

function PathRow({ nm, tswId, fromPath }: {
  nm: ScheduleNextMatch; tswId: string; fromPath: string;
}) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">{nm.round}</span>
      <span className="text-xs text-slate-600 dark:text-slate-300 shrink-0">
        {nm.time || 'Time TBD'}
      </span>
      {nm.opponent ? (
        <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
          vs {nm.opponent.names.map((n, i) => (
            <span key={i}>
              {i > 0 && ' / '}
              <PlayerLink name={n} playerId={nm.opponent!.playerIds[i]} tswId={tswId} fromPath={fromPath} />
            </span>
          ))}
        </span>
      ) : (
        <span className="text-xs text-slate-600 dark:text-slate-300">vs TBD</span>
      )}
    </div>
  );
}

function ScheduleMatchCard({ match, tswId, fromPath }: {
  match: ScheduleMatch;
  tswId: string;
  fromPath: string;
}) {
  const isLive = match.status === 'in-progress';
  const isBye = match.status === 'bye' || match.status === 'walkover';
  const hasWinPath = match.nextMatches.length > 0;
  const hasLosePath = !!match.consolation;
  const potentialMatches = 1 + match.nextMatches.length + (hasLosePath ? 1 + match.consolationMatches.length : 0);

  return (
    <div className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
      isLive
        ? 'border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-900 ring-1 ring-sky-200 dark:ring-sky-800/50'
        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
    }`}>
      {/* Header: Time + Court + Status */}
      <div className={`px-4 py-2.5 flex items-center justify-between gap-2 ${
        isLive
          ? 'bg-sky-50 dark:bg-sky-950/30'
          : 'bg-slate-50 dark:bg-slate-800/40'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500 text-white animate-pulse">
              Now Playing
            </span>
          ) : match.time ? (
            <span className="text-base font-bold text-slate-800 dark:text-slate-100">
              {match.time}
            </span>
          ) : (
            <span className="text-sm font-medium text-amber-500 dark:text-amber-400">Time TBD</span>
          )}
          {match.court && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <MapPin className="w-3 h-3" />
              {match.court}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isBye && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
              {match.status === 'walkover' ? 'W/O' : 'Bye'}
            </span>
          )}
          {match.drawType === 'elimination' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">Elim</span>
          )}
          {match.drawType === 'round-robin' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">RR</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Event + Round */}
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {match.event} &middot; {match.round}
        </p>

        {/* Opponent */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 shrink-0 w-7">vs</span>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0">
            {match.opponent.names.map((name, i) => (
              <div key={i} className="truncate">
                <PlayerLink name={name} playerId={match.opponent.playerIds[i]} tswId={tswId} fromPath={fromPath} />
              </div>
            ))}
          </div>
        </div>

        {/* Partner (doubles/mixed) */}
        {match.partner && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 shrink-0 w-7">with</span>
            <div className="text-sm text-slate-600 dark:text-slate-300 min-w-0">
              {match.partner.names.map((name, i) => (
                <div key={i} className="truncate">
                  <PlayerLink name={name} playerId={match.partner!.playerIds[i]} tswId={tswId} fromPath={fromPath} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bracket paths */}
        {(hasWinPath || hasLosePath) && (
          <div className="pt-1 space-y-2 border-t border-dashed border-slate-200 dark:border-slate-700">
            {/* Win path */}
            {hasWinPath && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">If win</span>
                </div>
                <div className="pl-5 space-y-0.5">
                  {match.nextMatches.map((nm, idx) => (
                    <PathRow key={idx} nm={nm} tswId={tswId} fromPath={fromPath} />
                  ))}
                </div>
              </div>
            )}

            {/* Lose / consolation path */}
            {hasLosePath && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">If lose</span>
                  <span className="text-[11px] text-amber-500 dark:text-amber-400">&rarr; {match.consolation}</span>
                </div>
                {match.consolationMatches.length > 0 && (
                  <div className="pl-5 space-y-0.5">
                    {match.consolationMatches.map((cm, idx) => (
                      <PathRow key={idx} nm={cm} tswId={tswId} fromPath={fromPath} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: potential match count */}
      {potentialMatches > 1 && (
        <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Up to {potentialMatches} matches possible in this event
          </p>
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
