import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ExternalLink,
  RefreshCw,
  TrendingUp,
  Award,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type {
  AgeGroup,
  EventType,
  PlayerEntry,
  PlayerRankingTrend,
  TswPlayerStats,
  CategoryStats,
  StatsCategory,
} from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES } from '../types/junior';
import {
  fetchPlayerTswOverviewStats,
  fetchPlayerRankingTrend,
  tswSearchUrl,
} from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';
import { formatDateLabel } from '../utils/playerUtils';
import { AGE_GRADIENT, AGE_BORDER, AGE_TEXT, AGE_HEX } from '../utils/playerStyles';
import { usePlayerProfile } from '../components/player/PlayerProfileLayout';

function RankingTrendChart({
  trend,
  entries,
  asOfDate,
}: {
  trend: PlayerRankingTrend;
  entries: PlayerEntry[];
  asOfDate: string;
}) {
  const categories = useMemo(() => {
    if (entries.length > 0) {
      const sorted = [...entries].sort((a, b) => {
        const agDiff = AGE_GROUPS.indexOf(a.ageGroup) - AGE_GROUPS.indexOf(b.ageGroup);
        if (agDiff !== 0) return agDiff;
        return EVENT_TYPES.indexOf(a.eventType) - EVENT_TYPES.indexOf(b.eventType);
      });
      return sorted.map((e) => `${e.ageGroup}-${e.eventType}`);
    }
    const catSet = new Set<string>();
    for (const point of trend.trend) {
      for (const e of point.entries) catSet.add(`${e.ageGroup}-${e.eventType}`);
    }
    return [...catSet].sort((a, b) => {
      const [agA, evA] = a.split('-');
      const [agB, evB] = b.split('-');
      const agDiff = AGE_GROUPS.indexOf(agA as AgeGroup) - AGE_GROUPS.indexOf(agB as AgeGroup);
      if (agDiff !== 0) return agDiff;
      return EVENT_TYPES.indexOf(evA as EventType) - EVENT_TYPES.indexOf(evB as EventType);
    });
  }, [entries, trend]);

  const bestCategory = useMemo(() => {
    if (entries.length > 0) {
      const best = entries.reduce((b, e) => (e.rank < b.rank ? e : b));
      return `${best.ageGroup}-${best.eventType}`;
    }
    if (categories.length > 0) return categories[0];
    return '';
  }, [entries, categories]);

  const [selectedCategory, setSelectedCategory] = useState(bestCategory);

  useEffect(() => {
    if (bestCategory) setSelectedCategory(bestCategory);
  }, [bestCategory]);

  const [ageGroup, eventType] = selectedCategory.split('-') as [AgeGroup, string];

  const chartData = useMemo(() => {
    return trend.trend
      .filter((point) => point.date <= asOfDate)
      .map((point) => {
        const entry = point.entries.find(
          (e) => e.ageGroup === ageGroup && e.eventType === eventType,
        );
        if (!entry) return null;
        return {
          date: point.date,
          label: formatDateLabel(point.date),
          rank: entry.rank,
          points: entry.rankingPoints,
        };
      })
      .filter(Boolean) as { date: string; label: string; rank: number; points: number }[];
  }, [trend, ageGroup, eventType, asOfDate]);

  if (chartData.length < 2) {
    return (
      <div className="py-6 text-center">
        <TrendingUp className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
        <p className="text-slate-400 dark:text-slate-500 text-sm">
          Not enough historical data for {selectedCategory.replace('-', ' ')}
        </p>
      </div>
    );
  }

  const maxRank = Math.max(...chartData.map((d) => d.rank));
  const rankDomain = [1, Math.ceil(maxRank * 1.1)];
  const lineColor = AGE_HEX[ageGroup];

  return (
    <div>
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {categories.map((cat) => {
            const [ag] = cat.split('-') as [AgeGroup, string];
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  cat === selectedCategory
                    ? `bg-gradient-to-r ${AGE_GRADIENT[ag]} text-white shadow-sm`
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {cat.replace('-', ' ')}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-center gap-x-5 mb-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: lineColor }} />
          Points
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 rounded-full" style={{ backgroundColor: lineColor }} />
          Rank
        </span>
      </div>

      <div className="-mx-2 md:mx-0">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 5, right: -10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="points"
            allowDecimals={false}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <YAxis
            yAxisId="rank"
            orientation="right"
            reversed
            domain={rankDomain}
            allowDecimals={false}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              fontSize: 12,
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            formatter={(value: unknown, name: unknown) => [
              name === 'Rank' ? `#${value}` : (value as number).toLocaleString(),
              name as string,
            ]}
            labelFormatter={(_label: unknown, payload: ReadonlyArray<{ payload?: { date?: string } }>) => {
              const dateStr = payload[0]?.payload?.date;
              if (!dateStr) return '';
              const d = new Date(dateStr + 'T00:00:00');
              return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            }}
          />
          <Line
            yAxisId="rank"
            type="monotone"
            dataKey="rank"
            name="Rank"
            stroke={lineColor}
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: lineColor, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            connectNulls
          />
          <Line
            yAxisId="points"
            type="monotone"
            dataKey="points"
            name="Points"
            stroke={lineColor}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            strokeOpacity={0.7}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

function RankingCard({ entry }: { entry: PlayerEntry }) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border ${AGE_BORDER[entry.ageGroup]} p-3 md:p-4`}>
      <div className="flex items-center justify-between mb-1.5 md:mb-2">
        <span className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold bg-gradient-to-r ${AGE_GRADIENT[entry.ageGroup]} text-white`}>
          {entry.ageGroup} {entry.eventType}
        </span>
        <span className={`text-xl md:text-2xl font-black ${AGE_TEXT[entry.ageGroup]}`}>
          #{entry.rank}
        </span>
      </div>
      <div className="mt-1.5 md:mt-2 flex items-baseline gap-1">
        <span className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">
          {entry.rankingPoints.toLocaleString()}
        </span>
        <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500">pts</span>
      </div>
    </div>
  );
}

function WinLossBar({ wins, losses, pct }: { wins: number; losses: number; pct: number }) {
  const total = wins + losses;
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <span className="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
        {wins} / {losses} ({total})
      </span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap">{pct}%</span>
    </div>
  );
}

const STATS_TABS: { key: StatsCategory; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'singles', label: 'Singles' },
  { key: 'doubles', label: 'Doubles' },
  { key: 'mixed', label: 'Mixed' },
];

function StatsTabContent({ cat }: { cat: CategoryStats }) {
  return (
    <div className="space-y-3 pt-3 md:pt-4">
      <div className="flex items-center gap-3 md:gap-4">
        <span className="text-xs md:text-sm text-slate-500 dark:text-slate-400 w-16 md:w-20 shrink-0">Career</span>
        <div className="flex-1">
          <WinLossBar wins={cat.career.wins} losses={cat.career.losses} pct={cat.career.winPct} />
        </div>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <span className="text-xs md:text-sm text-slate-500 dark:text-slate-400 w-16 md:w-20 shrink-0">This year</span>
        <div className="flex-1">
          <WinLossBar wins={cat.thisYear.wins} losses={cat.thisYear.losses} pct={cat.thisYear.winPct} />
        </div>
      </div>
    </div>
  );
}

function useVisibleOnScroll() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const ref = useCallback((node: HTMLDivElement | null) => { setEl(node); }, []);

  useEffect(() => {
    if (scrolled) return;
    const handler = () => setScrolled(true);
    window.addEventListener('scroll', handler, { once: true, passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [scrolled]);

  useEffect(() => {
    if (!el || visible || !scrolled) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, visible, scrolled]);

  return [ref, visible] as const;
}

export default function PlayerProfile() {
  const {
    usabId,
    displayName,
    isRanked,
    entries,
    sortedEntries,
    rankingsDate,
  } = usePlayerProfile();
  const {
    loading: loadingAllPlayers,
    directoryLoading,
  } = usePlayers();

  const [tswStats, setTswStats] = useState<TswPlayerStats | null>(null);
  const [loadingTsw, setLoadingTsw] = useState(false);
  const [tswError, setTswError] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<PlayerRankingTrend | null>(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [statsTab, setStatsTab] = useState<StatsCategory>('total');

  const [trendSentinelRef, trendVisible] = useVisibleOnScroll();
  const [tswSentinelRef, tswVisible] = useVisibleOnScroll();
  const trendTriggered = trendVisible;
  const tswTriggered = tswVisible;

  // TSW stats fetch (lazy — triggered by scroll or scroll-restore)
  useEffect(() => {
    if (!tswTriggered) return;
    if (!usabId || !displayName) {
      if (!loadingAllPlayers && !directoryLoading) setLoadingTsw(false);
      return;
    }
    let cancelled = false;
    setLoadingTsw(true);
    setTswError(null);
    fetchPlayerTswOverviewStats(usabId, displayName)
      .then((data) => {
        if (cancelled) return;
        setTswStats(data);
        setTswError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTswStats(null);
        setTswError(err instanceof Error ? err.message : 'Could not load TSW stats');
      })
      .finally(() => { if (!cancelled) setLoadingTsw(false); });
    return () => { cancelled = true; };
  }, [tswTriggered, usabId, displayName, loadingAllPlayers, directoryLoading]);

  // Ranking trend fetch (lazy — triggered by scroll or scroll-restore)
  useEffect(() => {
    if (!trendTriggered) return;
    if (!usabId || !displayName) {
      if (!loadingAllPlayers && !directoryLoading) setLoadingTrend(false);
      return;
    }
    let cancelled = false;
    setLoadingTrend(true);
    setTrendError(null);
    fetchPlayerRankingTrend(usabId)
      .then((data) => {
        if (cancelled) return;
        setTrendData(data);
        setTrendError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTrendData(null);
        setTrendError(err instanceof Error ? err.message : 'Could not load ranking trend');
      })
      .finally(() => { if (!cancelled) setLoadingTrend(false); });
    return () => { cancelled = true; };
  }, [trendTriggered, usabId, displayName, loadingAllPlayers, directoryLoading]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Rankings overview — only shown for currently ranked players */}
      {isRanked && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Award className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
            <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">Rankings Overview</h2>
          </div>
          <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500 mb-3 md:mb-4">
            Current rankings across all age groups and events
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3">
            {sortedEntries.map((entry) => (
              <RankingCard
                key={`${entry.ageGroup}-${entry.eventType}`}
                entry={entry}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ranking Trend */}
      <div ref={trendSentinelRef} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-violet-500" />
          <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">
            {isRanked ? 'Ranking Trend' : 'Historical Ranking Trend'}
          </h2>
        </div>
        {!trendTriggered ? null : loadingTrend ? (
          <div className="py-8 text-center">
            <RefreshCw className="w-7 h-7 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">Loading ranking history…</p>
          </div>
        ) : trendData && trendData.trend.length >= 2 ? (
          <RankingTrendChart trend={trendData} entries={entries} asOfDate={rankingsDate} />
        ) : (
          <div className="py-6 text-center">
            <TrendingUp className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">
              {trendError ? `Could not load ranking trend. ${trendError}` : 'Not enough historical data to show trends.'}
            </p>
          </div>
        )}
      </div>

      {/* Match Statistics from TSW */}
      <div ref={tswSentinelRef} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
            <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">Statistics</h2>
          </div>
          <a
            href={tswStats?.tswProfileUrl ?? tswSearchUrl(displayName)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs md:text-sm text-orange-600 hover:underline"
          >
            TSW <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {!tswTriggered ? null : loadingTsw ? (
          <div className="py-8 md:py-10 text-center">
            <RefreshCw className="w-7 h-7 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">Fetching match statistics…</p>
          </div>
        ) : tswStats && tswStats.total.career.total > 0 ? (
          <div className="space-y-5 md:space-y-6">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {STATS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatsTab(tab.key)}
                  className={`flex-1 px-2 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-all ${
                    statsTab === tab.key
                      ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div>
              <h5 className="text-[10px] md:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 md:mb-3">Win-Loss</h5>
              <StatsTabContent cat={tswStats[statsTab]} />
            </div>

            {statsTab === 'total' && tswStats.recentHistory.length > 0 && (
              <div>
                <h5 className="text-[10px] md:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 md:mb-3">History</h5>
                <div className="flex gap-1 md:gap-1.5 overflow-x-auto scrollbar-hide">
                  {tswStats.recentHistory.map((h, i) => (
                    <span
                      key={i}
                      title={h.date}
                      className={`w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold text-white shrink-0 ${
                        h.won ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    >
                      {h.won ? 'W' : 'L'}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="py-6 md:py-8 text-center space-y-3">
            <Activity className="w-8 md:w-10 h-8 md:h-10 text-slate-200 dark:text-slate-600 mx-auto" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">
              {tswError ? `Match statistics could not be loaded: ${tswError}` : 'Match statistics could not be loaded automatically.'}
            </p>
            <a
              href={tswSearchUrl(displayName)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm hover:bg-orange-600 transition-colors"
            >
              Search on TournamentSoftware <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>

    </div>
  );
}
