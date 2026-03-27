import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Eye, X, Trash2, UserPlus, ChevronDown, ChevronUp, UsersRound, CalendarDays, Pencil, Check } from 'lucide-react';
import { TabLoading, TabEmpty } from '../shared';
import MatchCard from '../MatchCard';
import { useWatchlist } from '../../../contexts/WatchlistContext';
import { useTournamentMeta } from '../../../hooks/useTournamentMeta';
import { fetchTournamentPlayers, fetchTournamentPlayerDetail } from '../../../services/rankingsService';
import type {
  TournamentPlayer,
  TournamentPlayersResponse,
  TournamentPlayerDetailResponse,
  TournamentMatch,
} from '../../../types/junior';

interface PlayerMatchData {
  playerId: number;
  playerName: string;
  wins: number;
  losses: number;
  matches: TournamentMatch[];
  loading: boolean;
  error: string | null;
}

function matchKey(m: TournamentMatch): string {
  const t1 = [...m.team1].sort().join(',');
  const t2 = [...m.team2].sort().join(',');
  const teams = [t1, t2].sort().join('|');
  return `${m.event}|${m.round}|${teams}`;
}

/**
 * Parse time strings into a comparable number. Handles:
 * - "3/15/2026 10:30 AM"  (date + 12h time)
 * - "10:30"               (24h time only)
 * - ""                    (empty → 0)
 * Returns a timestamp-like number for sorting (higher = more recent).
 */
function parseSortableTime(time: string): number {
  if (!time) return 0;

  // Try full date+time: M/D/YYYY H:MM AM/PM
  const dtMatch = time.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (dtMatch) {
    const month = parseInt(dtMatch[1], 10);
    const day = parseInt(dtMatch[2], 10);
    const year = parseInt(dtMatch[3], 10);
    let hour = parseInt(dtMatch[4], 10);
    const min = parseInt(dtMatch[5], 10);
    const ampm = dtMatch[6].toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return new Date(year, month - 1, day, hour, min).getTime();
  }

  // Try 24h time: HH:MM
  const tMatch = time.match(/^(\d{1,2}):(\d{2})/);
  if (tMatch) {
    return parseInt(tMatch[1], 10) * 60 + parseInt(tMatch[2], 10);
  }

  return 0;
}

function isTodayInRange(startDate: string, endDate: string): boolean {
  if (!startDate) return false;
  const now = new Date();
  const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = new Date(startDate + 'T00:00:00').getTime();
  const end = endDate ? new Date(endDate + 'T00:00:00').getTime() : start;
  if (isNaN(start) || isNaN(end)) return false;
  return todayTs >= start && todayTs <= end;
}

function matchDateStr(time: string): string | null {
  const m = time.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${parseInt(m[1], 10)}/${parseInt(m[2], 10)}/${m[3]}`;
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function isNowPlayingMatch(m: TournamentMatch): boolean {
  if (/^now\s*playing$/i.test((m.status || '').trim())) return true;
  const raw = m.header || '';
  return /\bNow\s*playing\b/i.test(raw);
}

interface WatchlistUIState {
  summaryOpen?: boolean;
  pickerOpen?: boolean;
  playerFilter?: number | null;
  todayOnly?: boolean;
}

function loadWatchlistUI(tswId: string, listIndex: number): WatchlistUIState {
  try {
    const raw = sessionStorage.getItem(`watchlist-ui-${tswId}-${listIndex}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveWatchlistUI(tswId: string, listIndex: number, state: WatchlistUIState): void {
  try {
    sessionStorage.setItem(`watchlist-ui-${tswId}-${listIndex}`, JSON.stringify(state));
  } catch { /* quota errors are non-critical */ }
}

// ── Watchlist Tab Switcher ──────────────────────────────────────────────────

function WatchlistTabSwitcher({
  lists,
  activeIndex,
  onSwitch,
  onRename,
}: {
  lists: { name: string; players: TournamentPlayer[] }[];
  activeIndex: number;
  onSwitch: (index: number) => void;
  onRename: (index: number, name: string) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIndex !== null) inputRef.current?.focus();
  }, [editingIndex]);

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditValue(lists[index].name);
  };

  const commitRename = () => {
    if (editingIndex !== null && editValue.trim()) {
      onRename(editingIndex, editValue.trim());
    }
    setEditingIndex(null);
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
      {lists.map((list, i) => {
        const isActive = i === activeIndex;
        const isEditing = editingIndex === i;
        const count = list.players.length;

        if (isEditing) {
          return (
            <div key={i} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingIndex(null); }}
                onBlur={commitRename}
                maxLength={20}
                className="bg-transparent text-white text-xs font-medium outline-none w-20 min-w-0 placeholder:text-violet-300"
              />
              <button type="button" onMouseDown={e => { e.preventDefault(); commitRename(); }} className="text-violet-200 hover:text-white shrink-0">
                <Check className="w-3 h-3" />
              </button>
            </div>
          );
        }

        return (
          <button
            key={i}
            type="button"
            onClick={() => isActive ? undefined : onSwitch(i)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span className="truncate max-w-[7rem]">{list.name}</span>
            {count > 0 && (
              <span className={`shrink-0 text-[10px] font-bold tabular-nums ${
                isActive ? 'text-violet-200' : 'text-slate-400 dark:text-slate-500'
              }`}>
                ({count})
              </span>
            )}
            {isActive && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); startEditing(i); }}
                className="shrink-0 text-violet-200 hover:text-white ml-0.5"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function WatchlistTab({ tswId, refreshTrigger }: { tswId: string; refreshTrigger?: number }) {
  const { pathname } = useLocation();
  const {
    players: watchedPlayers,
    playerIds: watchedIds,
    maxPlayers,
    addPlayer,
    removePlayer,
    clearAll,
    activeIndex,
    lists,
    switchList,
    renameList,
    bindTournament,
  } = useWatchlist();
  const atCapacity = Number.isFinite(maxPlayers) && watchedPlayers.length >= maxPlayers;
  const meta = useTournamentMeta(tswId);
  const showTodayPill = useMemo(() => isTodayInRange(meta.startDate, meta.endDate), [meta.startDate, meta.endDate]);

  // Bind this tournament on mount / when tswId or endDate becomes available
  const boundRef = useRef<string | null>(null);
  useEffect(() => {
    const endDate = meta.endDate || meta.startDate || '';
    if (boundRef.current !== tswId) {
      bindTournament(tswId, endDate);
      boundRef.current = tswId;
    }
  }, [tswId, meta.endDate, meta.startDate, bindTournament]);

  const savedUI = useMemo(() => loadWatchlistUI(tswId, activeIndex), [tswId, activeIndex]);
  const hadSavedTodayOnly = useRef(savedUI.todayOnly !== undefined);

  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);

  const [playerData, setPlayerData] = useState<Map<number, PlayerMatchData>>(new Map());
  const [pickerOpen, setPickerOpen] = useState(savedUI.pickerOpen ?? true);
  const [summaryOpen, setSummaryOpen] = useState(savedUI.summaryOpen ?? true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [clubFilter, setClubFilter] = useState('');
  const [playerFilter, setPlayerFilter] = useState<number | null>(savedUI.playerFilter ?? null);
  const [todayOnly, setTodayOnly] = useState(savedUI.todayOnly ?? showTodayPill);

  // Reset local state when switching active watchlist
  const prevIndex = useRef(activeIndex);
  useEffect(() => {
    if (prevIndex.current !== activeIndex) {
      prevIndex.current = activeIndex;
      setPlayerData(new Map());
      fetchedPlayerIds.current.clear();
      setPlayerFilter(null);
      setSearchQuery('');
      setClubFilter('');
      setDropdownOpen(false);
      const ui = loadWatchlistUI(tswId, activeIndex);
      setSummaryOpen(ui.summaryOpen ?? true);
      setPickerOpen(ui.pickerOpen ?? true);
      setTodayOnly(ui.todayOnly ?? showTodayPill);
      hadSavedTodayOnly.current = ui.todayOnly !== undefined;
    }
  }, [activeIndex, tswId, showTodayPill]);

  useEffect(() => {
    if (!hadSavedTodayOnly.current) {
      setTodayOnly(showTodayPill);
    }
  }, [showTodayPill]);

  useEffect(() => {
    saveWatchlistUI(tswId, activeIndex, { summaryOpen, pickerOpen, playerFilter, todayOnly });
  }, [tswId, activeIndex, summaryOpen, pickerOpen, playerFilter, todayOnly]);

  const fetchedPlayerIds = useRef(new Set<number>());
  const refreshSeq = useRef(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchPlayerDetail = useCallback((player: TournamentPlayer, refresh: boolean) => {
    setPlayerData(prev => {
      const next = new Map(prev);
      next.set(player.playerId, {
        playerId: player.playerId,
        playerName: player.name,
        wins: 0,
        losses: 0,
        matches: [],
        loading: true,
        error: null,
      });
      return next;
    });

    fetchTournamentPlayerDetail(tswId, player.playerId, refresh)
      .then((resp: TournamentPlayerDetailResponse) => {
        setPlayerData(prev => {
          const next = new Map(prev);
          next.set(player.playerId, {
            playerId: player.playerId,
            playerName: resp.playerName || player.name,
            wins: resp.winLoss?.wins ?? 0,
            losses: resp.winLoss?.losses ?? 0,
            matches: resp.matches,
            loading: false,
            error: null,
          });
          return next;
        });
      })
      .catch(e => {
        setPlayerData(prev => {
          const next = new Map(prev);
          next.set(player.playerId, {
            playerId: player.playerId,
            playerName: player.name,
            wins: 0,
            losses: 0,
            matches: [],
            loading: false,
            error: e.message,
          });
          return next;
        });
      });
  }, [tswId]);

  // Fetch tournament player roster for the picker
  useEffect(() => {
    let cancelled = false;
    setPlayersLoading(true);
    fetchTournamentPlayers(tswId)
      .then((resp: TournamentPlayersResponse) => {
        if (!cancelled) setTournamentPlayers(resp.players);
      })
      .catch(e => { if (!cancelled) setPlayersError(e.message); })
      .finally(() => { if (!cancelled) setPlayersLoading(false); });
    return () => { cancelled = true; };
  }, [tswId]);

  // Fetch match data for each newly added watched player
  useEffect(() => {
    for (const p of watchedPlayers) {
      if (fetchedPlayerIds.current.has(p.playerId)) continue;
      fetchedPlayerIds.current.add(p.playerId);
      fetchPlayerDetail(p, false);
    }
  }, [watchedPlayers, fetchPlayerDetail]);

  // Handle refresh from parent
  useEffect(() => {
    if (!refreshTrigger) return;
    const seq = ++refreshSeq.current;
    for (const p of watchedPlayers) {
      fetchPlayerDetail(p, true);
    }
    fetchTournamentPlayers(tswId, true)
      .then((resp: TournamentPlayersResponse) => {
        if (seq === refreshSeq.current) setTournamentPlayers(resp.players);
      })
      .catch(() => {});
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up removed players from match data
  useEffect(() => {
    setPlayerData(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const pid of next.keys()) {
        if (!watchedIds.has(pid)) {
          next.delete(pid);
          fetchedPlayerIds.current.delete(pid);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (playerFilter !== null && !watchedIds.has(playerFilter)) {
      setPlayerFilter(null);
    }
  }, [watchedIds, playerFilter]);

  const handleClearAll = useCallback(() => {
    clearAll();
    setPlayerData(new Map());
    fetchedPlayerIds.current.clear();
    setPlayerFilter(null);
  }, [clearAll]);

  // Club list from tournament players
  const clubs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of tournamentPlayers) {
      const c = p.club || 'N/A';
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [tournamentPlayers]);

  // Filtered player list for dropdown (shows all on focus, filters on search)
  const dropdownPlayers = useMemo(() => {
    let pool = tournamentPlayers.filter(p => !watchedIds.has(p.playerId));
    if (clubFilter) {
      pool = pool.filter(p => (p.club || 'N/A') === clubFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      pool = pool.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q));
    }
    return pool;
  }, [tournamentPlayers, searchQuery, watchedIds, clubFilter]);

  const remaining = Number.isFinite(maxPlayers) ? maxPlayers - watchedPlayers.length : Infinity;

  // Add all visible players in dropdown at once (capped to remaining capacity)
  const handleAddAllVisible = useCallback(() => {
    const toAdd = Number.isFinite(remaining) ? dropdownPlayers.slice(0, remaining) : dropdownPlayers;
    for (const p of toAdd) {
      addPlayer(p);
    }
    setSearchQuery('');
    setClubFilter('');
  }, [dropdownPlayers, addPlayer, remaining]);

  // Aggregate summary
  const summary = useMemo(() => {
    const perPlayer: { playerId: number; name: string; wins: number; losses: number; total: number; loading: boolean }[] = [];
    let totalWins = 0;
    let totalLosses = 0;
    let anyLoading = false;

    for (const p of watchedPlayers) {
      const d = playerData.get(p.playerId);
      const w = d?.wins ?? 0;
      const l = d?.losses ?? 0;
      const isLoading = d?.loading ?? true;
      perPlayer.push({ playerId: p.playerId, name: p.name, wins: w, losses: l, total: w + l, loading: isLoading });
      totalWins += w;
      totalLosses += l;
      if (isLoading) anyLoading = true;
    }

    return { perPlayer, totalWins, totalLosses, totalMatches: totalWins + totalLosses, anyLoading };
  }, [watchedPlayers, playerData]);

  // Deduped, sorted matches (most recent date/time first)
  const matchList = useMemo(() => {
    const seen = new Set<string>();
    const result: { match: TournamentMatch; sortKey: number; nowPlaying: boolean; highlightPlayerId: number; highlightPlayerName: string; isInternal: boolean }[] = [];
    const watchedIdSet = watchedIds;

    for (const p of watchedPlayers) {
      const d = playerData.get(p.playerId);
      if (!d || d.loading) continue;

      for (const m of d.matches) {
        const key = matchKey(m);
        if (seen.has(key)) continue;
        seen.add(key);

        const t1HasWatched = m.team1Ids?.some(id => id !== null && watchedIdSet.has(id)) ?? false;
        const t2HasWatched = m.team2Ids?.some(id => id !== null && watchedIdSet.has(id)) ?? false;
        const isInternal = t1HasWatched && t2HasWatched;

        let highlightPid = p.playerId;
        let highlightName = d.playerName;

        if (playerFilter !== null) {
          const filterData = playerData.get(playerFilter);
          if (filterData) {
            highlightPid = playerFilter;
            highlightName = filterData.playerName;
          }
        }

        result.push({
          match: m,
          sortKey: parseSortableTime(m.time),
          nowPlaying: isNowPlayingMatch(m),
          highlightPlayerId: highlightPid,
          highlightPlayerName: highlightName,
          isInternal,
        });
      }
    }

    // Now Playing first, then most recent date/time first
    result.sort((a, b) => {
      if (a.nowPlaying !== b.nowPlaying) return a.nowPlaying ? -1 : 1;
      return b.sortKey - a.sortKey;
    });

    return result;
  }, [watchedPlayers, playerData, watchedIds, playerFilter]);

  const today = useMemo(() => todayDateStr(), []);

  // Apply player + today filters
  const filteredMatches = useMemo(() => {
    let list = matchList;
    if (playerFilter !== null) {
      list = list.filter(({ match }) => {
        const inT1 = match.team1Ids?.some(id => id === playerFilter) ?? false;
        const inT2 = match.team2Ids?.some(id => id === playerFilter) ?? false;
        return inT1 || inT2;
      });
    }
    if (todayOnly && showTodayPill) {
      list = list.filter(({ match }) => matchDateStr(match.time) === today);
    }
    return list;
  }, [matchList, playerFilter, todayOnly, showTodayPill, today]);

  const anyDataLoading = [...playerData.values()].some(d => d.loading);

  return (
    <div className="space-y-5">
      {/* Watchlist tab switcher */}
      <WatchlistTabSwitcher
        lists={lists}
        activeIndex={activeIndex}
        onSwitch={switchList}
        onRename={renameList}
      />

      {/* Overall W/L Summary — collapsible */}
      {watchedPlayers.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setSummaryOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Win / Loss Summary
              </span>
              {!summary.anyLoading && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  ({summary.totalWins}W - {summary.totalLosses}L)
                </span>
              )}
            </div>
            {summaryOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {summaryOpen && (
            <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {/* Overall totals row first */}
                {summary.perPlayer.length > 1 && (
                  <div className="flex items-center gap-3 py-2.5 px-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-[10px] shrink-0">
                      All
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Overall</p>
                    </div>
                    {summary.anyLoading ? (
                      <span className="text-[10px] text-slate-400 animate-pulse">Loading...</span>
                    ) : (
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {summary.totalWins}-{summary.totalLosses}
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                            style={{ width: `${summary.totalMatches > 0 ? Math.round((summary.totalWins / summary.totalMatches) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 w-8 text-right">
                          {summary.totalMatches > 0 ? Math.round((summary.totalWins / summary.totalMatches) * 100) : 0}%
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Per-player rows */}
                {summary.perPlayer.map(p => {
                  const winPct = p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0;
                  const isActive = playerFilter === p.playerId;
                  return (
                    <button
                      key={p.playerId}
                      type="button"
                      onClick={() => setPlayerFilter(isActive ? null : p.playerId)}
                      className={`w-full flex items-center gap-3 py-2.5 px-2 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-violet-50 dark:bg-violet-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                        {p.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-violet-700 dark:text-violet-300' : 'text-slate-800 dark:text-slate-100'}`}>
                          {p.name}
                        </p>
                      </div>
                      {p.loading ? (
                        <span className="text-[10px] text-slate-400 animate-pulse">Loading...</span>
                      ) : (
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {p.wins}-{p.losses}
                          </span>
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                              style={{ width: `${winPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 w-8 text-right">{winPct}%</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Player Picker Section — collapsible */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Manage Players
            </span>
            <span className={`text-xs ${atCapacity ? 'text-amber-500 dark:text-amber-400 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
              ({watchedPlayers.length}{Number.isFinite(maxPlayers) ? `/${maxPlayers}` : ''}{atCapacity ? ' full' : ' watched'})
            </span>
          </div>
          {pickerOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {pickerOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800">
            {/* Search input with H2H-style dropdown */}
            <div ref={dropdownRef} className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 z-10" />
              <input
                type="text"
                placeholder={playersLoading ? 'Loading players...' : atCapacity ? `Watchlist full (${maxPlayers} max)` : 'Search players to add...'}
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setDropdownOpen(true); }}
                onFocus={() => { if (!atCapacity) setDropdownOpen(true); }}
                disabled={playersLoading || atCapacity}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:focus:ring-violet-600 bg-white dark:bg-slate-900 disabled:opacity-50"
              />

              {/* Dropdown list — shows all players on focus */}
              {dropdownOpen && !playersLoading && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-80 overflow-y-auto overscroll-contain">
                  {/* Club filter inside dropdown */}
                  {clubs.length > 1 && (
                    <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-3 py-2">
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 shrink-0">Club:</span>
                        <button
                          type="button"
                          onClick={() => setClubFilter('')}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                            !clubFilter
                              ? 'bg-violet-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          All
                        </button>
                        {clubs.map(c => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => setClubFilter(clubFilter === c.name ? '' : c.name)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                              clubFilter === c.name
                                ? 'bg-violet-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {c.name} ({c.count})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add all visible button */}
                  {dropdownPlayers.length > 0 && remaining > 0 && (
                    <button
                      type="button"
                      onClick={handleAddAllVisible}
                      className="w-full flex items-center justify-between px-4 py-2 text-left border-b border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <UsersRound className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {dropdownPlayers.length <= remaining
                            ? `Add all ${dropdownPlayers.length} player${dropdownPlayers.length !== 1 ? 's' : ''}`
                            : `Add ${remaining} more player${remaining !== 1 ? 's' : ''}`}
                          {clubFilter && ` from ${clubFilter}`}
                        </span>
                      </div>
                    </button>
                  )}

                  {dropdownPlayers.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-sm">
                      {tournamentPlayers.length > 0 ? 'No more players to add' : 'No players found'}
                    </div>
                  ) : (
                    dropdownPlayers.map(p => (
                      <button
                        key={p.playerId}
                        type="button"
                        onClick={() => { addPlayer(p); }}
                        disabled={atCapacity}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 ${
                          atCapacity ? 'opacity-50 cursor-not-allowed' : 'hover:bg-violet-50 dark:hover:bg-violet-900/20'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{p.club || '\u2014'}</p>
                        </div>
                        <span className={`shrink-0 text-xs font-medium ${atCapacity ? 'text-slate-400 dark:text-slate-500' : 'text-violet-600 dark:text-violet-400'}`}>
                          {atCapacity ? 'Full' : '+ Add'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {playersError && (
              <p className="text-xs text-red-500">{playersError}</p>
            )}

            {/* Current watchlist chips */}
            {watchedPlayers.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Watching</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-red-500 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {watchedPlayers.map(p => (
                    <span
                      key={p.playerId}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs font-medium"
                    >
                      {p.name}
                      <button
                        type="button"
                        onClick={() => removePlayer(p.playerId)}
                        className="hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty state */}
      {watchedPlayers.length === 0 && (
        <TabEmpty icon={Eye} message="Add players to your watchlist to see their match results." />
      )}

      {/* Filters */}
      {watchedPlayers.length > 0 && !anyDataLoading && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            {watchedPlayers.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0">Player:</span>
                <button
                  onClick={() => setPlayerFilter(null)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    playerFilter === null
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All
                </button>
                {watchedPlayers.map(p => (
                  <button
                    key={p.playerId}
                    onClick={() => setPlayerFilter(playerFilter === p.playerId ? null : p.playerId)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      playerFilter === p.playerId
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {showTodayPill && (
              <button
                onClick={() => setTodayOnly(v => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  todayOnly
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <CalendarDays className="w-3 h-3" />
                Today
              </button>
            )}
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
            {playerFilter !== null && ` for ${playerData.get(playerFilter)?.playerName ?? 'player'}`}
            {todayOnly && showTodayPill && ' (today)'}
          </p>
        </div>
      )}

      {/* Loading state */}
      {watchedPlayers.length > 0 && anyDataLoading && (
        <TabLoading label="match data" />
      )}

      {/* Match list */}
      {watchedPlayers.length > 0 && !anyDataLoading && (
        filteredMatches.length === 0 ? (
          <TabEmpty icon={Eye} message={
            playerFilter !== null
              ? 'No matches for this player.'
              : 'No matches found for watched players.'
          } />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredMatches.map(({ match, highlightPlayerId, highlightPlayerName, isInternal }, i) => (
              <MatchCard
                key={i}
                match={match}
                tswId={tswId}
                fromPath={pathname}
                highlightPlayerId={highlightPlayerId}
                highlightPlayerName={highlightPlayerName}
                internalMatch={isInternal}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
