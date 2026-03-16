import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, Loader2, Medal,
  Calendar, MapPin, List, Swords, Users, Search,
  ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-react';
import {
  fetchTournaments,
  fetchTournamentDetail,
  fetchTournamentMedals,
  fetchTournamentPlayers,
  fetchTournamentPlayerDetail,
  fetchTournamentMatchDates,
  fetchTournamentMatchDay,
} from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';
import type {
  TournamentMedals,
  TournamentPlayersResponse,
  TournamentPlayerDetailResponse,
  ClubMedalSummary,
  DrawMedals,
  MedalPlayer,
  MatchDateTab,
  TournamentMatch,
} from '../types/junior';

// ── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'matches', label: 'Matches', icon: Swords },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'draws', label: 'Draws', icon: List },
  { id: 'medals', label: 'Medals', icon: Medal },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ── Shared helpers ──────────────────────────────────────────────────────────

function TabLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 text-slate-400 dark:text-slate-500 py-16">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span>Loading {label}…</span>
    </div>
  );
}

function TabError({ error }: { error: string }) {
  return (
    <div className="text-center text-red-500 dark:text-red-400 py-12">
      <p className="font-medium">Failed to load data</p>
      <p className="text-sm mt-1">{error}</p>
    </div>
  );
}

function TabEmpty({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="text-center text-slate-400 dark:text-slate-500 py-16">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function useTabData<T>(tswId: string | undefined, active: boolean, fetcher: (id: string) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!tswId || !active || fetched) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher(tswId)
      .then(d => { if (!cancelled) { setData(d); setFetched(true); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tswId, active, fetched, fetcher]);

  return { data, loading, error };
}

// ── Medal helpers (preserved from original) ─────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  BS: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  GS: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
  BD: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  GD: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
  XD: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
};

function getEventColor(name: string) {
  const upper = name.toUpperCase();
  if (upper.startsWith('XD') || upper.includes('MIXED')) return EVENT_TYPE_COLORS.XD;
  if (upper.startsWith('GD') || upper.startsWith('GS')) return EVENT_TYPE_COLORS.GS;
  if (upper.startsWith('BD') || upper.startsWith('BS')) return EVENT_TYPE_COLORS.BS;
  return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' };
}

type SortKey = 'gold' | 'silver' | 'bronze' | 'total' | 'club';

function PlayerName({ player, nameMap, playerIdSet }: { player: MedalPlayer; nameMap: Map<string, string[]>; playerIdSet: Set<string> }) {
  const idMatch = player.usabId && playerIdSet.has(player.usabId) ? player.usabId : null;
  const usabId = idMatch ?? nameMap.get(player.name.toLowerCase())?.[0] ?? null;
  if (usabId) {
    return (
      <Link to={`/directory/${usabId}`} className="text-violet-600 dark:text-violet-400 hover:underline">
        {player.name}
      </Link>
    );
  }
  return <span>{player.name}</span>;
}

function MedalIcon({ type, size = 16 }: { type: 'gold' | 'silver' | 'bronze' | 'fourth'; size?: number }) {
  const colors = {
    gold: 'text-yellow-500',
    silver: 'text-slate-400',
    bronze: 'text-amber-700 dark:text-amber-600',
    fourth: 'text-amber-700 dark:text-amber-600',
  };
  return <Medal className={`${colors[type]} shrink-0`} style={{ width: size, height: size }} />;
}

const PLACE_LABEL: Record<string, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze', fourth: '4th' };

type ExpandMode = 'medals' | 'gold' | 'silver' | 'bronze' | null;
type DetailSortKey = 'event' | 'place' | 'player';
const PLACE_ORDER: Record<string, number> = { gold: 1, silver: 2, bronze: 3, fourth: 4 };

function ClubMedalRow({
  club, rank, medals, nameMap, playerIdSet,
}: {
  club: ClubMedalSummary; rank: number; medals: DrawMedals[];
  nameMap: Map<string, string[]>; playerIdSet: Set<string>;
}) {
  const [expandMode, setExpandMode] = useState<ExpandMode>(null);
  const [detailSort, setDetailSort] = useState<DetailSortKey>('event');
  const [detailAsc, setDetailAsc] = useState(true);

  function toggle(mode: Exclude<ExpandMode, null>) {
    setExpandMode(prev => prev === mode ? null : mode);
  }
  function handleDetailSort(key: DetailSortKey) {
    if (detailSort === key) setDetailAsc(!detailAsc);
    else { setDetailSort(key); setDetailAsc(true); }
  }

  const clubMedals = useMemo(() => {
    const results: Array<{
      drawName: string; ageGroup: string; eventType: string;
      place: 'gold' | 'silver' | 'bronze' | 'fourth'; players: MedalPlayer[];
    }> = [];
    for (const m of medals) {
      for (const p of m.gold) {
        if (p.club === club.club) results.push({ drawName: m.drawName, ageGroup: m.ageGroup, eventType: m.eventType, place: 'gold', players: m.gold });
      }
      for (const p of m.silver) {
        if (p.club === club.club) results.push({ drawName: m.drawName, ageGroup: m.ageGroup, eventType: m.eventType, place: 'silver', players: m.silver });
      }
      for (const team of m.bronze) {
        for (const p of team) {
          if (p.club === club.club) results.push({ drawName: m.drawName, ageGroup: m.ageGroup, eventType: m.eventType, place: 'bronze', players: team });
        }
      }
      for (const team of (m.fourth ?? [])) {
        for (const p of team) {
          if (p.club === club.club) results.push({ drawName: m.drawName, ageGroup: m.ageGroup, eventType: m.eventType, place: 'fourth', players: team });
        }
      }
    }
    const seen = new Set<string>();
    return results.filter(r => {
      const key = `${r.drawName}:${r.place}:${r.players.map(p => p.name).join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [medals, club.club]);

  const filteredMedals = useMemo(() => {
    let list = clubMedals;
    if (expandMode === 'gold' || expandMode === 'silver') {
      list = clubMedals.filter(cm => cm.place === expandMode);
    } else if (expandMode === 'bronze') {
      list = clubMedals.filter(cm => cm.place === 'bronze' || cm.place === 'fourth');
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (detailSort === 'event') cmp = a.drawName.localeCompare(b.drawName);
      else if (detailSort === 'place') {
        cmp = (PLACE_ORDER[a.place] ?? 9) - (PLACE_ORDER[b.place] ?? 9);
        if (cmp === 0) cmp = a.drawName.localeCompare(b.drawName);
      } else {
        const aName = a.players.filter(p => p.club === club.club).map(p => p.name).join(', ');
        const bName = b.players.filter(p => p.club === club.club).map(p => p.name).join(', ');
        cmp = aName.localeCompare(bName);
      }
      return detailAsc ? cmp : -cmp;
    });
    return sorted;
  }, [clubMedals, expandMode, detailSort, detailAsc, club.club]);

  const cellClickCls = 'cursor-pointer select-none';
  const activeRing = (mode: Exclude<ExpandMode, null>) =>
    expandMode === mode ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1 dark:ring-offset-slate-900 rounded' : '';

  return (
    <>
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
        <td className="px-3 py-2.5 text-sm text-slate-400 dark:text-slate-500 w-10 text-center">{rank}</td>
        <td className={`px-3 py-2.5 ${cellClickCls}`} onClick={() => toggle('medals')}>
          <span className={`font-semibold text-sm text-slate-800 dark:text-slate-100 ${activeRing('medals')}`}>{club.club}</span>
        </td>
        <td className={`px-3 py-2.5 text-center ${cellClickCls}`} onClick={() => club.gold > 0 && toggle('gold')}>
          <span className={`inline-flex items-center gap-1 text-sm font-bold text-yellow-600 dark:text-yellow-400 px-1 ${club.gold > 0 ? 'hover:underline' : ''} ${activeRing('gold')}`}>{club.gold}</span>
        </td>
        <td className={`px-3 py-2.5 text-center ${cellClickCls}`} onClick={() => club.silver > 0 && toggle('silver')}>
          <span className={`inline-flex items-center gap-1 text-sm font-bold text-slate-500 dark:text-slate-400 px-1 ${club.silver > 0 ? 'hover:underline' : ''} ${activeRing('silver')}`}>{club.silver}</span>
        </td>
        <td className={`px-3 py-2.5 text-center ${cellClickCls}`} onClick={() => club.bronze > 0 && toggle('bronze')}>
          <span className={`inline-flex items-center gap-1 text-sm font-bold text-amber-700 dark:text-amber-500 px-1 ${club.bronze > 0 ? 'hover:underline' : ''} ${activeRing('bronze')}`}>{club.bronze}</span>
        </td>
        <td className={`px-3 py-2.5 text-center ${cellClickCls}`} onClick={() => club.total > 0 && toggle('medals')}>
          <span className={`font-extrabold text-sm text-slate-800 dark:text-slate-100 px-1 ${club.total > 0 ? 'hover:underline' : ''} ${activeRing('medals')}`}>{club.total}</span>
        </td>
      </tr>
      {expandMode !== null && filteredMedals.length > 0 && (
        <tr>
          <td colSpan={6} className="px-0 py-0">
            <div className="bg-slate-50 dark:bg-slate-800/40 px-6 py-3 border-y border-slate-100 dark:border-slate-700/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {([['event', 'Event'], ['place', 'Place'], ['player', 'Player(s)']] as const).map(([key, label]) => (
                      <th key={key} className="text-left py-1 pr-3 font-medium cursor-pointer select-none hover:text-violet-600 dark:hover:text-violet-400 transition-colors" onClick={() => handleDetailSort(key)}>
                        {label}{detailSort === key ? (detailAsc ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMedals.map((cm, i) => {
                    const color = getEventColor(cm.drawName);
                    return (
                      <tr key={i} className="border-t border-slate-200/50 dark:border-slate-700/30">
                        <td className="py-1.5 pr-3">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${color.bg} ${color.text}`}>{cm.drawName}</span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-1">
                            <MedalIcon type={cm.place} size={14} />
                            <span className="text-xs text-slate-600 dark:text-slate-300">{PLACE_LABEL[cm.place] ?? cm.place}</span>
                          </div>
                        </td>
                        <td className="py-1.5 text-slate-700 dark:text-slate-200">
                          {(() => {
                            const clubOnly = cm.players.filter(p => p.club === club.club);
                            const show = clubOnly.length === cm.players.length ? cm.players : clubOnly;
                            return show.map((p, j) => (
                              <span key={j}>
                                {j > 0 && <span className="text-slate-400 dark:text-slate-500"> / </span>}
                                <PlayerName player={p} nameMap={nameMap} playerIdSet={playerIdSet} />
                              </span>
                            ));
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Draws Tab ───────────────────────────────────────────────────────────────

function DrawsTab({ tswId, active }: { tswId: string; active: boolean }) {
  const fetcher = useCallback((id: string) => fetchTournamentDetail(id), []);
  const { data, loading, error } = useTabData(tswId, active, fetcher);
  const [expandedDraw, setExpandedDraw] = useState<number | null>(null);

  if (loading) return <TabLoading label="draws" />;
  if (error) return <TabError error={error} />;
  if (!data || data.draws.length === 0) return <TabEmpty icon={List} message="No draws available for this tournament." />;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.draws.map(draw => {
          const color = getEventColor(draw.name);
          const expanded = expandedDraw === draw.drawId;
          const tswDrawUrl = `https://www.tournamentsoftware.com/sport/draw.aspx?id=${tswId}&draw=${draw.drawId}`;
          return (
            <div key={draw.drawId}>
              <button
                onClick={() => setExpandedDraw(expanded ? null : draw.drawId)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color.bg} ${color.text}`}>
                  {draw.name}
                </span>
              </button>
              {expanded && (
                <div className="px-5 pb-4 pl-12">
                  <a
                    href={tswDrawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View bracket on TournamentSoftware
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Medals Tab ──────────────────────────────────────────────────────────────

type PlayerSortKey = 'name' | 'club';

function PlayersTab({ tswId, active }: { tswId: string; active: boolean }) {
  const fetcher = useCallback((id: string) => fetchTournamentPlayers(id), []);
  const { data, loading, error } = useTabData<TournamentPlayersResponse>(tswId, active, fetcher);
  const [search, setSearch] = useState('');
  const [clubFilter, setClubFilter] = useState('');
  const [playerSortKey, setPlayerSortKey] = useState<PlayerSortKey>('name');
  const [playerSortAsc, setPlayerSortAsc] = useState(true);

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
    const sorted = [...list].sort((a, b) => {
      const cmp = playerSortKey === 'name'
        ? a.name.localeCompare(b.name)
        : (a.club || 'N/A').localeCompare(b.club || 'N/A') || a.name.localeCompare(b.name);
      return playerSortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [data, search, clubFilter, playerSortKey, playerSortAsc]);

  function handlePlayerSort(key: PlayerSortKey) {
    if (playerSortKey === key) setPlayerSortAsc(!playerSortAsc);
    else { setPlayerSortKey(key); setPlayerSortAsc(true); }
  }

  if (loading) return <TabLoading label="players" />;
  if (error) return <TabError error={error} />;
  if (!data || data.players.length === 0) return <TabEmpty icon={Users} message="No player data available for this tournament." />;

  const phCls = 'px-3 py-2 text-xs uppercase tracking-wider font-medium cursor-pointer select-none hover:text-violet-600 dark:hover:text-violet-400 transition-colors';
  const pSortArrow = (key: PlayerSortKey) => playerSortKey === key ? (playerSortAsc ? ' ↑' : ' ↓') : '';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search players or clubs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:focus:ring-violet-500"
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
            {filtered.length} of {data.players.length} players
            {clubs.length > 0 && <> &middot; {clubs.length} clubs</>}
          </p>
        </div>

        {clubs.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0">Club:</span>
            <button
              onClick={() => setClubFilter('')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
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
                onClick={() => setClubFilter(c.name === clubFilter ? '' : c.name)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  c.name === clubFilter
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {c.name} ({c.count})
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
              <th className="px-3 py-2 w-10 text-xs">#</th>
              <th className={`${phCls} text-left`} onClick={() => handlePlayerSort('name')}>
                Player{pSortArrow('name')}
              </th>
              <th className={`${phCls} text-left`} onClick={() => handlePlayerSort('club')}>
                Club{pSortArrow('club')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {filtered.map((player, idx) => (
              <tr key={player.playerId} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                <td className="px-3 py-2.5 text-sm text-slate-400 dark:text-slate-500 w-10 text-center">{idx + 1}</td>
                <td className="px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                  <Link
                    to={`/tournaments/${tswId}/player/${player.playerId}`}
                    className="text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    {player.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                  {player.club || <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function MedalsTab({ tswId, active }: { tswId: string; active: boolean }) {
  const fetcher = useCallback((id: string) => fetchTournamentMedals(id), []);
  const { data, loading, error } = useTabData<TournamentMedals>(tswId, active, fetcher);
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortAsc, setSortAsc] = useState(false);
  const { playerNameMap, playerIdSet } = usePlayers();

  const sortedClubs = useMemo(() => {
    if (!data) return [];
    const clubs = [...data.clubs];
    clubs.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'club') cmp = a.club.localeCompare(b.club);
      else {
        cmp = (b[sortKey] as number) - (a[sortKey] as number);
        if (cmp === 0) cmp = b.total - a.total;
        if (cmp === 0) cmp = b.gold - a.gold;
      }
      return sortAsc ? -cmp : cmp;
    });
    return clubs;
  }, [data, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  if (loading) return <TabLoading label="medals" />;
  if (error) return <TabError error={error} />;
  if (!data) return <TabEmpty icon={Medal} message="No medal data available for this tournament." />;

  const medalClubs = sortedClubs.filter(c => c.total > 0);
  const headerCls = 'px-3 py-2 text-xs uppercase tracking-wider font-medium cursor-pointer select-none hover:text-violet-600 dark:hover:text-violet-400 transition-colors';
  const sortArrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  if (medalClubs.length === 0) {
    return <TabEmpty icon={Medal} message="No medal data available for this tournament." />;
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {medalClubs.length} clubs with medals &middot; {data.medals.length} events &middot; Click a medal count to filter by type
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
              <th className="px-3 py-2 w-10 text-xs">#</th>
              <th className={`${headerCls} text-left`} onClick={() => handleSort('club')}>Club{sortArrow('club')}</th>
              <th className={`${headerCls} text-center`} onClick={() => handleSort('gold')}>
                <span className="inline-flex items-center gap-1"><MedalIcon type="gold" size={14} />Gold{sortArrow('gold')}</span>
              </th>
              <th className={`${headerCls} text-center`} onClick={() => handleSort('silver')}>
                <span className="inline-flex items-center gap-1"><MedalIcon type="silver" size={14} />Silver{sortArrow('silver')}</span>
              </th>
              <th className={`${headerCls} text-center`} onClick={() => handleSort('bronze')}>
                <span className="inline-flex items-center gap-1"><MedalIcon type="bronze" size={14} />Bronze{sortArrow('bronze')}</span>
              </th>
              <th className={`${headerCls} text-center`} onClick={() => handleSort('total')}>Total{sortArrow('total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {medalClubs.map((club, idx) => (
              <ClubMedalRow
                key={club.club}
                club={club}
                rank={idx + 1}
                medals={data.medals}
                nameMap={playerNameMap}
                playerIdSet={playerIdSet}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Matches Tab ─────────────────────────────────────────────────────────────

function TeamRow({ names, won, ongoing, scores, otherScores, showRetired, showWalkover }: {
  names: string[];
  won: boolean;
  ongoing?: boolean;
  scores: number[];
  otherScores: number[];
  showRetired?: boolean;
  showWalkover?: boolean;
}) {
  const nameClass = won
    ? 'font-semibold text-slate-800 dark:text-slate-100'
    : 'text-slate-800 dark:text-slate-100';
  const badgeClass = won
    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500';

  return (
    <div className="flex items-start gap-2 py-1.5">
      {ongoing ? (
        <span className="w-5 shrink-0" />
      ) : (
        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 ${badgeClass}`}>
          {won ? 'W' : 'L'}
        </span>
      )}
      <div className={`text-sm min-w-0 flex-1 ${nameClass}`}>
        {names.map((n, i) => (
          <div key={i} className="truncate">{n}</div>
        ))}
      </div>
      <div className="flex items-center gap-1 shrink-0 font-mono text-sm pt-0.5">
        {showWalkover && (
          <span className="text-amber-500 dark:text-amber-400 text-xs font-semibold">Walkover</span>
        )}
        {showRetired && (
          <span className="text-amber-500 dark:text-amber-400 text-xs font-semibold mr-1">Retired</span>
        )}
        {won && (
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
        )}
        {scores.map((s, i) => {
          const isWinningGame = s > otherScores[i];
          return (
            <span key={i} className={`w-5 text-right text-slate-800 dark:text-slate-100 ${isWinningGame ? 'font-bold' : ''}`}>{s}</span>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({ match, date }: { match: TournamentMatch; date?: string }) {
  const t1Scores = match.scores.map(g => g[0]);
  const t2Scores = match.scores.map(g => g[1]);
  const ongoing = !match.team1Won && !match.team2Won && !match.walkover && !match.bye;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {match.header || [match.round, match.event].filter(Boolean).join(' \u00b7 ')}
        </p>
      </div>

      {/* Team rows */}
      <div className="px-4 divide-y divide-slate-100 dark:divide-slate-800">
        <TeamRow
          names={match.team1}
          won={match.team1Won}
          ongoing={ongoing}
          scores={t1Scores}
          otherScores={t2Scores}
          showWalkover={match.walkover && !match.team1Won}
          showRetired={match.retired && !match.team1Won}
        />
        {match.bye ? (
          <div className="flex items-center gap-2 py-1.5">
            <span className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
              L
            </span>
            <span className="text-sm text-slate-800 dark:text-slate-100">Bye</span>
          </div>
        ) : (
          <TeamRow
            names={match.team2}
            won={match.team2Won}
            ongoing={ongoing}
            scores={t2Scores}
            otherScores={t1Scores}
            showWalkover={match.walkover && !match.team2Won}
            showRetired={match.retired && !match.team2Won}
          />
        )}
      </div>

      {/* Footer: date + time + location */}
      <div className="px-4 py-2 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
        {(date || match.time) && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {[date, match.time].filter(Boolean).join(' ')}
          </span>
        )}
        {match.location && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {match.location}
          </span>
        )}
        {match.duration && (
          <span className="ml-auto">{match.duration}</span>
        )}
      </div>
    </div>
  );
}

function todayYYYYMMDD(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function MatchesTab({ tswId, active }: { tswId: string; active: boolean }) {
  const [dates, setDates] = useState<MatchDateTab[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);
  const [datesFetched, setDatesFetched] = useState(false);

  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [matchDate, setMatchDate] = useState('');
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');

  const [eventFilter, setEventFilter] = useState('');

  const isToday = selectedDate === todayYYYYMMDD();

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
  }, [tswId, active, datesFetched]);

  function loadMatches(dateParam: string, refresh = false) {
    setSelectedDate(dateParam);
    setMatches([]);
    setMatchesLoading(true);
    setMatchesError(null);
    setEventFilter('');
    fetchTournamentMatchDay(tswId, dateParam, refresh)
      .then(d => { setMatches(d.matches); setMatchDate(d.date); })
      .catch(e => setMatchesError(e.message))
      .finally(() => setMatchesLoading(false));
  }

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

  if (datesLoading) return <TabLoading label="matches" />;
  if (datesError) return <TabError error={datesError} />;
  if (datesFetched && dates.length === 0) {
    return <TabEmpty icon={Swords} message="No match data available for this tournament." />;
  }

  return (
    <div className="space-y-4">
      {/* Date tabs */}
      {dates.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
          {dates.map(d => (
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

      {/* Refresh button for today's matches */}
      {isToday && selectedDate && !matchesLoading && (
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh live results
        </button>
      )}

      {/* Prompt to select a date */}
      {!selectedDate && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a date above to view matches</p>
        </div>
      )}

      {/* Loading state for matches */}
      {selectedDate && matchesLoading && <TabLoading label="matches" />}
      {selectedDate && matchesError && <TabError error={matchesError} />}

      {/* Match content */}
      {selectedDate && !matchesLoading && !matchesError && (
        <>
          {/* Event filter */}
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

          {/* Match count */}
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
            {eventFilter && ` in ${eventFilter}`}
          </p>

          {/* Match results */}
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
                      <MatchCard key={i} match={m} date={matchDate} />
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

// ── Main Page ───────────────────────────────────────────────────────────────

export default function TournamentDetail() {
  const { tswId } = useParams<{ tswId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const activeTab = (searchParams.get('tab') as TabId) || 'matches';

  const routeState = location.state as { name?: string; hostClub?: string; startDate?: string; endDate?: string } | null;

  const [tournamentName, setTournamentName] = useState(routeState?.name || '');
  const [tournamentMeta, setTournamentMeta] = useState({
    hostClub: routeState?.hostClub || '',
    startDate: routeState?.startDate || '',
    endDate: routeState?.endDate || '',
  });

  useEffect(() => {
    if (tournamentName || !tswId) return;
    let cancelled = false;
    fetchTournaments()
      .then(data => {
        if (cancelled) return;
        const allTournaments = data.tournaments
          ?? Object.values(data.seasons ?? {}).flatMap(s => s.tournaments);
        const match = allTournaments.find(t => t.tswId?.toUpperCase() === tswId.toUpperCase());
        if (match) {
          setTournamentName(match.name);
          setTournamentMeta({ hostClub: match.hostClub, startDate: match.startDate ?? '', endDate: match.endDate ?? '' });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tswId, tournamentName]);

  function setTab(tab: TabId) {
    setSearchParams({ tab }, { replace: true });
  }

  if (!tswId) return null;

  const tswUrl = `https://www.tournamentsoftware.com/tournament/${tswId}`;

  function formatDateRange(start: string, end: string) {
    if (!start) return '';
    const s = new Date(start + 'T00:00:00');
    const e = end ? new Date(end + 'T00:00:00') : s;
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (start === end || !end) return s.toLocaleDateString('en-US', opts);
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        Back to Tournaments
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mb-2">
          {tournamentName || 'Tournament'}
        </h1>
        <div className="flex items-center gap-4 flex-wrap mt-2 text-sm text-slate-500 dark:text-slate-400">
          {tournamentMeta.startDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDateRange(tournamentMeta.startDate, tournamentMeta.endDate)}
            </span>
          )}
          {tournamentMeta.hostClub && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {tournamentMeta.hostClub}
            </span>
          )}
          <a
            href={tswUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            TournamentSoftware
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide">
        <nav className="flex gap-1 min-w-max" aria-label="Tabs">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'draws' && <DrawsTab tswId={tswId} active={activeTab === 'draws'} />}
        {activeTab === 'players' && <PlayersTab tswId={tswId} active={activeTab === 'players'} />}
        {activeTab === 'medals' && <MedalsTab tswId={tswId} active={activeTab === 'medals'} />}
        {activeTab === 'matches' && <MatchesTab tswId={tswId} active={activeTab === 'matches'} />}
      </div>
    </div>
  );
}

// ── Tournament Player Detail Page ───────────────────────────────────────────

export function TournamentPlayerDetail() {
  const { tswId, playerId } = useParams<{ tswId: string; playerId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<TournamentPlayerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState('');

  useEffect(() => {
    if (!tswId || !playerId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTournamentPlayerDetail(tswId, playerId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tswId, playerId]);

  const events = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.matches.map(m => m.event).filter(Boolean));
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!eventFilter) return data.matches;
    return data.matches.filter(m => m.event === eventFilter);
  }, [data, eventFilter]);

  if (!tswId || !playerId) return null;

  const tswPlayerUrl = `https://www.tournamentsoftware.com/tournament/${tswId}/player/${playerId}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <button
        onClick={() => navigate(`/tournaments/${tswId}?tab=players`)}
        className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Players
      </button>

      {/* Header */}
      {loading ? (
        <TabLoading label="player" />
      ) : error ? (
        <TabError error={error} />
      ) : data ? (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
              {data.playerName || 'Player'}
            </h1>
            <div className="flex items-center gap-4 flex-wrap mt-3 text-sm text-slate-500 dark:text-slate-400">
              {data.club && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  {data.club}
                </span>
              )}
              <span className="text-slate-400 dark:text-slate-500">
                {data.matches.length} match{data.matches.length !== 1 ? 'es' : ''}
              </span>
              <a
                href={tswPlayerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View on TournamentSoftware
              </a>
            </div>
          </div>

          {/* Event filter */}
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

          {/* Match count */}
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
            {eventFilter && ` in ${eventFilter}`}
          </p>

          {/* Match cards */}
          {filtered.length === 0 ? (
            <TabEmpty icon={Swords} message={data.matches.length > 0 ? `No matches for "${eventFilter}"` : 'No matches found for this player.'} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((m, i) => (
                <MatchCard key={i} match={m} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
