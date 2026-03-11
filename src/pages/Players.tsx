import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ExternalLink, RefreshCw, Trophy, WifiOff, Calendar } from 'lucide-react';
import type { AgeGroup, EventType } from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES } from '../types/junior';
import { usePlayers } from '../contexts/PlayersContext';

const AGE_COLORS: Record<AgeGroup, string> = {
  U11: 'bg-violet-600',
  U13: 'bg-blue-600',
  U15: 'bg-emerald-600',
  U17: 'bg-amber-500',
  U19: 'bg-rose-600',
};

function formatRankingsDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl font-black text-amber-500">🥇</span>;
  if (rank === 2) return <span className="text-xl font-black text-slate-400 dark:text-slate-500">🥈</span>;
  if (rank === 3) return <span className="text-xl font-black text-amber-700">🥉</span>;
  return <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums">#{rank}</span>;
}

function RankingsTable({ ageGroup, eventType, date }: { ageGroup: AgeGroup; eventType: EventType; date: string }) {
  const [search, setSearch] = useState('');
  const { players: allPlayers, loading, error } = usePlayers();

  const players = useMemo(
    () =>
      allPlayers
        .flatMap((p) =>
          p.entries
            .filter((e) => e.ageGroup === ageGroup && e.eventType === eventType)
            .map((e) => ({ usabId: p.usabId, name: p.name, rank: e.rank, rankingPoints: e.rankingPoints })),
        )
        .sort((a, b) => a.rank - b.rank),
    [allPlayers, ageGroup, eventType],
  );

  const filtered = useMemo(
    () =>
      players.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.usabId.includes(search),
      ),
    [players, search],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search name or USAB ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 md:py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:focus:ring-emerald-600 bg-white dark:bg-slate-900"
          />
        </div>

      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
            {ageGroup} {eventType}
            {!loading && <span className="text-slate-400 dark:text-slate-500 font-normal ml-2">· {filtered.length} players</span>}
          </p>
          <a
            href={`https://usabjrrankings.org/?age_group=${ageGroup}&category=${eventType}&date=${date}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <span className="hidden sm:inline">usabjrrankings.org</span> <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {loading && players.length === 0 ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">Loading rankings…</p>
          </div>
        ) : error && players.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <WifiOff className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">Could not load rankings for {ageGroup} {eventType.toUpperCase()}</p>
            <a
              href={`https://usabjrrankings.org/?age_group=${ageGroup}&category=${eventType}&date=${date}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
            >
              View on usabjrrankings.org <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">No players match your search.</div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map((player) => (
                <Link
                  key={player.usabId}
                  to={`/directory/${player.usabId}`}
                  className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                >
                  <div className="w-8 shrink-0 text-center">
                    <RankBadge rank={player.rank} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{player.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{player.usabId}</p>
                  </div>
                  <span className="font-bold text-emerald-600 text-sm tabular-nums shrink-0">
                    {player.rankingPoints.toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 dark:text-slate-500 text-xs uppercase tracking-wider">
                    <th className="px-5 py-3 font-medium w-16">Rank</th>
                    <th className="px-5 py-3 font-medium">Player</th>
                    <th className="px-5 py-3 font-medium">USAB ID</th>
                    <th className="px-5 py-3 font-medium text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {filtered.map((player) => (
                    <tr key={player.usabId} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                      <td className="px-5 py-3">
                        <RankBadge rank={player.rank} />
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          to={`/directory/${player.usabId}`}
                          className="font-medium text-slate-800 dark:text-slate-100 hover:text-violet-600 transition-colors"
                        >
                          {player.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{player.usabId}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-bold text-emerald-600 tabular-nums">
                          {player.rankingPoints.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Rankings() {
  const [searchParams] = useSearchParams();
  const paramAge = searchParams.get('age_group') as AgeGroup | null;
  const paramEvent = searchParams.get('event_type') as EventType | null;

  const [ageGroup, setAgeGroup] = useState<AgeGroup>(
    paramAge && AGE_GROUPS.includes(paramAge) ? paramAge : 'U11',
  );
  const [eventType, setEventType] = useState<EventType>(
    paramEvent && EVENT_TYPES.includes(paramEvent) ? paramEvent : 'BS',
  );
  const { rankingsDate } = usePlayers();

  useEffect(() => {
    if (paramAge && AGE_GROUPS.includes(paramAge)) setAgeGroup(paramAge);
    if (paramEvent && EVENT_TYPES.includes(paramEvent)) setEventType(paramEvent);
  }, [paramAge, paramEvent]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 md:w-6 md:h-6 text-amber-500" />
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">USA Junior Rankings</h1>
          </div>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400">
            Official USAB Junior rankings · <a
              href="https://usabjrrankings.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >usabjrrankings.org</a>
          </p>
        </div>
      </div>

      {/* Rankings date note */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-xl text-xs md:text-sm text-blue-700 dark:text-blue-300">
        <Calendar className="w-4 h-4 shrink-0" />
        <span>
          Rankings as of <span className="font-semibold">{formatRankingsDate(rankingsDate)}</span>
        </span>
      </div>

      {/* Age Group Tabs — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
        {AGE_GROUPS.map((ag) => (
          <button
            key={ag}
            onClick={() => setAgeGroup(ag)}
            className={`px-5 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm whitespace-nowrap shrink-0 ${
              ageGroup === ag
                ? `${AGE_COLORS[ag]} text-white scale-105`
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
            }`}
          >
            {ag}
          </button>
        ))}
      </div>

      {/* Event Type Pills — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
        {EVENT_TYPES.map((et) => (
          <button
            key={et}
            onClick={() => setEventType(et)}
            className={`px-3.5 md:px-4 py-2 rounded-xl text-sm font-medium transition-all border whitespace-nowrap shrink-0 shadow-sm ${
              eventType === et
                ? `${AGE_COLORS[ageGroup]} text-white border-transparent scale-105`
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            <span className="font-bold">{et}</span>
          </button>
        ))}
      </div>

      {/* Rankings Table */}
      <RankingsTable ageGroup={ageGroup} eventType={eventType} date={rankingsDate} />
    </div>
  );
}
