import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { useRankings } from '../hooks/useRankings';
import type { AgeGroup, EventType } from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES, EVENT_LABELS } from '../types/junior';
import { staticRankings } from '../data/usaJuniorData';

const AGE_PIE_COLORS: Record<AgeGroup, string> = {
  U11: '#8b5cf6',
  U13: '#3b82f6',
  U15: '#10b981',
  U17: '#f59e0b',
  U19: '#ef4444',
};

const EVENT_PIE_COLORS: Record<EventType, string> = {
  BS: '#3b82f6',
  GS: '#ec4899',
  BD: '#10b981',
  GD: '#f59e0b',
  XD: '#8b5cf6',
};

function PointsDistribution({ ageGroup, eventType }: { ageGroup: AgeGroup; eventType: EventType }) {
  const { players, loading } = useRankings(ageGroup, eventType);

  if (loading || players.length === 0) {
    return <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>;
  }

  const top20 = players.slice(0, 20).map((p) => ({
    name: p.name.split(' ')[0],
    points: p.rankingPoints,
    rank: p.rank,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={top20} layout="vertical" margin={{ left: 60, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748b' }} width={60} />
        <Tooltip
          formatter={(v: number | undefined) => [(v ?? 0).toLocaleString(), 'Points']}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
        />
        <Bar dataKey="points" radius={[0, 4, 4, 0]} fill={AGE_PIE_COLORS[ageGroup]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PointsDropoff({ ageGroup, eventType }: { ageGroup: AgeGroup; eventType: EventType }) {
  const { players } = useRankings(ageGroup, eventType);
  if (players.length === 0) return null;

  const data = players.slice(0, 30).map((p) => ({ rank: p.rank, points: p.rankingPoints }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="rank" tick={{ fontSize: 11, fill: '#94a3b8' }} label={{ value: 'Rank', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <Tooltip
          formatter={(v: number | undefined) => [(v ?? 0).toLocaleString(), 'Points']}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
        />
        <Area type="monotone" dataKey="points" stroke={AGE_PIE_COLORS[ageGroup]} fill={AGE_PIE_COLORS[ageGroup]} fillOpacity={0.15} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function Analytics() {
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('U11');
  const [eventType, setEventType] = useState<EventType>('BS');

  // Age group player count from static data (BS only)
  const ageCounts = AGE_GROUPS.map((ag) => ({
    name: ag,
    players: staticRankings[`${ag}-BS`]?.length ?? 0,
    fill: AGE_PIE_COLORS[ag],
  })).filter((d) => d.players > 0);

  const eventPieData = EVENT_TYPES.map((et) => ({
    name: `${et} (${EVENT_LABELS[et]})`,
    value: 1,
    fill: EVENT_PIE_COLORS[et],
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Analytics</h1>
        <p className="text-slate-500 mt-1">Rankings distribution &amp; performance insights</p>
      </div>

      {/* Selector */}
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
              style={ageGroup === ag ? { backgroundColor: AGE_PIE_COLORS[ag] } : {}}
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
          <p className="text-sm text-slate-400 mb-4">{ageGroup} {EVENT_LABELS[eventType]}</p>
          <PointsDistribution ageGroup={ageGroup} eventType={eventType} />
        </div>

        {/* Points dropoff curve */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Points Dropoff Curve</h2>
          <p className="text-sm text-slate-400 mb-4">Top 30 ranked players · {ageGroup} {eventType}</p>
          <PointsDropoff ageGroup={ageGroup} eventType={eventType} />
        </div>

        {/* Age group breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Players per Age Group</h2>
          <p className="text-sm text-slate-400 mb-4">Boys Singles ranked players (BS cached data)</p>
          {ageCounts.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ageCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(v: number | undefined) => [v ?? 0, 'Players']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="players" radius={[4, 4, 0, 0]}>
                  {ageCounts.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-8 text-center">No data available</p>
          )}
        </div>

        {/* Event distribution pie */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Event Categories</h2>
          <p className="text-sm text-slate-400 mb-4">USAB Junior tracks 5 event types</p>
          <div className="flex gap-6 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={eventPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {eventPieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(_: number | undefined, name: string | undefined) => [name ?? '', '']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 shrink-0">
              {EVENT_TYPES.map((et) => (
                <div key={et} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: EVENT_PIE_COLORS[et] }}
                  />
                  <span className="font-semibold text-slate-700">{et}</span>
                  <span className="text-slate-400 text-xs">{EVENT_LABELS[et]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
