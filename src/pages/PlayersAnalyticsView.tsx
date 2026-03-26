import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import { Search, X } from 'lucide-react';
import type { AgeGroup, EventType, UniquePlayer } from '../types/junior';
import { EVENT_LABELS } from '../types/junior';
import { inferGender } from '../utils/playerUtils';

const AGE_CHART_COLORS: Record<AgeGroup, string> = {
  U11: '#8b5cf6',
  U13: '#3b82f6',
  U15: '#10b981',
  U17: '#f59e0b',
  U19: '#ef4444',
};

const HISTOGRAM_COLORS = [
  '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3',
  '#312e81', '#2e1065', '#1e1b4b', '#1a1647', '#0f0d2e',
];

interface RankedCategoryPlayer {
  usabId: string;
  name: string;
  rank: number;
  rankingPoints: number;
}

interface ModalData {
  title: string;
  players: UniquePlayer[];
}

function PlayerModal({ data, onClose }: { data: ModalData; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return data.players;
    const q = search.toLowerCase();
    return data.players.filter(
      (p) => p.name.toLowerCase().includes(q) || p.usabId.toLowerCase().includes(q),
    );
  }, [data.players, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white dark:bg-slate-900 md:rounded-2xl rounded-t-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full md:max-w-2xl max-h-[85vh] md:max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">{data.title}</h3>
              <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500">
                {filtered.length === data.players.length
                  ? `${data.players.length} players`
                  : `${filtered.length} of ${data.players.length} players`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player name…"
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:border-violet-300 dark:focus:border-violet-600 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {filtered.length === 0 ? (
            <p className="text-slate-400 dark:text-slate-500 text-sm py-8 text-center">No players match "{search}"</p>
          ) : (
            <>
          <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-800">
            {filtered.map((p) => {
              const bestPts = p.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0);
              const gender = inferGender(p.entries);
              return (
                <Link
                  key={p.usabId}
                  to={`/directory/${p.usabId}`}
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      <span className={gender === 'Boy' ? 'text-blue-500' : gender === 'Girl' ? 'text-pink-500' : ''}>
                        {gender ?? '—'}
                      </span>
                      {' · '}{p.usabId}
                    </p>
                  </div>
                  <span className="font-bold text-emerald-600 text-sm tabular-nums shrink-0">
                    {bestPts.toLocaleString()}
                  </span>
                </Link>
              );
            })}
          </div>

          <table className="hidden md:table w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-slate-400 dark:text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Player</th>
                <th className="px-6 py-3 font-medium">Gender</th>
                <th className="px-6 py-3 font-medium">USAB ID</th>
                <th className="px-6 py-3 font-medium text-right">Best Points</th>
                <th className="px-6 py-3 font-medium text-right">Categories</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map((p) => {
                const bestPts = p.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0);
                const cats = new Set(p.entries.map((e) => `${e.ageGroup}-${e.eventType}`)).size;
                const gender = inferGender(p.entries);
                return (
                  <tr key={p.usabId} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-6 py-3">
                      <Link
                        to={`/directory/${p.usabId}`}
                        onClick={onClose}
                        className="font-medium text-slate-800 dark:text-slate-100 hover:text-violet-600 transition-colors"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        gender === 'Boy' ? 'bg-blue-50 text-blue-600' :
                        gender === 'Girl' ? 'bg-pink-50 text-pink-600' :
                        'text-slate-400 dark:text-slate-500'
                      }`}>
                        {gender ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{p.usabId}</span>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-600 tabular-nums">
                      {bestPts.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400 tabular-nums">{cats}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsView({
  ageGroup,
  eventType,
  players,
  loading,
  categoryRankings,
}: {
  ageGroup: AgeGroup;
  eventType: EventType;
  players: UniquePlayer[];
  loading: boolean;
  categoryRankings: RankedCategoryPlayer[];
}) {
  const [modal, setModal] = useState<ModalData | null>(null);

  const playerSummaries = useMemo(() => {
    return players.map((player) => ({
      player,
      bestPoints: player.entries.reduce((max, entry) => Math.max(max, entry.rankingPoints), 0),
      categoryCount: new Set(player.entries.map((entry) => `${entry.ageGroup}-${entry.eventType}`)).size,
    }));
  }, [players]);

  const top20 = useMemo(() => {
    const raw = categoryRankings.slice(0, 20).map((player) => ({
      name: player.name,
      usabId: player.usabId,
      points: player.rankingPoints,
      rank: player.rank,
    }));

    const nameCounts = new Map<string, number>();
    for (const r of raw) nameCounts.set(r.name, (nameCounts.get(r.name) ?? 0) + 1);

    return raw.map((r) => ({
      ...r,
      shortName:
        nameCounts.get(r.name)! > 1
          ? `${r.name.split(' ')[0]} (${r.usabId.slice(-4)})`
          : r.name.split(' ')[0],
    }));
  }, [categoryRankings]);

  const dropoffData = useMemo(() => {
    return categoryRankings
      .map((player) => ({ points: player.rankingPoints, rank: player.rank }))
      .filter((d) => d.points > 0)
      .slice(0, 50);
  }, [categoryRankings]);

  const { distribution } = useMemo(() => {
    const allPts = playerSummaries
      .map((summary) => summary.bestPoints)
      .filter((pts) => pts > 0);
    if (allPts.length === 0) return { distribution: [], bucketSize: 0 };

    const maxPts = Math.max(...allPts);
    const numBuckets = 10;
    const size = Math.ceil(maxPts / numBuckets);
    if (size === 0) return { distribution: [], bucketSize: 0 };

    const buckets = Array.from({ length: numBuckets }, (_, i) => ({
      range: `${(i * size).toLocaleString()}`,
      count: 0,
      lo: i * size,
      hi: (i + 1) * size,
    }));

    for (const pts of allPts) {
      const idx = Math.min(Math.floor(pts / size), numBuckets - 1);
      buckets[idx].count++;
    }

    return { distribution: buckets, bucketSize: size };
  }, [playerSummaries]);

  const multiEventData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const summary of playerSummaries) {
      counts[summary.categoryCount] = (counts[summary.categoryCount] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([n, count]) => ({
        label: Number(n) === 1 ? '1 cat' : `${n} cats`,
        count,
        n: Number(n),
      }))
      .sort((a, b) => a.n - b.n);
  }, [playerSummaries]);

  const categoryPlayerCount = categoryRankings.length;

  const handleDistributionClick = useCallback(
    (data: { lo: number; hi: number }) => {
      const { lo, hi } = data;
      const matched = playerSummaries
        .filter((summary) => summary.bestPoints >= lo && summary.bestPoints < hi)
        .map((summary) => ({ player: summary.player, bestPoints: summary.bestPoints }));
      matched.sort((a, b) => {
        return b.bestPoints - a.bestPoints;
      });
      setModal({
        title: `Points ${lo.toLocaleString()} – ${hi.toLocaleString()}`,
        players: matched.map((summary) => summary.player),
      });
    },
    [playerSummaries],
  );

  const handleCategoryClick = useCallback(
    (data: { n: number; label: string }) => {
      const matched = playerSummaries
        .filter((summary) => summary.categoryCount === data.n)
        .map((summary) => ({ player: summary.player, bestPoints: summary.bestPoints }));
      matched.sort((a, b) => {
        return b.bestPoints - a.bestPoints;
      });
      setModal({
        title: `Players in ${data.label}`,
        players: matched.map((summary) => summary.player),
      });
    },
    [playerSummaries],
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">Top 20 — Points</h2>
          <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500 mb-3 md:mb-4">
            {ageGroup} {EVENT_LABELS[eventType]} · {categoryPlayerCount} players
          </p>
          {loading && top20.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-sm">Loading…</div>
          ) : top20.length > 0 ? (
            <ResponsiveContainer width="100%" height={top20.length * 22 + 40}>
              <BarChart data={top20} layout="vertical" margin={{ left: 60, right: 10, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis dataKey="shortName" type="category" tick={{ fontSize: 10, fill: '#64748b' }} width={60} />
                <Tooltip
                  formatter={(v: unknown) => [(v as number).toLocaleString(), 'Points']}
                  labelFormatter={(_: unknown, payload: ReadonlyArray<{ payload?: { name?: string } }>) =>
                    payload[0]?.payload?.name ?? ''
                  }
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="points" radius={[0, 4, 4, 0]} fill={AGE_CHART_COLORS[ageGroup]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 dark:text-slate-500 text-sm py-8 text-center">
              No players found for {ageGroup} {EVENT_LABELS[eventType]}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">Points Dropoff</h2>
          <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500 mb-3 md:mb-4">
            {ageGroup} {EVENT_LABELS[eventType]} · {dropoffData.length} players
          </p>
          {loading && dropoffData.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">Loading…</div>
          ) : dropoffData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dropoffData}>
                <defs>
                  <linearGradient id="dropoffGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AGE_CHART_COLORS[ageGroup]} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={AGE_CHART_COLORS[ageGroup]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="rank"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  label={{ value: 'Rank', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={40} />
                <Tooltip
                  formatter={(v: unknown) => [(v as number).toLocaleString(), 'Points']}
                  labelFormatter={(label: unknown) => `Rank #${label}`}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="points"
                  stroke={AGE_CHART_COLORS[ageGroup]}
                  fill="url(#dropoffGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 dark:text-slate-500 text-sm py-8 text-center">No data available</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">Points Distribution</h2>
            <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">All Players</span>
          </div>
          <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500 mb-3 md:mb-4">
            Player count by best-points range · Tap a bar to see players
          </p>
          {distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  label={{ value: 'Points', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={35} />
                <Tooltip
                  formatter={(v: unknown) => [String(v), 'Players']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  background={{ fill: 'transparent', cursor: 'pointer' }}
                  onClick={(entry) => handleDistributionClick(entry as unknown as { lo: number; hi: number })}
                >
                  {distribution.map((_, i) => (
                    <Cell key={i} fill={HISTOGRAM_COLORS[i % HISTOGRAM_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 dark:text-slate-500 text-sm py-8 text-center">No data available</p>
          )}
        </div>

        {multiEventData.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">Category Participation</h2>
              <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">All Players</span>
            </div>
            <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500 mb-3 md:mb-4">
              Categories per player · Tap a bar to see players
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={multiEventData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={35} />
                <Tooltip
                  formatter={(v: unknown) => [(v as number).toLocaleString(), 'Players']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  fill="#10b981"
                  cursor="pointer"
                  background={{ fill: 'transparent', cursor: 'pointer' }}
                  onClick={(entry) => handleCategoryClick(entry as unknown as { n: number; label: string })}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {modal && <PlayerModal data={modal} onClose={() => setModal(null)} />}
    </>
  );
}
