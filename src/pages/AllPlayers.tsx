import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Users, RefreshCw, ChevronRight } from 'lucide-react';
import type { AgeGroup, EventType, PlayerEntry } from '../types/junior';
import { AGE_GROUPS } from '../types/junior';
import { usePlayers } from '../contexts/PlayersContext';

interface DirectoryViewPlayer {
  usabId: string;
  name: string;
  entries: PlayerEntry[];
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const AGE_BADGE_COLORS: Record<AgeGroup, string> = {
  U11: 'bg-violet-100 text-violet-700',
  U13: 'bg-blue-100 text-blue-700',
  U15: 'bg-emerald-100 text-emerald-700',
  U17: 'bg-amber-100 text-amber-700',
  U19: 'bg-rose-100 text-rose-700',
};

const AGE_FILTER_ACTIVE: Record<AgeGroup, string> = {
  U11: 'bg-purple-600 text-white',
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

function bestRankingForGroup(player: DirectoryViewPlayer, ageGroup: AgeGroup | null) {
  const entries = ageGroup
    ? player.entries.filter((e) => e.ageGroup === ageGroup)
    : player.entries;
  if (entries.length === 0) return null;
  return entries.reduce((best, e) => (e.rank < best.rank ? e : best));
}

const VIRTUALIZE_AFTER = 180;

const PlayerCard = memo(function PlayerCard(
  { player, ageGroupFilter }: { player: DirectoryViewPlayer; ageGroupFilter: AgeGroup | null },
) {
  const best = bestRankingForGroup(player, ageGroupFilter);
  const isRanked = player.entries.length > 0;
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
          <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-xs md:text-sm shrink-0 ${
            isRanked ? 'from-violet-500 to-blue-500' : 'from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700'
          }`}>
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
          {best ? (
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-600">#{best.rank}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{best.ageGroup} {best.eventType}</p>
            </div>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              Unranked
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-violet-400 transition-colors" />
        </div>
      </div>

      {isRanked && (
        <div className="mt-2.5 md:mt-3 flex flex-wrap gap-1 md:gap-1.5">
          {ageGroups.map((ag) => (
            <span key={ag} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${AGE_BADGE_COLORS[ag]}`}>
              {ag}
            </span>
          ))}
          {events.map((et) => (
            <span key={et} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${EVENT_BADGE_COLORS[et]}`}>
              {et}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
});

type VirtualDirectoryRow =
  | { type: 'header'; key: string; letter: string; count: number }
  | { type: 'players'; key: string; players: DirectoryViewPlayer[] };

function chunkPlayers(players: DirectoryViewPlayer[], size: number) {
  const rows: DirectoryViewPlayer[][] = [];
  for (let i = 0; i < players.length; i += size) {
    rows.push(players.slice(i, i + size));
  }
  return rows;
}

function VirtualizedDirectory({
  grouped,
  ageGroupFilter,
}: {
  grouped: Array<[string, DirectoryViewPlayer[]]>;
  ageGroupFilter: AgeGroup | null;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const updateColumns = () => {
      const width = node.clientWidth;
      setColumns(width >= 1024 ? 3 : width >= 640 ? 2 : 1);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => {
    const flattened: VirtualDirectoryRow[] = [];
    for (const [letter, players] of grouped) {
      flattened.push({
        type: 'header',
        key: `header:${letter}`,
        letter,
        count: players.length,
      });
      const chunks = chunkPlayers(players, columns);
      chunks.forEach((chunk, index) => {
        flattened.push({
          type: 'players',
          key: `${letter}:${index}`,
          players: chunk,
        });
      });
    }
    return flattened;
  }, [grouped, columns]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.type === 'header' ? 52 : 170),
    overscan: 8,
  });

  return (
    <div
      ref={scrollRef}
      className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-100 bg-white/40 pr-1 dark:border-slate-800 dark:bg-slate-900/30"
    >
      <div
        className="relative"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          return (
            <div
              key={row.key}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full px-3 py-1 md:px-4"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.type === 'header' ? (
                <div className="flex items-center gap-3 py-2 md:py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                    {row.letter}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{row.count} players</span>
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                </div>
              ) : (
                <div
                  className="grid gap-2.5 md:gap-3"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                  {row.players.map((player) => (
                    <PlayerCard key={player.usabId} player={player} ageGroupFilter={ageGroupFilter} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AllPlayers() {
  const {
    players,
    directoryPlayers,
    directoryLoading,
    loading,
    error,
    ensurePlayers,
    ensureDirectoryPlayers,
  } = usePlayers();
  const [searchParams] = useSearchParams();
  const paramAge = searchParams.get('age_group') as AgeGroup | null;
  const [search, setSearch] = useState('');
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [rankFilter, setRankFilter] = useState<'ranked' | 'unranked'>('ranked');
  const [ageGroupFilter, setAgeGroupFilter] = useState<AgeGroup | null>(
    paramAge && AGE_GROUPS.includes(paramAge) ? paramAge : null,
  );

  useEffect(() => {
    void ensureDirectoryPlayers();
  }, [ensureDirectoryPlayers]);

  useEffect(() => {
    void ensurePlayers();
  }, [ensurePlayers]);

  const rankedMap = useMemo(() => {
    const map = new Map<string, PlayerEntry[]>();
    for (const p of players) map.set(p.usabId, p.entries);
    return map;
  }, [players]);

  const allDirectoryViewPlayers: DirectoryViewPlayer[] = useMemo(() => {
    if (directoryPlayers.length > 0) {
      return directoryPlayers.map((dp) => ({
        usabId: dp.usabId,
        name: dp.name,
        entries: rankedMap.get(dp.usabId) ?? [],
      }));
    }
    return players.map((p) => ({ usabId: p.usabId, name: p.name, entries: p.entries }));
  }, [directoryPlayers, players, rankedMap]);

  const filtered = useMemo(() => {
    let result = allDirectoryViewPlayers;

    if (rankFilter === 'ranked') {
      result = result.filter((p) => p.entries.length > 0);
    } else {
      result = result.filter((p) => p.entries.length === 0);
    }

    if (ageGroupFilter && rankFilter === 'ranked') {
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
  }, [allDirectoryViewPlayers, search, activeLetter, ageGroupFilter, rankFilter]);

  const letterCounts = useMemo(() => {
    const base = ageGroupFilter
      ? allDirectoryViewPlayers.filter((p) => p.entries.some((e) => e.ageGroup === ageGroupFilter))
      : allDirectoryViewPlayers;
    const counts: Record<string, number> = {};
    for (const p of base) {
      const first = p.name[0]?.toUpperCase();
      if (first) counts[first] = (counts[first] ?? 0) + 1;
    }
    return counts;
  }, [allDirectoryViewPlayers, ageGroupFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, DirectoryViewPlayer[]> = {};
    for (const p of filtered) {
      const letter = p.name[0]?.toUpperCase() ?? '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const isLoading = directoryLoading || (loading && allDirectoryViewPlayers.length === 0);
  const shouldVirtualize = filtered.length >= VIRTUALIZE_AFTER;

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
            <span className="font-medium text-slate-700 dark:text-slate-200">{allDirectoryViewPlayers.length.toLocaleString()}</span> players
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Rank filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {(['ranked', 'unranked'] as const).map((value) => (
            <button
              key={value}
              onClick={() => {
                setRankFilter(value);
                if (value === 'unranked') setAgeGroupFilter(null);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all shadow-sm whitespace-nowrap shrink-0 ${
                rankFilter === value
                  ? 'bg-violet-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              {value === 'ranked' ? 'Ranked' : 'Unranked'}
            </button>
          ))}
        </div>

        {/* Age group filter — only visible for ranked players */}
        {rankFilter === 'ranked' && (
          <>
            <div className="hidden md:block w-px h-5 bg-slate-200 dark:bg-slate-700" />
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setAgeGroupFilter(null)}
                className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all shadow-sm whitespace-nowrap shrink-0 ${
                  ageGroupFilter === null
                    ? 'bg-violet-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                All
              </button>
              {AGE_GROUPS.map((ag) => (
                <button
                  key={ag}
                  onClick={() => setAgeGroupFilter(ag)}
                  className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all shadow-sm whitespace-nowrap shrink-0 ${
                    ageGroupFilter === ag
                      ? `${AGE_FILTER_ACTIVE[ag]}`
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  {ag}
                </button>
              ))}
            </div>
          </>
        )}
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
          className="w-full md:max-w-md pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:focus:ring-violet-600 bg-white dark:bg-slate-900"
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
      {isLoading && allDirectoryViewPlayers.length === 0 && (
        <div className="py-16 text-center">
          <RefreshCw className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">Loading player directory…</p>
        </div>
      )}

      {/* Error */}
      {error && allDirectoryViewPlayers.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm">{error}</p>
        </div>
      )}

      {/* Results count */}
      {filtered.length > 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Showing <span className="font-medium text-slate-600 dark:text-slate-300">{filtered.length}</span>{' '}
          {`${rankFilter} `}
          {ageGroupFilter ? `${ageGroupFilter} ` : ''}
          players
          {activeLetter && ` starting with "${activeLetter}"`}
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* No results */}
      {!isLoading && filtered.length === 0 && allDirectoryViewPlayers.length > 0 && (
        <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">
          No players match your filters.
        </div>
      )}

      {/* Grouped player cards */}
      {shouldVirtualize ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Large result set detected, using a virtualized list for smoother scrolling.
          </p>
          <VirtualizedDirectory grouped={grouped} ageGroupFilter={ageGroupFilter} />
        </div>
      ) : (
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
      )}

      {/* Loading overlay for refresh */}
      {loading && allDirectoryViewPlayers.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-40">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Updating rankings…
        </div>
      )}
    </div>
  );
}
