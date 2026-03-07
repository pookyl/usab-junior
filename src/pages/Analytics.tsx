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
import { X } from 'lucide-react';
import { usePlayers } from '../contexts/PlayersContext';
import type { AgeGroup, EventType, UniquePlayer, PlayerEntry } from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES, EVENT_LABELS } from '../types/junior';

const BOY_EVENTS = new Set(['BS', 'BD']);
const GIRL_EVENTS = new Set(['GS', 'GD']);

function inferGender(entries: PlayerEntry[]): 'Boy' | 'Girl' | '—' {
  for (const e of entries) {
    if (BOY_EVENTS.has(e.eventType)) return 'Boy';
    if (GIRL_EVENTS.has(e.eventType)) return 'Girl';
  }
  return '—';
}

const AGE_COLORS: Record<AgeGroup, string> = {
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

interface ModalData {
  title: string;
  players: UniquePlayer[];
}

function PlayerModal({ data, onClose }: { data: ModalData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{data.title}</h3>
            <p className="text-sm text-slate-400">{data.players.length} players</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Player</th>
                <th className="px-6 py-3 font-medium">Gender</th>
                <th className="px-6 py-3 font-medium">USAB ID</th>
                <th className="px-6 py-3 font-medium text-right">Best Points</th>
                <th className="px-6 py-3 font-medium text-right">Categories</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.players.map((p) => {
                const bestPts = p.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0);
                const cats = new Set(p.entries.map((e) => `${e.ageGroup}-${e.eventType}`)).size;
                const gender = inferGender(p.entries);
                return (
                  <tr key={p.usabId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <Link
                        to={`/directory/${p.usabId}`}
                        className="font-medium text-slate-800 hover:text-violet-600 transition-colors"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        gender === 'Boy' ? 'bg-blue-50 text-blue-600' :
                        gender === 'Girl' ? 'bg-pink-50 text-pink-600' :
                        'text-slate-400'
                      }`}>
                        {gender}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-mono text-xs text-slate-400">{p.usabId}</span>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-600 tabular-nums">
                      {bestPts.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-500 tabular-nums">{cats}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { players, loading } = usePlayers();
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('U11');
  const [eventType, setEventType] = useState<EventType>('BS');
  const [modal, setModal] = useState<ModalData | null>(null);

  const top20 = useMemo(() => {
    return players
      .flatMap((p) =>
        p.entries
          .filter((e) => e.ageGroup === ageGroup && e.eventType === eventType)
          .map((e) => ({
            name: p.name,
            shortName: p.name.split(' ')[0],
            points: e.rankingPoints,
            rank: e.rank,
          })),
      )
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 20);
  }, [players, ageGroup, eventType]);

  const dropoffData = useMemo(() => {
    return players
      .flatMap((p) =>
        p.entries
          .filter((e) => e.ageGroup === ageGroup && e.eventType === eventType)
          .map((e) => ({ points: e.rankingPoints, rank: e.rank })),
      )
      .filter((d) => d.points > 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 50);
  }, [players, ageGroup, eventType]);

  const { distribution, bucketSize } = useMemo(() => {
    const allPts = players
      .map((p) => p.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0))
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
  }, [players]);

  const multiEventData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const p of players) {
      const numEvents = new Set(p.entries.map((e) => `${e.ageGroup}-${e.eventType}`)).size;
      counts[numEvents] = (counts[numEvents] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([n, count]) => ({
        label: Number(n) === 1 ? '1 category' : `${n} categories`,
        count,
        n: Number(n),
      }))
      .sort((a, b) => a.n - b.n);
  }, [players]);

  const categoryPlayerCount = useMemo(() => {
    return players.filter((p) =>
      p.entries.some((e) => e.ageGroup === ageGroup && e.eventType === eventType),
    ).length;
  }, [players, ageGroup, eventType]);

  const handleDistributionClick = useCallback(
    (data: { lo: number; hi: number }) => {
      const { lo, hi } = data;
      const matched = players.filter((p) => {
        const best = p.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0);
        return best >= lo && best < hi;
      });
      matched.sort((a, b) => {
        const aPts = a.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0);
        const bPts = b.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0);
        return bPts - aPts;
      });
      setModal({
        title: `Points ${lo.toLocaleString()} – ${hi.toLocaleString()}`,
        players: matched,
      });
    },
    [players],
  );

  const handleCategoryClick = useCallback(
    (data: { n: number; label: string }) => {
      const matched = players.filter((p) => {
        const numCats = new Set(p.entries.map((e) => `${e.ageGroup}-${e.eventType}`)).size;
        return numCats === data.n;
      });
      matched.sort((a, b) => {
        const aPts = a.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0);
        const bPts = b.entries.reduce((max, e) => Math.max(max, e.rankingPoints), 0);
        return bPts - aPts;
      });
      setModal({
        title: `Players in ${data.label}`,
        players: matched,
      });
    },
    [players],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Analytics</h1>
        <p className="text-slate-500 mt-1">
          Rankings distribution &amp; performance insights
          {!loading && players.length > 0 && (
            <span className="text-slate-400"> · {players.length.toLocaleString()} ranked players</span>
          )}
        </p>
      </div>

      {/* Category selector */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-2">
          {AGE_GROUPS.map((ag) => (
            <button
              key={ag}
              onClick={() => setAgeGroup(ag)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                ageGroup === ag
                  ? 'text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-500'
              }`}
              style={ageGroup === ag ? { backgroundColor: AGE_COLORS[ag] } : {}}
            >
              {ag}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {EVENT_TYPES.map((et) => (
            <button
              key={et}
              onClick={() => setEventType(et)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                eventType === et
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-500'
              }`}
            >
              {et}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 20 points bar chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Top 20 Players — Points</h2>
          <p className="text-sm text-slate-400 mb-4">
            {ageGroup} {EVENT_LABELS[eventType]} · {categoryPlayerCount} ranked players
          </p>
          {loading && top20.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
          ) : top20.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={top20} layout="vertical" margin={{ left: 70, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis dataKey="shortName" type="category" tick={{ fontSize: 11, fill: '#64748b' }} width={70} />
                <Tooltip
                  formatter={(v: number) => [v.toLocaleString(), 'Points']}
                  labelFormatter={(_: string, payload: Array<{ payload?: { name?: string } }>) =>
                    payload[0]?.payload?.name ?? ''
                  }
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="points" radius={[0, 4, 4, 0]} fill={AGE_COLORS[ageGroup]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-8 text-center">
              No players found for {ageGroup} {EVENT_LABELS[eventType]}
            </p>
          )}
        </div>

        {/* Points Dropoff Curve */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Points Dropoff Curve</h2>
          <p className="text-sm text-slate-400 mb-4">
            {ageGroup} {EVENT_LABELS[eventType]} · {dropoffData.length} ranked players
          </p>
          {loading && dropoffData.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>
          ) : dropoffData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={dropoffData}>
                <defs>
                  <linearGradient id="dropoffGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AGE_COLORS[ageGroup]} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={AGE_COLORS[ageGroup]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="rank"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: 'Player Rank', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(v: number) => [v.toLocaleString(), 'Points']}
                  labelFormatter={(label: number) => `Rank #${label}`}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="points"
                  stroke={AGE_COLORS[ageGroup]}
                  fill="url(#dropoffGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-8 text-center">No data available</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Points distribution histogram */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Points Distribution</h2>
          <p className="text-sm text-slate-400 mb-4">
            Player count by best-points range · Click a bar to see players
          </p>
          {distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  label={{ value: 'Points', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(v: number) => [v, 'Players']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  minPointSize={8}
                  onClick={(entry) => handleDistributionClick(entry)}
                >
                  {distribution.map((_, i) => (
                    <Cell key={i} fill={HISTOGRAM_COLORS[i % HISTOGRAM_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-8 text-center">No data available</p>
          )}
        </div>

        {/* Multi-event participation */}
        {multiEventData.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Ranking Category Participation</h2>
            <p className="text-sm text-slate-400 mb-4">
              Categories per player · Click a bar to see players
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={multiEventData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(v: number) => [v.toLocaleString(), 'Players']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  fill="#10b981"
                  cursor="pointer"
                  minPointSize={8}
                  onClick={(entry) => handleCategoryClick(entry)}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {modal && <PlayerModal data={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
