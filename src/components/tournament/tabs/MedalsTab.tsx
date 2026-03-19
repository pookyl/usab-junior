import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Medal } from 'lucide-react';
import { useTabData, TabLoading, TabError, TabEmpty, getEventColor } from '../shared';
import { fetchTournamentMedals } from '../../../services/rankingsService';
import type { TournamentMedals, ClubMedalSummary, DrawMedals, MedalPlayer } from '../../../types/junior';

type SortKey = 'gold' | 'silver' | 'bronze' | 'total' | 'club';

function PlayerName({ player, tswId }: { player: MedalPlayer; tswId: string }) {
  if (player.playerId) {
    return (
      <Link to={`/tournaments/${tswId}/player/${player.playerId}`} className="text-violet-600 dark:text-violet-400 hover:underline">
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
  club, rank, medals, tswId,
}: {
  club: ClubMedalSummary; rank: number; medals: DrawMedals[];
  tswId: string;
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
                                <PlayerName player={p} tswId={tswId} />
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

export default function MedalsTab({ tswId, active, refreshTrigger }: { tswId: string; active: boolean; refreshTrigger?: number }) {
  const { data, loading, error, retry, refresh } = useTabData<TournamentMedals>(tswId, active, fetchTournamentMedals, 'medals');
  useEffect(() => { if (refreshTrigger) refresh(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortAsc, setSortAsc] = useState(false);

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
  if (error) return <TabError error={error} onRetry={retry} />;
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
              <ClubMedalRow key={club.club} club={club} rank={idx + 1} medals={data.medals} tswId={tswId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
