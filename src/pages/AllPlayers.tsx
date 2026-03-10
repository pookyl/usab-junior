import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Users, RefreshCw, ChevronRight } from 'lucide-react';
import type { AgeGroup, EventType, UniquePlayer } from '../types/junior';
import { AGE_GROUPS, EVENT_LABELS } from '../types/junior';
import { usePlayers } from '../contexts/PlayersContext';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const AGE_BADGE_COLORS: Record<AgeGroup, string> = {
  U11: 'bg-violet-100 text-violet-700',
  U13: 'bg-blue-100 text-blue-700',
  U15: 'bg-emerald-100 text-emerald-700',
  U17: 'bg-amber-100 text-amber-700',
  U19: 'bg-rose-100 text-rose-700',
};

const AGE_FILTER_ACTIVE: Record<AgeGroup, string> = {
  U11: 'bg-violet-600 text-white',
  U13: 'bg-blue-600 text-white',
  U15: 'bg-emerald-600 text-white',
  U17: 'bg-amber-500 text-white',
  U19: 'bg-rose-600 text-white',
};

const EVENT_BADGE_COLORS: Record<EventType, string> = {
  BS: 'bg-indigo-50 text-indigo-600',
  GS: 'bg-pink-50 text-pink-600',
  BD: 'bg-cyan-50 text-cyan-600',
  GD: 'bg-orange-50 text-orange-600',
  XD: 'bg-teal-50 text-teal-600',
};

function bestRankingForGroup(player: UniquePlayer, ageGroup: AgeGroup | null) {
  const entries = ageGroup
    ? player.entries.filter((e) => e.ageGroup === ageGroup)
    : player.entries;
  if (entries.length === 0) return null;
  return entries.reduce((best, e) => (e.rank < best.rank ? e : best));
}

function PlayerCard({ player, ageGroupFilter }: { player: UniquePlayer; ageGroupFilter: AgeGroup | null }) {
  const best = bestRankingForGroup(player, ageGroupFilter);
  const ageGroups = [...new Set(player.entries.map((e) => e.ageGroup))].sort(
    (a, b) => AGE_GROUPS.indexOf(a) - AGE_GROUPS.indexOf(b),
  );
  const events = [...new Set(player.entries.map((e) => e.eventType))];

  return (
    <Link
      to={`/directory/${player.usabId}`}
      className="group block bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-700 hover:shadow-md active:bg-slate-50 dark:active:bg-slate-800 transition-all p-3.5 md:p-4"
    >
      <div className="flex items-start justify-between gap-2 md:gap-3">
        <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs md:text-sm shrink-0">
            {player.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 group-hover:text-violet-700 transition-colors truncate">
              {player.name}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{player.usabId}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {best && (
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-600">#{best.rank}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{best.ageGroup} {best.eventType}</p>
            </div>
          )}
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-violet-400 transition-colors" />
        </div>
      </div>

      <div className="mt-2.5 md:mt-3 flex flex-wrap gap-1 md:gap-1.5">
        {ageGroups.map((ag) => (
          <span key={ag} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${AGE_BADGE_COLORS[ag]}`}>
            {ag}
          </span>
        ))}
        {events.map((et) => (
          <span key={et} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${EVENT_BADGE_COLORS[et]}`}>
            {EVENT_LABELS[et]}
          </span>
        ))}
      </div>
    </Link>
  );
}

export default function AllPlayers() {
  const { players, loading, error } = usePlayers();
  const [searchParams] = useSearchParams();
  const paramAge = searchParams.get('age_group') as AgeGroup | null;
  const [search, setSearch] = useState('');
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [ageGroupFilter, setAgeGroupFilter] = useState<AgeGroup | null>(
    paramAge && AGE_GROUPS.includes(paramAge) ? paramAge : null,
  );

  const filtered = useMemo(() => {
    let result = players;

    if (ageGroupFilter) {
      result = result.filter((p) =>
        p.entries.some((e) => e.ageGroup === ageGroupFilter),
      );
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.usabId.includes(search),
      );
    }

    if (activeLetter) {
      result = result.filter((p) =>
        p.name.toUpperCase().startsWith(activeLetter),
      );
    }

    return result;
  }, [players, search, activeLetter, ageGroupFilter]);

  const letterCounts = useMemo(() => {
    const base = ageGroupFilter
      ? players.filter((p) => p.entries.some((e) => e.ageGroup === ageGroupFilter))
      : players;
    const counts: Record<string, number> = {};
    for (const p of base) {
      const first = p.name[0]?.toUpperCase();
      if (first) counts[first] = (counts[first] ?? 0) + 1;
    }
    return counts;
  }, [players, ageGroupFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, UniquePlayer[]> = {};
    for (const p of filtered) {
      const letter = p.name[0]?.toUpperCase() ?? '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-violet-500" />
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">Players</h1>
          </div>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400">
            Complete directory ·{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">{players.length.toLocaleString()}</span> players
          </p>
        </div>
      </div>

      {/* Age group filter — horizontal scroll on mobile */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Filter by Age Group</p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
          {AGE_GROUPS.map((ag) => (
            <button
              key={ag}
              onClick={() => setAgeGroupFilter(ageGroupFilter === ag ? null : ag)}
              className={`px-5 py-2 md:py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm whitespace-nowrap shrink-0 ${
                ageGroupFilter === ag
                  ? `${AGE_FILTER_ACTIVE[ag]} scale-105`
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              {ag}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder="Search by name or USAB ID…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value) setActiveLetter(null);
          }}
          className="w-full md:max-w-md pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 dark:focus:ring-violet-600 bg-white dark:bg-slate-900"
        />
      </div>

      {/* Alphabet strip — horizontally scrollable on mobile */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
        <button
          onClick={() => setActiveLetter(null)}
          className={`px-2.5 md:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
            activeLetter === null
              ? 'bg-violet-600 text-white'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-violet-300 dark:hover:border-violet-600'
          }`}
        >
          A-Z
        </button>
        {ALPHABET.map((letter) => {
          const count = letterCounts[letter] ?? 0;
          return (
            <button
              key={letter}
              onClick={() => {
                setActiveLetter(letter === activeLetter ? null : letter);
                setSearch('');
              }}
              disabled={count === 0}
              className={`w-8 md:w-9 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                letter === activeLetter
                  ? 'bg-violet-600 text-white'
                  : count > 0
                    ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-600 hover:text-violet-600'
                    : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && players.length === 0 && (
        <div className="py-16 text-center">
          <RefreshCw className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
<p className="text-slate-400 dark:text-slate-500 text-sm">
          Loading players across all age groups (U11–U19)…
        </p>
        <p className="text-slate-300 dark:text-slate-600 text-xs mt-1">Fetching 25 ranking categories</p>
        </div>
      )}

      {/* Error */}
      {error && players.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm">{error}</p>
        </div>
      )}

      {/* Results count */}
      {filtered.length > 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Showing <span className="font-medium text-slate-600 dark:text-slate-300">{filtered.length}</span>{' '}
          {ageGroupFilter ? `${ageGroupFilter} ` : ''}
          players
          {activeLetter && ` starting with "${activeLetter}"`}
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* No results */}
      {!loading && filtered.length === 0 && players.length > 0 && (
        <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">
          No players match your filters.
        </div>
      )}

      {/* Grouped player cards */}
      <div className="space-y-5 md:space-y-6">
        {grouped.map(([letter, group]) => (
          <div key={letter}>
            <div className="flex items-center gap-3 mb-2.5 md:mb-3">
              <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                {letter}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{group.length} players</span>
              <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3">
              {group.map((player) => (
                <PlayerCard key={player.usabId} player={player} ageGroupFilter={ageGroupFilter} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Loading overlay for refresh */}
      {loading && players.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-40">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading all age groups…
        </div>
      )}
    </div>
  );
}
