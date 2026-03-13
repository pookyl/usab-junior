import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, Loader2,
  Medal,
} from 'lucide-react';
import { fetchTournamentMedals } from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';
import type {
  TournamentMedals,
  ClubMedalSummary,
  DrawMedals,
  MedalPlayer,
} from '../types/junior';

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
      <Link
        to={`/directory/${usabId}`}
        className="text-violet-600 dark:text-violet-400 hover:underline"
      >
        {player.name}
      </Link>
    );
  }
  return <span>{player.name}</span>;
}

function MedalIcon({ type, size = 16 }: { type: 'gold' | 'silver' | 'bronze'; size?: number }) {
  const colors = {
    gold: 'text-yellow-500',
    silver: 'text-slate-400',
    bronze: 'text-amber-700 dark:text-amber-600',
  };
  return <Medal className={`${colors[type]} shrink-0`} style={{ width: size, height: size }} />;
}

type ExpandMode = 'medals' | 'gold' | 'silver' | 'bronze' | null;
type DetailSortKey = 'event' | 'place' | 'player';
const PLACE_ORDER: Record<string, number> = { gold: 1, silver: 2, bronze: 3 };

function ClubMedalRow({
  club,
  rank,
  medals,
  nameMap,
  playerIdSet,
}: {
  club: ClubMedalSummary;
  rank: number;
  medals: DrawMedals[];
  nameMap: Map<string, string[]>;
  playerIdSet: Set<string>;
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
      drawName: string;
      ageGroup: string;
      eventType: string;
      place: 'gold' | 'silver' | 'bronze';
      players: MedalPlayer[];
    }> = [];

    for (const m of medals) {
      for (const p of m.gold) {
        if (p.club === club.club) {
          results.push({ drawName: m.drawName, ageGroup: m.ageGroup, eventType: m.eventType, place: 'gold', players: m.gold });
        }
      }
      for (const p of m.silver) {
        if (p.club === club.club) {
          results.push({ drawName: m.drawName, ageGroup: m.ageGroup, eventType: m.eventType, place: 'silver', players: m.silver });
        }
      }
      for (const team of [...m.bronze, ...(m.fourth ?? [])]) {
        for (const p of team) {
          if (p.club === club.club) {
            results.push({ drawName: m.drawName, ageGroup: m.ageGroup, eventType: m.eventType, place: 'bronze', players: team });
          }
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
    if (expandMode === 'gold' || expandMode === 'silver' || expandMode === 'bronze') {
      list = clubMedals.filter(cm => cm.place === expandMode);
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (detailSort === 'event') {
        cmp = a.drawName.localeCompare(b.drawName);
      } else if (detailSort === 'place') {
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
        <td
          className={`px-3 py-2.5 ${cellClickCls}`}
          onClick={() => toggle('medals')}
        >
          <span className={`font-semibold text-sm text-slate-800 dark:text-slate-100 ${activeRing('medals')}`}>{club.club}</span>
        </td>
        <td
          className={`px-3 py-2.5 text-center ${cellClickCls}`}
          onClick={() => club.gold > 0 && toggle('gold')}
        >
          <span className={`inline-flex items-center gap-1 text-sm font-bold text-yellow-600 dark:text-yellow-400 px-1 ${club.gold > 0 ? 'hover:underline' : ''} ${activeRing('gold')}`}>
            {club.gold}
          </span>
        </td>
        <td
          className={`px-3 py-2.5 text-center ${cellClickCls}`}
          onClick={() => club.silver > 0 && toggle('silver')}
        >
          <span className={`inline-flex items-center gap-1 text-sm font-bold text-slate-500 dark:text-slate-400 px-1 ${club.silver > 0 ? 'hover:underline' : ''} ${activeRing('silver')}`}>
            {club.silver}
          </span>
        </td>
        <td
          className={`px-3 py-2.5 text-center ${cellClickCls}`}
          onClick={() => club.bronze > 0 && toggle('bronze')}
        >
          <span className={`inline-flex items-center gap-1 text-sm font-bold text-amber-700 dark:text-amber-500 px-1 ${club.bronze > 0 ? 'hover:underline' : ''} ${activeRing('bronze')}`}>
            {club.bronze}
          </span>
        </td>
        <td
          className={`px-3 py-2.5 text-center ${cellClickCls}`}
          onClick={() => club.total > 0 && toggle('medals')}
        >
          <span className={`font-extrabold text-sm text-slate-800 dark:text-slate-100 px-1 ${club.total > 0 ? 'hover:underline' : ''} ${activeRing('medals')}`}>
            {club.total}
          </span>
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
                      <th
                        key={key}
                        className="text-left py-1 pr-3 font-medium cursor-pointer select-none hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                        onClick={() => handleDetailSort(key)}
                      >
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
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${color.bg} ${color.text}`}>
                            {cm.drawName}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-1">
                            <MedalIcon type={cm.place} size={14} />
                            <span className="text-xs capitalize text-slate-600 dark:text-slate-300">{cm.place}</span>
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

export default function TournamentDetail() {
  const { tswId } = useParams<{ tswId: string }>();
  const [data, setData] = useState<TournamentMedals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortAsc, setSortAsc] = useState(false);
  const { playerNameMap, playerIdSet } = usePlayers();

  useEffect(() => {
    if (!tswId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTournamentMedals(tswId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tswId]);

  const sortedClubs = useMemo(() => {
    if (!data) return [];
    const clubs = [...data.clubs];
    clubs.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'club') {
        cmp = a.club.localeCompare(b.club);
      } else {
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

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading medal results…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-4">
        <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Tournaments
        </Link>
        <div className="text-center text-red-500 dark:text-red-400 py-8">
          <p className="font-medium">Failed to load medals</p>
          <p className="text-sm mt-1">{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const tswUrl = `https://www.tournamentsoftware.com/tournament/${tswId}`;
  const medalClubs = sortedClubs.filter(c => c.total > 0);
  const headerCls = 'px-3 py-2 text-xs uppercase tracking-wider font-medium cursor-pointer select-none hover:text-violet-600 dark:hover:text-violet-400 transition-colors';
  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        Back to Tournaments
      </Link>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mb-4">
          {data.tournamentName || 'Tournament'}
        </h1>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Medal className="w-4 h-4 text-yellow-500" />
            <span className="font-medium">
              {medalClubs.length} clubs with medals &middot; {data.medals.length} events
            </span>
          </div>
          <a
            href={tswUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View on TournamentSoftware
          </a>
        </div>
      </div>

      {data.clubs.length === 0 ? (
        <div className="text-center text-slate-400 dark:text-slate-500 py-8">
          <Medal className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No medal data available for this tournament.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Click a medal count to filter by type &middot; Click Players to see full roster
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                  <th className="px-3 py-2 w-10 text-xs">#</th>
                  <th className={`${headerCls} text-left`} onClick={() => handleSort('club')}>
                    Club{sortArrow('club')}
                  </th>
                  <th className={`${headerCls} text-center`} onClick={() => handleSort('gold')}>
                    <span className="inline-flex items-center gap-1"><MedalIcon type="gold" size={14} />Gold{sortArrow('gold')}</span>
                  </th>
                  <th className={`${headerCls} text-center`} onClick={() => handleSort('silver')}>
                    <span className="inline-flex items-center gap-1"><MedalIcon type="silver" size={14} />Silver{sortArrow('silver')}</span>
                  </th>
                  <th className={`${headerCls} text-center`} onClick={() => handleSort('bronze')}>
                    <span className="inline-flex items-center gap-1"><MedalIcon type="bronze" size={14} />Bronze{sortArrow('bronze')}</span>
                  </th>
                  <th className={`${headerCls} text-center`} onClick={() => handleSort('total')}>
                    Total{sortArrow('total')}
                  </th>
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
      )}
    </div>
  );
}
