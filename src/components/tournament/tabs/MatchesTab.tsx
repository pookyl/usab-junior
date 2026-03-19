import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Calendar, Swords, RefreshCw } from 'lucide-react';
import { TabLoading, TabError, TabEmpty, cappedMapSet, todayYYYYMMDD } from '../shared';
import MatchCard from '../MatchCard';
import { fetchTournamentMatchDates, fetchTournamentMatchDay } from '../../../services/rankingsService';
import { useTournamentMeta } from '../../../hooks/useTournamentMeta';
import type { MatchDateTab, TournamentMatch } from '../../../types/junior';

function generateDateTabs(startDate: string, endDate: string): MatchDateTab[] {
  if (!startDate) return [];
  const tabs: MatchDateTab[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : start;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const current = new Date(start);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const param = `${y}${m}${d}`;
    const label = current.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    tabs.push({ param, label });
    current.setDate(current.getDate() + 1);
  }
  return tabs;
}

interface MatchesTabSnapshot {
  dates: MatchDateTab[];
  selectedDate: string;
  matchDate: string;
  matches: TournamentMatch[];
}

const matchesTabCache = new Map<string, MatchesTabSnapshot>();

export default function MatchesTab({ tswId, active }: { tswId: string; active: boolean }) {
  const snap = matchesTabCache.get(tswId);
  const meta = useTournamentMeta(tswId);
  const metaDates = useMemo(
    () => generateDateTabs(meta.startDate, meta.endDate),
    [meta.startDate, meta.endDate],
  );

  const [dates, setDates] = useState<MatchDateTab[]>(snap?.dates ?? []);
  const [datesLoading, setDatesLoading] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);
  const [datesFetched, setDatesFetched] = useState(!!snap?.dates.length);

  const [matches, setMatches] = useState<TournamentMatch[]>(snap?.matches ?? []);
  const [matchDate, setMatchDate] = useState(snap?.matchDate ?? '');
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(snap?.selectedDate ?? '');

  const [eventFilter, setEventFilter] = useState('');

  const matchRequestId = useRef(0);
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);

  const isToday = selectedDate === todayYYYYMMDD();

  useEffect(() => {
    cappedMapSet(matchesTabCache, tswId, { dates, selectedDate, matchDate, matches });
  }, [tswId, dates, selectedDate, matchDate, matches]);

  function loadMatches(dateParam: string, refresh = false) {
    const reqId = ++matchRequestId.current;
    setSelectedDate(dateParam);
    setMatches([]);
    setMatchesLoading(true);
    setMatchesError(null);
    setEventFilter('');
    fetchTournamentMatchDay(tswId, dateParam, refresh)
      .then(d => {
        if (unmountedRef.current || reqId !== matchRequestId.current) return;
        setMatches(d.matches);
        setMatchDate(d.date);
      })
      .catch(e => {
        if (unmountedRef.current || reqId !== matchRequestId.current) return;
        setMatchesError(e.message);
      })
      .finally(() => {
        if (!unmountedRef.current && reqId === matchRequestId.current) setMatchesLoading(false);
      });
  }

  useEffect(() => {
    if (!active || !tswId || datesFetched) return;
    let cancelled = false;
    setDatesLoading(true);
    setDatesError(null);
    fetchTournamentMatchDates(tswId)
      .then(d => {
        if (cancelled) return;
        setDates(d.dates);
        setDatesFetched(true);
      })
      .catch(e => { if (!cancelled) setDatesError(e.message); })
      .finally(() => { if (!cancelled) setDatesLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tswId, active, datesFetched]);

  function handleDateChange(dateParam: string) {
    if (dateParam === selectedDate && matches.length > 0) return;
    loadMatches(dateParam);
  }

  function handleRefresh() {
    if (!selectedDate) return;
    loadMatches(selectedDate, true);
  }

  const events = useMemo(() => {
    const set = new Set(matches.map(m => m.event).filter(Boolean));
    return [...set].sort();
  }, [matches]);

  const filtered = useMemo(() => {
    if (!eventFilter) return matches;
    return matches.filter(m => m.event === eventFilter);
  }, [matches, eventFilter]);

  const timeGroups = useMemo(() => {
    const groups: { time: string; matches: typeof filtered }[] = [];
    for (const m of filtered) {
      const t = m.time || '';
      const last = groups[groups.length - 1];
      if (last && last.time === t) {
        last.matches.push(m);
      } else {
        groups.push({ time: t, matches: [m] });
      }
    }
    return groups;
  }, [filtered]);

  const retryDates = useCallback(() => { setDatesError(null); setDatesFetched(false); }, []);

  const displayDates = datesFetched ? dates : metaDates;

  if (datesLoading && displayDates.length === 0) return <TabLoading label="matches" />;
  if (datesError) return <TabError error={datesError} onRetry={retryDates} />;
  if (datesFetched && dates.length === 0) {
    return <TabEmpty icon={Swords} message="No match data available for this tournament." />;
  }

  return (
    <div className="space-y-4">
      {displayDates.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
          {displayDates.map(d => (
            <button
              key={d.param}
              onClick={() => handleDateChange(d.param)}
              disabled={matchesLoading}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                d.param === selectedDate
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              } ${matchesLoading ? 'opacity-60' : ''}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {isToday && selectedDate && !matchesLoading && (
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh live results
        </button>
      )}

      {!selectedDate && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a date above to view matches</p>
        </div>
      )}

      {selectedDate && matchesLoading && <TabLoading label="matches" />}
      {selectedDate && matchesError && <TabError error={matchesError} onRetry={() => loadMatches(selectedDate)} />}

      {selectedDate && !matchesLoading && !matchesError && (
        <>
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
            <TabEmpty icon={Swords} message={matches.length > 0 ? `No matches for "${eventFilter}"` : 'No matches for this day.'} />
          ) : (
            <div>
              {timeGroups.flatMap((group, gi) => {
                const items: React.ReactNode[] = [];
                if (group.time) {
                  items.push(
                    <div key={`t-${gi}`} className="sticky top-[3.5rem] md:top-16 z-10 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm py-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{group.time}</span>
                    </div>
                  );
                }
                items.push(
                  <div key={`g-${gi}`} className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                    {group.matches.map((m, i) => (
                      <MatchCard key={i} match={m} date={matchDate} tswId={tswId} />
                    ))}
                  </div>
                );
                return items;
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
