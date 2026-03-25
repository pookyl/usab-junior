import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { Search, ExternalLink, RefreshCw, Trophy, WifiOff, Calendar, X, BarChart2, ListOrdered, Users, Feather, LayoutDashboard } from 'lucide-react';
import type { AgeGroup, EventType, UniquePlayer } from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES, EVENT_LABELS } from '../types/junior';
import { usePlayers } from '../contexts/PlayersContext';
import StatCard from '../components/StatCard';
import { inferGender } from '../utils/playerUtils';
import { AGE_COLORS } from '../constants/ageGroupStyles';

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

const AGE_OVERVIEW_COLORS: Record<AgeGroup, { bg: string; gradient: string; light: string; text: string }> = {
  U11: { bg: 'bg-violet-600', gradient: 'from-violet-500 to-violet-700', light: 'bg-violet-50', text: 'text-violet-700' },
  U13: { bg: 'bg-blue-600', gradient: 'from-blue-500 to-blue-700', light: 'bg-blue-50', text: 'text-blue-700' },
  U15: { bg: 'bg-emerald-600', gradient: 'from-emerald-500 to-emerald-700', light: 'bg-emerald-50', text: 'text-emerald-700' },
  U17: { bg: 'bg-amber-500', gradient: 'from-amber-400 to-amber-600', light: 'bg-amber-50', text: 'text-amber-700' },
  U19: { bg: 'bg-rose-600', gradient: 'from-rose-500 to-rose-700', light: 'bg-rose-50', text: 'text-rose-700' },
};

interface GroupStats {
  total: number;
  boys: number;
  girls: number;
}

function GenderBar({ boys, girls }: { boys: number; girls: number }) {
  const total = boys + girls;
  if (total === 0) return <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full" />;
  const bPct = (boys / total) * 100;
  const gPct = (girls / total) * 100;
  return (
    <div className="h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
      {bPct > 0 && <div className="bg-blue-500 transition-all duration-500" style={{ width: `${bPct}%` }} />}
      {gPct > 0 && <div className="bg-pink-400 transition-all duration-500" style={{ width: `${gPct}%` }} />}
    </div>
  );
}

function AgeGroupCard({ ageGroup, stats }: { ageGroup: AgeGroup; stats: GroupStats }) {
  const colors = AGE_OVERVIEW_COLORS[ageGroup];
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden hover:shadow-md transition-shadow">
      <Link
        to={`/directory?age_group=${ageGroup}`}
        className={`bg-gradient-to-r ${colors.gradient} px-4 md:px-5 py-2.5 md:py-3 flex items-center justify-between hover:brightness-110 transition-all`}
      >
        <span className="font-bold text-white text-base md:text-lg">{ageGroup}</span>
        <span className="bg-white/20 text-white text-xs md:text-sm font-semibold px-2.5 md:px-3 py-0.5 rounded-full">
          {stats.total} players
        </span>
      </Link>
      <div className="p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-blue-600">{stats.boys} Boys</span>
          <span className="font-medium text-pink-500">{stats.girls} Girls</span>
        </div>
        <GenderBar boys={stats.boys} girls={stats.girls} />
        <div className="flex items-center justify-center gap-1.5 text-xs">
          <span className="text-slate-400 dark:text-slate-500 font-medium">Rankings:</span>
          {(['BS', 'GS', 'XD'] as const).map((et) => (
            <Link
              key={et}
              to={`/players?age_group=${ageGroup}&event_type=${et}`}
              className={`px-2 py-0.5 rounded-md font-semibold ${colors.text} ${colors.light} hover:opacity-80 transition-opacity`}
            >
              {et}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatRankingsDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl font-black text-amber-500">🥇</span>;
  if (rank === 2) return <span className="text-xl font-black text-slate-400 dark:text-slate-500">🥈</span>;
  if (rank === 3) return <span className="text-xl font-black text-amber-700">🥉</span>;
  return <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums">#{rank}</span>;
}

/* ─── Rankings Table ─── */

function RankingsTable({ ageGroup, eventType, date }: { ageGroup: AgeGroup; eventType: EventType; date: string }) {
  const [search, setSearch] = useState('');
  const { players: allPlayers, loading, error } = usePlayers();

  const players = useMemo(
    () =>
      allPlayers
        .flatMap((p) =>
          p.entries
            .filter((e) => e.ageGroup === ageGroup && e.eventType === eventType)
            .map((e) => ({ usabId: p.usabId, name: p.name, rank: e.rank, rankingPoints: e.rankingPoints })),
        )
        .sort((a, b) => a.rank - b.rank),
    [allPlayers, ageGroup, eventType],
  );

  const filtered = useMemo(
    () =>
      players.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.usabId.includes(search),
      ),
    [players, search],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search name or USAB ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 md:py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:focus:ring-emerald-600 bg-white dark:bg-slate-900"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
            {ageGroup} {eventType}
            {!loading && <span className="text-slate-400 dark:text-slate-500 font-normal ml-2">· {filtered.length} players</span>}
          </p>
          <a
            href={`https://usabjrrankings.org/?age_group=${ageGroup}&category=${eventType}&date=${date}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <span className="hidden sm:inline">usabjrrankings.org</span> <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {loading && players.length === 0 ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">Loading rankings…</p>
          </div>
        ) : error && players.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <WifiOff className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">Could not load rankings for {ageGroup} {eventType.toUpperCase()}</p>
            <a
              href={`https://usabjrrankings.org/?age_group=${ageGroup}&category=${eventType}&date=${date}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
            >
              View on usabjrrankings.org <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">No players match your search.</div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map((player) => (
                <Link
                  key={player.usabId}
                  to={`/directory/${player.usabId}`}
                  className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                >
                  <div className="w-8 shrink-0 text-center">
                    <RankBadge rank={player.rank} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{player.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{player.usabId}</p>
                  </div>
                  <span className="font-bold text-emerald-600 text-sm tabular-nums shrink-0">
                    {player.rankingPoints.toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 dark:text-slate-500 text-xs uppercase tracking-wider">
                    <th className="px-5 py-3 font-medium w-16">Rank</th>
                    <th className="px-5 py-3 font-medium">Player</th>
                    <th className="px-5 py-3 font-medium">USAB ID</th>
                    <th className="px-5 py-3 font-medium text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {filtered.map((player) => (
                    <tr key={player.usabId} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                      <td className="px-5 py-3">
                        <RankBadge rank={player.rank} />
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          to={`/directory/${player.usabId}`}
                          className="font-medium text-slate-800 dark:text-slate-100 hover:text-violet-600 transition-colors"
                        >
                          {player.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{player.usabId}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-bold text-emerald-600 tabular-nums">
                          {player.rankingPoints.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Analytics: Player Modal ─── */

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

/* ─── Analytics View ─── */

function AnalyticsView({ ageGroup, eventType }: { ageGroup: AgeGroup; eventType: EventType }) {
  const { players, loading } = usePlayers();
  const [modal, setModal] = useState<ModalData | null>(null);

  const top20 = useMemo(() => {
    const raw = players
      .flatMap((p) =>
        p.entries
          .filter((e) => e.ageGroup === ageGroup && e.eventType === eventType)
          .map((e) => ({
            name: p.name,
            usabId: p.usabId,
            points: e.rankingPoints,
            rank: e.rank,
          })),
      )
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 20);

    const nameCounts = new Map<string, number>();
    for (const r of raw) nameCounts.set(r.name, (nameCounts.get(r.name) ?? 0) + 1);

    return raw.map((r) => ({
      ...r,
      shortName:
        nameCounts.get(r.name)! > 1
          ? `${r.name.split(' ')[0]} (${r.usabId.slice(-4)})`
          : r.name.split(' ')[0],
    }));
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

  const { distribution } = useMemo(() => {
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
        label: Number(n) === 1 ? '1 cat' : `${n} cats`,
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

/* ─── Player Stats View ─── */

function PlayerStatsView() {
  const { players, loading } = usePlayers();
  const hasData = players.length > 0;

  const { totalBoys, totalGirls, totalPlayers, groupStats } = useMemo(() => {
    let boys = 0;
    let girls = 0;
    const groups: Record<AgeGroup, GroupStats> = {
      U11: { total: 0, boys: 0, girls: 0 },
      U13: { total: 0, boys: 0, girls: 0 },
      U15: { total: 0, boys: 0, girls: 0 },
      U17: { total: 0, boys: 0, girls: 0 },
      U19: { total: 0, boys: 0, girls: 0 },
    };

    for (const player of players) {
      const gender = inferGender(player.entries);
      if (!gender) continue;
      if (gender === 'Boy') boys++;
      else girls++;
      const ageGroupsForPlayer = new Set(player.entries.map((e) => e.ageGroup));
      for (const ag of ageGroupsForPlayer) {
        groups[ag].total++;
        if (gender === 'Boy') groups[ag].boys++;
        else groups[ag].girls++;
      }
    }

    return { totalBoys: boys, totalGirls: girls, totalPlayers: boys + girls, groupStats: groups };
  }, [players]);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="Total Players"
          value={!hasData && loading ? '...' : totalPlayers.toLocaleString()}
          sub="Unique ranked players"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Boys"
          value={!hasData && loading ? '...' : totalBoys.toLocaleString()}
          sub={totalPlayers > 0 ? `${((totalBoys / totalPlayers) * 100).toFixed(0)}% of total` : ''}
          icon={<span className="w-5 h-5 flex items-center justify-center text-lg">♂</span>}
          color="bg-blue-50"
        />
        <StatCard
          label="Girls"
          value={!hasData && loading ? '...' : totalGirls.toLocaleString()}
          sub={totalPlayers > 0 ? `${((totalGirls / totalPlayers) * 100).toFixed(0)}% of total` : ''}
          icon={<span className="w-5 h-5 flex items-center justify-center text-lg">♀</span>}
          color="bg-pink-50"
        />
        <StatCard
          label="Age Groups"
          value={AGE_GROUPS.length}
          sub="U11 · U13 · U15 · U17 · U19"
          icon={<Feather className="w-5 h-5" />}
        />
      </div>

      {totalPlayers > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
          <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 md:mb-4">Overall Gender Distribution</h2>
          <GenderBar boys={totalBoys} girls={totalGirls} />
          <div className="flex items-center gap-4 md:gap-6 mt-3 text-xs md:text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
              <span className="text-slate-600 dark:text-slate-300">Boys {totalBoys}</span>
              <span className="text-slate-400 dark:text-slate-500">({totalPlayers > 0 ? ((totalBoys / totalPlayers) * 100).toFixed(1) : 0}%)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-pink-400 inline-block" />
              <span className="text-slate-600 dark:text-slate-300">Girls {totalGirls}</span>
              <span className="text-slate-400 dark:text-slate-500">({totalPlayers > 0 ? ((totalGirls / totalPlayers) * 100).toFixed(1) : 0}%)</span>
            </span>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100">Players by Age Group</h2>
          <Link to="/directory" className="text-sm text-emerald-600 hover:underline font-medium">
            View all →
          </Link>
        </div>
        {!hasData && loading ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">Loading player data...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
            {AGE_GROUPS.map((ag) => (
              <AgeGroupCard key={ag} ageGroup={ag} stats={groupStats[ag]} />
            ))}
          </div>
        )}
      </div>

      {totalPlayers > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">Breakdown Summary</h2>
          </div>
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {AGE_GROUPS.map((ag) => {
              const s = groupStats[ag];
              const colors = AGE_OVERVIEW_COLORS[ag];
              return (
                <div key={ag} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex items-center gap-2 font-semibold text-sm ${colors.text}`}>
                      <span className={`w-2 h-2 rounded-full ${colors.bg}`} />
                      {ag}
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{s.total} players</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-blue-600 font-medium">{s.boys} Boys</span>
                    <span className="text-pink-500 font-medium">{s.girls} Girls</span>
                  </div>
                  <GenderBar boys={s.boys} girls={s.girls} />
                </div>
              );
            })}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">Total</span>
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{totalPlayers} players</span>
              </div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-blue-600 font-medium">{totalBoys} Boys ({totalPlayers > 0 ? ((totalBoys / totalPlayers) * 100).toFixed(0) : 0}%)</span>
                <span className="text-pink-500 font-medium">{totalGirls} Girls ({totalPlayers > 0 ? ((totalGirls / totalPlayers) * 100).toFixed(0) : 0}%)</span>
              </div>
              <GenderBar boys={totalBoys} girls={totalGirls} />
            </div>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-left">
                  <th className="px-6 py-3 font-semibold">Age Group</th>
                  <th className="px-6 py-3 font-semibold text-right">Total</th>
                  <th className="px-6 py-3 font-semibold text-right">Boys</th>
                  <th className="px-6 py-3 font-semibold text-right">Girls</th>
                  <th className="px-6 py-3 font-semibold text-right">Boy %</th>
                  <th className="px-6 py-3 font-semibold text-right">Girl %</th>
                  <th className="px-6 py-3 font-semibold">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {AGE_GROUPS.map((ag) => {
                  const s = groupStats[ag];
                  const bPct = s.total > 0 ? ((s.boys / s.total) * 100).toFixed(0) : '—';
                  const gPct = s.total > 0 ? ((s.girls / s.total) * 100).toFixed(0) : '—';
                  const colors = AGE_OVERVIEW_COLORS[ag];
                  return (
                    <tr key={ag} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-2 font-semibold ${colors.text}`}>
                          <span className={`w-2 h-2 rounded-full ${colors.bg}`} />
                          {ag}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-slate-700 dark:text-slate-200">{s.total}</td>
                      <td className="px-6 py-3 text-right text-blue-600 font-medium">{s.boys}</td>
                      <td className="px-6 py-3 text-right text-pink-500 font-medium">{s.girls}</td>
                      <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">{bPct}{bPct !== '—' && '%'}</td>
                      <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">{gPct}{gPct !== '—' && '%'}</td>
                      <td className="px-6 py-3 w-40">
                        <GenderBar boys={s.boys} girls={s.girls} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/50 font-bold">
                  <td className="px-6 py-3 text-slate-700 dark:text-slate-200">Total</td>
                  <td className="px-6 py-3 text-right text-slate-700 dark:text-slate-200">{totalPlayers}</td>
                  <td className="px-6 py-3 text-right text-blue-600">{totalBoys}</td>
                  <td className="px-6 py-3 text-right text-pink-500">{totalGirls}</td>
                  <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">
                    {totalPlayers > 0 ? ((totalBoys / totalPlayers) * 100).toFixed(0) : '—'}%
                  </td>
                  <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">
                    {totalPlayers > 0 ? ((totalGirls / totalPlayers) * 100).toFixed(0) : '—'}%
                  </td>
                  <td className="px-6 py-3 w-40">
                    <GenderBar boys={totalBoys} girls={totalGirls} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main Rankings Page ─── */

type ViewMode = 'player-stats' | 'rankings' | 'analytics';

export default function Rankings() {
  const [searchParams] = useSearchParams();
  const paramAge = searchParams.get('age_group') as AgeGroup | null;
  const paramEvent = searchParams.get('event_type') as EventType | null;

  const [ageGroup, setAgeGroup] = useState<AgeGroup>(
    paramAge && AGE_GROUPS.includes(paramAge) ? paramAge : 'U11',
  );
  const [eventType, setEventType] = useState<EventType>(
    paramEvent && EVENT_TYPES.includes(paramEvent) ? paramEvent : 'BS',
  );
  const [view, setView] = useState<ViewMode>('rankings');
  const [isDateOpen, setIsDateOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const { rankingsDate, availableDates, changeDate, loading, ensureAvailableDates } = usePlayers();
  const hasMultipleDates = availableDates.length > 1;

  useEffect(() => {
    if (paramAge && AGE_GROUPS.includes(paramAge)) setAgeGroup(paramAge);
    if (paramEvent && EVENT_TYPES.includes(paramEvent)) setEventType(paramEvent);
    if (paramAge || paramEvent) setView('rankings');
  }, [paramAge, paramEvent]);

  useEffect(() => {
    void ensureAvailableDates();
  }, [ensureAvailableDates]);

  useEffect(() => {
    if (!isDateOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setIsDateOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isDateOpen]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-5 md:space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 md:w-6 md:h-6 text-amber-500" />
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">Rankings & Insights</h1>
          </div>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400">
            Data from{' '}
            <a
              href="https://usabjrrankings.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >usabjrrankings.org<ExternalLink className="w-3 h-3 inline" /></a>
            {' · '}
            <a
              href="https://usabjrrankings.org/show_points_table"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >Points Table<ExternalLink className="w-3 h-3 inline" /></a>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-xl">
        <div className="min-w-0 flex items-center gap-2 text-xs md:text-sm text-blue-700 dark:text-blue-300">
          <Calendar className="w-4 h-4 shrink-0" />
          <span className="truncate">
            Rankings as of <span className="font-semibold">{formatRankingsDate(rankingsDate)}</span>
          </span>
        </div>
        <div ref={datePickerRef} className="relative shrink-0">
          <button
            onClick={() => hasMultipleDates && setIsDateOpen((open) => !open)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs md:text-sm transition-colors border ${
              isDateOpen
                ? 'bg-blue-600 text-white border-blue-600'
                : hasMultipleDates
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                  : 'bg-white/70 dark:bg-slate-900/70 text-blue-400 dark:text-blue-400 border-blue-100 dark:border-blue-900 cursor-default'
            }`}
            aria-label={`Rankings date: ${formatRankingsDate(rankingsDate)}`}
            title={`Rankings as of ${formatRankingsDate(rankingsDate)}`}
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
            <span className="font-medium">{formatShortDate(rankingsDate)}</span>
          </button>

          {isDateOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-20">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                Rankings Date
              </div>
              <div className="max-h-[min(16rem,calc(100vh-11rem))] overflow-y-auto py-1">
                {availableDates.map((date, i) => (
                  <button
                    key={date}
                    onClick={() => {
                      changeDate(date);
                      setIsDateOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      date === rankingsDate
                        ? 'bg-violet-600 text-white font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {formatRankingsDate(date)}
                    {i === 0 && <span className="ml-1.5 text-[10px] opacity-60">(Latest)</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View Toggle — underline tabs */}
      <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700">
        {([
          { key: 'rankings' as const, label: 'Rankings', Icon: ListOrdered },
          { key: 'player-stats' as const, label: 'Player Stats', Icon: LayoutDashboard },
          { key: 'analytics' as const, label: 'Analytics', Icon: BarChart2 },
        ]).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 pb-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              view === key
                ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {view !== 'player-stats' && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
            {AGE_GROUPS.map((ag) => (
              <button
                key={ag}
                onClick={() => setAgeGroup(ag)}
                className={`px-5 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm whitespace-nowrap shrink-0 ${
                  ageGroup === ag
                    ? `${AGE_COLORS[ag]} text-white scale-105`
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                }`}
              >
                {ag}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
            {EVENT_TYPES.map((et) => (
              <button
                key={et}
                onClick={() => setEventType(et)}
                className={`px-3.5 md:px-4 py-2 rounded-xl text-sm font-medium transition-all border whitespace-nowrap shrink-0 shadow-sm ${
                  eventType === et
                    ? `${AGE_COLORS[ageGroup]} text-white border-transparent scale-105`
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                <span className="font-bold">{et}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {view === 'player-stats' ? (
        <PlayerStatsView />
      ) : view === 'rankings' ? (
        <RankingsTable ageGroup={ageGroup} eventType={eventType} date={rankingsDate} />
      ) : (
        <AnalyticsView ageGroup={ageGroup} eventType={eventType} />
      )}
    </div>
  );
}
