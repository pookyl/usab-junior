import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, ExternalLink, RefreshCw, Trophy, Wifi, WifiOff } from 'lucide-react';
import type { AgeGroup, EventType } from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES, EVENT_LABELS } from '../types/junior';
import { useRankings } from '../hooks/useRankings';
import { usabPlayerUrl, tswSearchUrl } from '../services/rankingsService';

const AGE_COLORS: Record<AgeGroup, string> = {
  U11: 'bg-violet-600',
  U13: 'bg-blue-600',
  U15: 'bg-emerald-600',
  U17: 'bg-amber-500',
  U19: 'bg-rose-600',
};
const AGE_LIGHT: Record<AgeGroup, string> = {
  U11: 'bg-violet-50 text-violet-700 border-violet-200',
  U13: 'bg-blue-50 text-blue-700 border-blue-200',
  U15: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  U17: 'bg-amber-50 text-amber-700 border-amber-200',
  U19: 'bg-rose-50 text-rose-700 border-rose-200',
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl font-black text-amber-500">🥇</span>;
  if (rank === 2) return <span className="text-xl font-black text-slate-400">🥈</span>;
  if (rank === 3) return <span className="text-xl font-black text-amber-700">🥉</span>;
  return <span className="font-semibold text-slate-500 tabular-nums">#{rank}</span>;
}

function RankingsTable({ ageGroup, eventType }: { ageGroup: AgeGroup; eventType: EventType }) {
  const [search, setSearch] = useState('');
  const { players, loading, error, source, refresh } = useRankings(ageGroup, eventType);

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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or USAB ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-3 text-sm text-slate-500">
          {source === 'live' ? (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Wifi className="w-4 h-4" /> Live data
            </span>
          ) : source === 'static' ? (
            <span className="flex items-center gap-1.5 text-slate-500">
              <WifiOff className="w-4 h-4" /> Cached · Mar 2026
            </span>
          ) : null}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <p className="text-sm text-slate-600 font-medium">
            {ageGroup} {EVENT_LABELS[eventType]}
            {!loading && <span className="text-slate-400 font-normal ml-2">· {filtered.length} players</span>}
          </p>
          <a
            href={`https://usabjrrankings.org/?age_group=${ageGroup}&category=${eventType}&date=2026-03-01`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            usabjrrankings.org <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {loading && players.length === 0 ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-8 h-8 text-slate-300 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Fetching live rankings…</p>
          </div>
        ) : error && players.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <WifiOff className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-slate-400 text-sm">Could not load rankings for {ageGroup} {eventType}</p>
            <a
              href={`https://usabjrrankings.org/?age_group=${ageGroup}&category=${eventType}&date=2026-03-01`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
            >
              View on usabjrrankings.org <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">No players match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium w-16">Rank</th>
                  <th className="px-5 py-3 font-medium">Player</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">USAB ID</th>
                  <th className="px-5 py-3 font-medium text-right">Points</th>
                  <th className="px-5 py-3 font-medium text-right">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((player) => (
                  <tr key={player.usabId} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3">
                      <RankBadge rank={player.rank} />
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/players/${player.usabId}?age_group=${player.ageGroup}&category=${player.eventType}`}
                        className="font-medium text-slate-800 hover:text-emerald-700 transition-colors"
                      >
                        {player.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className="font-mono text-xs text-slate-400">{player.usabId}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-bold text-emerald-600 tabular-nums">
                        {player.rankingPoints.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <a
                          href={usabPlayerUrl(player.usabId, player.ageGroup, player.eventType)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View USAB profile"
                          className="px-2 py-0.5 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full hover:bg-violet-100 transition-colors flex items-center gap-0.5"
                        >
                          USAB <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        <a
                          href={tswSearchUrl(player.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Search match history on TournamentSoftware"
                          className="px-2 py-0.5 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full hover:bg-orange-100 transition-colors flex items-center gap-0.5"
                        >
                          Matches <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Rankings() {
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('U11');
  const [eventType, setEventType] = useState<EventType>('BS');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-6 h-6 text-amber-500" />
            <h1 className="text-3xl font-bold text-slate-800">USA Junior Rankings</h1>
          </div>
          <p className="text-slate-500">
            Official USAB Junior rankings · Data from{' '}
            <a
              href="https://usabjrrankings.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              usabjrrankings.org
            </a>
            {' '}· Match history via{' '}
            <a
              href="https://www.tournamentsoftware.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 hover:underline"
            >
              tournamentsoftware.com
            </a>
          </p>
        </div>
      </div>

      {/* Age Group Tabs */}
      <div className="flex gap-2 flex-wrap">
        {AGE_GROUPS.map((ag) => (
          <button
            key={ag}
            onClick={() => setAgeGroup(ag)}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
              ageGroup === ag
                ? `${AGE_COLORS[ag]} text-white scale-105`
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
            }`}
          >
            {ag}
          </button>
        ))}
      </div>

      {/* Event Type Pills */}
      <div className="flex gap-2 flex-wrap">
        {EVENT_TYPES.map((et) => (
          <button
            key={et}
            onClick={() => setEventType(et)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
              eventType === et
                ? AGE_LIGHT[ageGroup]
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
            }`}
          >
            <span className="font-bold">{et}</span>
            <span className="ml-1.5 text-xs hidden sm:inline opacity-75">· {EVENT_LABELS[et]}</span>
          </button>
        ))}
      </div>

      {/* Rankings Table */}
      <RankingsTable key={`${ageGroup}-${eventType}`} ageGroup={ageGroup} eventType={eventType} />
    </div>
  );
}
