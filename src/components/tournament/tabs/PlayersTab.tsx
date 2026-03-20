import { useState, useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Users, Search, ChevronRight } from 'lucide-react';
import { useTabData, TabLoading, TabError, TabEmpty } from '../shared';
import { fetchTournamentPlayers } from '../../../services/rankingsService';
import type { TournamentPlayersResponse } from '../../../types/junior';

const PLAYERS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function PlayersTab({ tswId, active, refreshTrigger }: { tswId: string; active: boolean; refreshTrigger?: number }) {
  const { pathname } = useLocation();
  const { data, loading, error, retry, refresh } = useTabData<TournamentPlayersResponse>(tswId, active, fetchTournamentPlayers, 'players');
  useEffect(() => { if (refreshTrigger) refresh(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps
  const [search, setSearch] = useState('');
  const [clubFilter, setClubFilter] = useState('');
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const clubs = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const p of data.players) {
      const c = p.club || 'N/A';
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.players;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q));
    }
    if (clubFilter) {
      list = list.filter(p => (p.club || 'N/A') === clubFilter);
    }
    if (activeLetter) {
      list = list.filter(p => p.name[0]?.toUpperCase() === activeLetter);
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, search, clubFilter, activeLetter]);

  const letterCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    let base = data.players;
    if (clubFilter) {
      base = base.filter(p => (p.club || 'N/A') === clubFilter);
    }
    const counts: Record<string, number> = {};
    for (const p of base) {
      const first = p.name[0]?.toUpperCase();
      if (first) counts[first] = (counts[first] ?? 0) + 1;
    }
    return counts;
  }, [data, clubFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const p of filtered) {
      const letter = p.name[0]?.toUpperCase() ?? '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (loading) return <TabLoading label="players" />;
  if (error) return <TabError error={error} onRetry={retry} />;
  if (!data || data.players.length === 0) return <TabEmpty icon={Users} message="No player data available for this tournament." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search players or clubs…"
            value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveLetter(null); }}
            className="w-full md:max-w-md pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:focus:ring-violet-600 bg-white dark:bg-slate-900"
          />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
          {filtered.length} of {data.players.length} players
          {clubs.length > 0 && <> &middot; {clubs.length} clubs</>}
        </p>
      </div>

      {clubs.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4 md:mx-0 md:px-0">
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0">Club:</span>
          <button
            onClick={() => setClubFilter('')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              !clubFilter
                ? 'bg-violet-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            All
          </button>
          {clubs.map(c => (
            <button
              key={c.name}
              onClick={() => setClubFilter(c.name === clubFilter ? '' : c.name)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                c.name === clubFilter
                  ? 'bg-violet-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              {c.name} ({c.count})
            </button>
          ))}
        </div>
      )}

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
        {PLAYERS_ALPHABET.map(letter => {
          const count = letterCounts[letter] ?? 0;
          return (
            <button
              key={letter}
              onClick={() => { setActiveLetter(letter === activeLetter ? null : letter); setSearch(''); }}
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

      {filtered.length > 0 && (search || activeLetter || clubFilter) && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Showing <span className="font-medium text-slate-600 dark:text-slate-300">{filtered.length}</span> players
          {clubFilter && ` from ${clubFilter}`}
          {activeLetter && ` starting with "${activeLetter}"`}
          {search && ` matching "${search}"`}
        </p>
      )}

      <div className="space-y-5">
        {grouped.map(([letter, group]) => (
          <div key={letter}>
            <div className="flex items-center gap-3 mb-2.5">
              <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                {letter}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{group.length} players</span>
              <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {group.map(player => (
                <Link
                  key={player.playerId}
                  to={`/tournaments/${tswId}/player/${player.playerId}`}
                  state={{ fromPath: pathname }}
                  className="group block bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-700 hover:shadow-md active:bg-slate-50 dark:active:bg-slate-800 transition-all p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {player.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors truncate">
                          {player.name}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                          {player.club || '\u2014'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-slate-400 dark:text-slate-500 py-12">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No players match your search</p>
        </div>
      )}
    </div>
  );
}
