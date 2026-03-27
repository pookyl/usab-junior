import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Calendar, Swords } from 'lucide-react';
import { fetchPlayerSchedule } from '../../services/rankingsService';
import { TabLoading, TabError, TabEmpty } from '../../components/tournament/shared';
import ScheduleMatchCard from '../../components/tournament/ScheduleMatchCard';
import type { PlayerScheduleResponse, ScheduleDay } from '../../types/junior';

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
    if (!data || selectedDay == null) return null;
    return data.days.find(d => d.date === selectedDay) ?? null;
  }, [data, selectedDay]);

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

          {/* Matches */}
          {currentDay && currentDay.matches.length === 0 ? (
            <TabEmpty icon={Swords} message="No matches scheduled for this day." />
          ) : currentDay ? (
            <div className="space-y-4">
              {currentDay.matches.map((m, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="w-20 shrink-0 pt-3 text-left">
                    {m.status === 'in-progress' ? (
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
                      dayDate={currentDay.date}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
