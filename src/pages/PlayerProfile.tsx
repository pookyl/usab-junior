import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Trophy,
  RefreshCw,
  Calendar,
  MapPin,
  TrendingUp,
  Award,
  Activity,
  ChevronDown,
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
  TswTournament,
  CategoryStats,
  StatsCategory,
} from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES } from '../types/junior';
import {
  fetchPlayerDetail,
  fetchPlayerTswStats,
  fetchPlayerRankingTrend,
  usabPlayerUrl,
  tswSearchUrl,
} from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';
import { formatDateLabel, parseScoreString } from '../utils/playerUtils';

const AGE_GRADIENT: Record<AgeGroup, string> = {
  U11: 'from-violet-500 to-violet-700',
  U13: 'from-blue-500 to-blue-700',
  U15: 'from-emerald-500 to-emerald-700',
  U17: 'from-amber-500 to-amber-600',
  U19: 'from-rose-500 to-rose-700',
};

const AGE_BORDER: Record<AgeGroup, string> = {
  U11: 'border-violet-200 hover:border-violet-400 dark:border-violet-800 dark:hover:border-violet-600',
  U13: 'border-blue-200 hover:border-blue-400 dark:border-blue-800 dark:hover:border-blue-600',
  U15: 'border-emerald-200 hover:border-emerald-400 dark:border-emerald-800 dark:hover:border-emerald-600',
  U17: 'border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-600',
  U19: 'border-rose-200 hover:border-rose-400 dark:border-rose-800 dark:hover:border-rose-600',
};

const AGE_TEXT: Record<AgeGroup, string> = {
  U11: 'text-violet-600',
  U13: 'text-blue-600',
  U15: 'text-emerald-600',
  U17: 'text-amber-600',
  U19: 'text-rose-600',
};

const AGE_HEX: Record<AgeGroup, string> = {
  U11: '#8b5cf6',
  U13: '#3b82f6',
  U15: '#10b981',
  U17: '#f59e0b',
  U19: '#ef4444',
};

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

const SEASON_BOUNDARY_MONTH = 8;
const SEASON_BOUNDARY_DAY = 15;

function getSeasonKey(t: TswTournament, yearHint: number): string {
  let year = yearHint;
  let month = -1;
  let day = 1;

  if (t.startDate) {
    const parts = t.startDate.split('-');
    if (parts.length >= 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }
  }

  if (month < 0) {
    const d = new Date(t.dates.split(' - ')[0]);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear();
      month = d.getMonth() + 1;
      day = d.getDate();
    }
  }

  if (month < 0) return `${yearHint - 1}-${yearHint}`;

  if (month > SEASON_BOUNDARY_MONTH || (month === SEASON_BOUNDARY_MONTH && day >= SEASON_BOUNDARY_DAY)) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

function sortMatchesByDate<T extends { date: string }>(matches: T[]): T[] {
  const indexed = matches.map((m, i) => ({ m, i, ts: m.date ? new Date(m.date).getTime() : NaN }));
  const hasDate = indexed.some((x) => !isNaN(x.ts));
  if (!hasDate) return matches;
  indexed.sort((a, b) => {
    const aValid = !isNaN(a.ts);
    const bValid = !isNaN(b.ts);
    if (aValid && bValid) return a.ts - b.ts;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return a.i - b.i;
  });
  return indexed.map((x) => x.m);
}

function parseTournamentStartDate(t: TswTournament): number {
  if (t.startDate) {
    const ts = new Date(t.startDate + 'T00:00:00').getTime();
    if (!isNaN(ts)) return ts;
  }
  const d = new Date(t.dates.split(' - ')[0]);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function groupBySeason(tournamentsByYear: Record<string, TswTournament[]>): Record<string, TswTournament[]> {
  const bySeason: Record<string, TswTournament[]> = {};
  for (const [yearStr, tournaments] of Object.entries(tournamentsByYear)) {
    const yearHint = parseInt(yearStr, 10);
    for (const t of tournaments) {
      const key = getSeasonKey(t, yearHint);
      if (!bySeason[key]) bySeason[key] = [];
      bySeason[key].push(t);
    }
  }
  for (const key of Object.keys(bySeason)) {
    bySeason[key].sort((a, b) => parseTournamentStartDate(b) - parseTournamentStartDate(a));
  }
  return bySeason;
}

function currentSeasonKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (m > SEASON_BOUNDARY_MONTH || (m === SEASON_BOUNDARY_MONTH && d >= SEASON_BOUNDARY_DAY)) {
    return `${y}-${y + 1}`;
  }
  return `${y - 1}-${y}`;
}

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


function TournamentMatchCard({
  match,
  playerName,
  tournamentId,
  fromPath,
  onBeforePlayerNavigate,
  location,
  showTournament = true,
}: {
  match: import('../types/junior').TswMatchResult;
  playerName: string;
  tournamentId?: string;
  fromPath?: string;
  onBeforePlayerNavigate?: () => void;
  location?: string;
  showTournament?: boolean;
}) {
  const splitTeamNames = (raw: string): Array<{ name: string; playerId: number | null }> =>
    raw
      .split(/\s*\/\s*/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((name) => ({ name, playerId: null }));

  const playerTeam = match.playerTeam && match.playerTeam.length > 0
    ? match.playerTeam
    : [
        { name: playerName, playerId: null },
        ...splitTeamNames(match.partner),
      ];
  const opponentTeam = match.opponentTeam && match.opponentTeam.length > 0
    ? match.opponentTeam
    : splitTeamNames(match.opponent);

  const scores = parseScoreString(match.score);
  const isWalkover = match.walkover || match.score.toLowerCase() === 'walkover';
  const catLabel =
    match.category === 'singles' ? 'Singles' : match.category === 'doubles' ? 'Doubles' : 'Mixed';
  const headerLabel = [match.round, match.event || catLabel].filter(Boolean).join(' · ');

  const tswBase = 'https://www.tournamentsoftware.com';
  const tournamentHref = match.tournamentUrl
    ? (match.tournamentUrl.startsWith('http') ? match.tournamentUrl : `${tswBase}${match.tournamentUrl}`)
    : '';

  return (
    <div className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
      match.won
        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 border-l-[3px] border-l-emerald-500'
        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
    }`}>
      <div className={`px-4 py-2 rounded-t-xl ${
        match.won
          ? 'bg-emerald-100/60 dark:bg-emerald-900/30'
          : 'bg-slate-200/70 dark:bg-slate-800/60'
      }`}>
        <p className="text-xs font-medium min-w-0 truncate text-slate-600 dark:text-slate-300">
          {headerLabel}
        </p>
      </div>

      {showTournament && match.tournament && (
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
          {tournamentHref ? (
            <a
              href={tournamentHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-orange-600 truncate transition-colors inline-flex items-center gap-1.5"
            >
              {match.tournament}
              <ExternalLink className="w-3 h-3 md:w-3.5 md:h-3.5 text-orange-500 shrink-0" />
            </a>
          ) : (
            <p className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{match.tournament}</p>
          )}
        </div>
      )}

      <div className="px-4 divide-y divide-slate-100 dark:divide-slate-800">
        <div className="flex items-start gap-2 py-1.5">
          <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 ${
            match.won
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
          }`}>
            {match.won ? 'W' : 'L'}
          </span>
          <div className={`text-sm min-w-0 flex-1 ${match.won ? 'font-semibold' : ''} text-slate-800 dark:text-slate-100`}>
            <div className="truncate">
              <PlayerNameLinkGroup
                players={playerTeam}
                tournamentId={tournamentId ?? match.tournamentId}
                fromPath={fromPath}
                onBeforeNavigate={onBeforePlayerNavigate}
                className="text-slate-800 dark:text-slate-100 hover:text-violet-600"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 font-mono text-sm pt-0.5">
            {isWalkover && !match.won && (
              <span className="text-amber-500 dark:text-amber-400 text-xs font-semibold">Walkover</span>
            )}
            {match.won && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />}
            {scores.map(([a, b], i) => (
              <span key={i} className={`w-5 text-right tabular-nums ${match.won && a > b ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                {a}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 py-1.5">
          <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 ${
            !match.won
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
          }`}>
            {!match.won ? 'W' : 'L'}
          </span>
          <div className={`text-sm min-w-0 flex-1 ${!match.won ? 'font-semibold' : ''} text-slate-800 dark:text-slate-100`}>
            <div className="truncate">
              <PlayerNameLinkGroup
                players={opponentTeam}
                tournamentId={tournamentId ?? match.tournamentId}
                fromPath={fromPath}
                onBeforeNavigate={onBeforePlayerNavigate}
                className="text-slate-800 dark:text-slate-100 hover:text-violet-600"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 font-mono text-sm pt-0.5">
            {isWalkover && match.won && (
              <span className="text-amber-500 dark:text-amber-400 text-xs font-semibold">Walkover</span>
            )}
            {!match.won && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />}
            {scores.map(([a, b], i) => (
              <span key={i} className={`w-5 text-right tabular-nums ${!match.won && b > a ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>

      {(match.date || location) && (
        <div className="px-4 py-2 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
          {match.date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {match.date}
            </span>
          )}
          {location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {location}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PlayerNameLinkGroup({
  players,
  tournamentId,
  fromPath,
  onBeforeNavigate,
  className,
}: {
  players: Array<{ name: string; playerId: number | null }>;
  tournamentId?: string;
  fromPath?: string;
  onBeforeNavigate?: () => void;
  className?: string;
}) {
  return (
    <>
      {players.map((player, i) => {
        const trimmed = player.name.trim();
        const playerId = player.playerId;
        const canLink = Boolean(tournamentId && playerId);
        return (
          <span key={i}>
            {i > 0 && ' / '}
            {canLink ? (
              <Link
                to={`/tournaments/${tournamentId}/player/${playerId}`}
                state={fromPath ? { fromPath } : undefined}
                className={`no-underline hover:text-violet-600 transition-colors ${className ?? ''}`}
                onClick={(e) => {
                  onBeforeNavigate?.();
                  e.stopPropagation();
                }}
              >
                {trimmed}
              </Link>
            ) : (
              trimmed
            )}
          </span>
        );
      })}
    </>
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
  const { id: usabId } = useParams<{ id: string }>();
  const location = useLocation();
  const { players: allPlayers, directoryPlayers, directoryLoading, loading: loadingAllPlayers, rankingsDate } = usePlayers();
  const fromPath = (location.state as { fromPath?: string } | null)?.fromPath;
  const backTarget = fromPath ?? '/directory';
  const backLabel = fromPath ? 'Back' : 'Back to Players';
  const backState = fromPath?.startsWith('/tournaments/') ? { restoreTournamentScroll: true } : undefined;

  const rankedPlayer = allPlayers.find((p) => p.usabId === usabId) ?? null;
  const dirPlayer = directoryPlayers.find((p) => p.usabId === usabId) ?? null;
  const isRanked = rankedPlayer !== null && rankedPlayer.entries.length > 0;
  const playerName = rankedPlayer?.name ?? dirPlayer?.name ?? '';
  const playerFound = rankedPlayer !== null || dirPlayer !== null;

  const [gender, setGender] = useState<string | null>(null);
  const [tswStats, setTswStats] = useState<TswPlayerStats | null>(null);
  const [loadingTsw, setLoadingTsw] = useState(() => {
    if (!usabId) return false;
    try {
      const raw = sessionStorage.getItem(`player-profile:view:${usabId}`);
      return raw ? JSON.parse(raw)?.restorePending === true : false;
    } catch { return false; }
  });
  const [tswError, setTswError] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<PlayerRankingTrend | null>(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [statsTab, setStatsTab] = useState<StatsCategory>('total');
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [collapsedTournaments, setCollapsedTournaments] = useState<Set<string>>(new Set());
  const expandedYearsRef = useRef(expandedYears);
  const collapsedTournamentsRef = useRef(collapsedTournaments);
  const statsTabRef = useRef(statsTab);
  const restoreScrollYRef = useRef<number | null>(null);
  const yearsInitializedRef = useRef(false);

  const viewStateStorageKey = useMemo(
    () => (usabId ? `player-profile:view:${usabId}` : ''),
    [usabId],
  );

  const hasScrollRestore = useMemo(() => {
    if (!viewStateStorageKey) return false;
    try {
      const raw = sessionStorage.getItem(viewStateStorageKey);
      return raw ? JSON.parse(raw)?.restorePending === true : false;
    } catch { return false; }
  }, [viewStateStorageKey]);

  const [trendSentinelRef, trendVisible] = useVisibleOnScroll();
  const [tswSentinelRef, tswVisible] = useVisibleOnScroll();
  const trendTriggered = trendVisible || hasScrollRestore;
  const tswTriggered = tswVisible || hasScrollRestore;

  useEffect(() => {
    expandedYearsRef.current = expandedYears;
  }, [expandedYears]);

  useEffect(() => {
    collapsedTournamentsRef.current = collapsedTournaments;
  }, [collapsedTournaments]);

  useEffect(() => {
    statsTabRef.current = statsTab;
  }, [statsTab]);

  const saveProfileReturnSnapshot = useCallback(() => {
    if (!viewStateStorageKey) return;
    try {
      sessionStorage.setItem(
        viewStateStorageKey,
        JSON.stringify({
          restorePending: true,
          scrollY: window.scrollY,
          expandedYears: [...expandedYearsRef.current],
          collapsedTournaments: [...collapsedTournamentsRef.current],
          statsTab: statsTabRef.current,
        }),
      );
    } catch {
      // Ignore sessionStorage errors.
    }
  }, [viewStateStorageKey]);

  useEffect(() => {
    if (!usabId || !viewStateStorageKey) return;

    try {
      const raw = sessionStorage.getItem(viewStateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        restorePending?: unknown;
        scrollY?: unknown;
        expandedYears?: unknown;
        collapsedTournaments?: unknown;
        statsTab?: unknown;
      };
      if (parsed.restorePending !== true) return;

      const filterStrings = (arr: unknown) =>
        Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];

      const restoredYears = filterStrings(parsed.expandedYears);
      if (restoredYears.length > 0) {
        setExpandedYears(new Set(restoredYears));
        yearsInitializedRef.current = true;
      }
      setCollapsedTournaments(new Set(filterStrings(parsed.collapsedTournaments)));

      if (
        typeof parsed.statsTab === 'string'
        && STATS_TABS.some((tab) => tab.key === parsed.statsTab)
      ) {
        setStatsTab(parsed.statsTab as StatsCategory);
      }
      if (typeof parsed.scrollY === 'number' && Number.isFinite(parsed.scrollY)) {
        restoreScrollYRef.current = parsed.scrollY;
      }
    } catch {
      // Ignore malformed state.
    }
  }, [usabId, viewStateStorageKey]);

  useEffect(() => {
    if (!viewStateStorageKey) return;
    if (restoreScrollYRef.current === null) return;
    if (loadingTsw) return;

    const targetY = restoreScrollYRef.current;
    restoreScrollYRef.current = null;

    requestAnimationFrame(() => {
      window.scrollTo(0, targetY);
      try {
        sessionStorage.removeItem(viewStateStorageKey);
      } catch {
        // Ignore sessionStorage errors.
      }
    });
  }, [loadingTsw, viewStateStorageKey]);

  useEffect(() => {
    if (loadingTsw || yearsInitializedRef.current) return;
    const tby = tswStats?.tournamentsByYear;
    if (!tby) return;
    const bySeason = groupBySeason(tby);
    const seasons = Object.keys(bySeason).sort((a, b) => {
      const aStart = parseInt(a.split('-')[0], 10);
      const bStart = parseInt(b.split('-')[0], 10);
      return bStart - aStart;
    });
    const current = currentSeasonKey();
    const defaultSeason = seasons.includes(current) ? current : seasons[0];
    if (defaultSeason) {
      setExpandedYears(new Set([defaultSeason]));
    }
    yearsInitializedRef.current = true;
  }, [loadingTsw, tswStats]);

  // Player detail fetch (eager — needed for hero card)
  useEffect(() => {
    if (!usabId || !playerName) return;
    if (!rankedPlayer || rankedPlayer.entries.length === 0) return;
    let cancelled = false;
    const best = rankedPlayer.entries.reduce((b, e) => (e.rank < b.rank ? e : b));
    setDetailError(null);
    fetchPlayerDetail(usabId, best.ageGroup, best.eventType)
      .then((d) => { if (!cancelled) setGender(d?.gender ?? null); })
      .catch((err) => {
        if (cancelled) return;
        setDetailError(err instanceof Error ? err.message : 'Could not load player details');
      });
    return () => { cancelled = true; };
  }, [usabId, playerName, rankedPlayer]);

  // TSW stats fetch (lazy — triggered by scroll or scroll-restore)
  useEffect(() => {
    if (!tswTriggered) return;
    if (!usabId || !playerName) {
      if (!loadingAllPlayers && !directoryLoading) setLoadingTsw(false);
      return;
    }
    let cancelled = false;
    setLoadingTsw(true);
    setTswError(null);
    fetchPlayerTswStats(usabId, playerName)
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
  }, [tswTriggered, usabId, playerName, loadingAllPlayers, directoryLoading]);

  // Ranking trend fetch (lazy — triggered by scroll or scroll-restore)
  useEffect(() => {
    if (!trendTriggered) return;
    if (!usabId || !playerName) {
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
  }, [trendTriggered, usabId, playerName, loadingAllPlayers, directoryLoading]);

  if (!usabId) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400 dark:text-slate-500 text-lg">Player not found.</p>
        <Link to="/directory" className="text-violet-600 hover:underline mt-2 inline-block">
          Back to Players
        </Link>
      </div>
    );
  }

  if ((loadingAllPlayers || directoryLoading) && !playerFound) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <RefreshCw className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
        <p className="text-slate-400 dark:text-slate-500 text-sm">Loading player profile…</p>
      </div>
    );
  }

  if (!playerFound) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <Link
          to={backTarget}
          state={backState}
          className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600"
        >
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>
        <div className="py-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-lg">Player USAB #{usabId} not found.</p>
          <a
            href={`https://usabjrrankings.org/${usabId}/details`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 hover:underline mt-2 inline-flex items-center gap-1"
          >
            Search on USAB Rankings <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  const displayName = playerName;
  const entries = rankedPlayer?.entries ?? [];
  const bestEntry = entries.length > 0 ? entries.reduce((b, e) => (e.rank < b.rank ? e : b)) : null;
  const sortedEntries = [...entries].sort((a, b) => {
    const agOrder = AGE_GROUPS.indexOf(a.ageGroup) - AGE_GROUPS.indexOf(b.ageGroup);
    if (agOrder !== 0) return agOrder;
    return EVENT_TYPES.indexOf(a.eventType) - EVENT_TYPES.indexOf(b.eventType);
  });

  const ageGroupSet = [...new Set(entries.map((e) => e.ageGroup))].sort(
    (a, b) => AGE_GROUPS.indexOf(a) - AGE_GROUPS.indexOf(b),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-4 md:space-y-6">
      {/* Back */}
      <Link
        to={backTarget}
        state={backState}
        className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </Link>

      {/* Hero card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 md:p-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6">
          <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br flex items-center justify-center text-xl md:text-2xl font-black text-white shrink-0 ${isRanked ? 'from-violet-500 to-blue-600' : 'from-slate-400 to-slate-500'}`}>
            {displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold mb-1.5 md:mb-2">{displayName}</h1>
            <div className="flex flex-wrap gap-1.5 md:gap-2 mb-1.5 md:mb-2">
              {isRanked ? ageGroupSet.map((ag) => (
                <span
                  key={ag}
                  className={`px-2.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold bg-gradient-to-r ${AGE_GRADIENT[ag]} text-white`}
                >
                  {ag}
                </span>
              )) : (
                <span className="px-2.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold bg-slate-600 text-slate-300">
                  Currently Unranked
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 md:gap-3 text-white/60 text-xs md:text-sm">
              <span>USAB: <span className="font-mono text-white font-semibold">{usabId}</span></span>
              {gender && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>{gender === 'M' ? 'Boy' : gender === 'F' ? 'Girl' : gender}</span>
                </>
              )}
              {isRanked && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>{entries.length} ranked {entries.length === 1 ? 'event' : 'events'}</span>
                </>
              )}
            </div>
            {detailError && (
              <p className="mt-1 text-[11px] text-amber-300">
                Some profile details are unavailable. {detailError}
              </p>
            )}
          </div>

          {bestEntry && (
            <div className="flex gap-5 md:gap-6 text-center shrink-0">
              <div>
                <p className="text-2xl md:text-3xl font-black text-violet-400">#{bestEntry.rank}</p>
                <p className="text-[10px] md:text-xs text-white/50 mt-0.5">Best Rank</p>
              </div>
              <div>
                <p className="text-2xl md:text-3xl font-black">{bestEntry.rankingPoints.toLocaleString()}</p>
                <p className="text-[10px] md:text-xs text-white/50 mt-0.5">Points</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 md:mt-5 flex flex-wrap gap-2 md:gap-3">
          {bestEntry && (
            <a
              href={usabPlayerUrl(usabId, bestEntry.ageGroup, bestEntry.eventType)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs md:text-sm transition-colors"
            >
              <Trophy className="w-3.5 h-3.5 md:w-4 md:h-4" />
              USAB Profile
              <ExternalLink className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-70" />
            </a>
          )}
          <a
            href={tswStats?.tswProfileUrl ?? tswSearchUrl(displayName)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs md:text-sm transition-colors"
          >
            <Activity className="w-3.5 h-3.5 md:w-4 md:h-4" />
            TSW Profile
            <ExternalLink className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-70" />
          </a>
        </div>
      </div>

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
            {/* Tabs */}
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

            {/* Win-Loss section */}
            <div>
              <h5 className="text-[10px] md:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 md:mb-3">Win-Loss</h5>
              <StatsTabContent cat={tswStats[statsTab]} />
            </div>

            {/* History indicators */}
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

      {/* Tournament History from TSW */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
            <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">Tournament History</h2>
          </div>
          <a
            href={tswStats?.tswProfileUrl ? `${tswStats.tswProfileUrl}/tournaments` : tswSearchUrl(displayName)}
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
            <p className="text-slate-400 dark:text-slate-500 text-sm">Loading tournament history…</p>
          </div>
        ) : (() => {
          const tby = tswStats?.tournamentsByYear ?? {};
          const bySeason = groupBySeason(tby);
          const seasons = Object.keys(bySeason).sort((a, b) => {
            const aStart = parseInt(a.split('-')[0], 10);
            const bStart = parseInt(b.split('-')[0], 10);
            return bStart - aStart;
          });

          const filterTournament = (t: TswTournament): TswTournament | null => {
            if (statsTab === 'total') return t;
            const filtered = t.events.filter((e) => e.category === statsTab);
            if (filtered.length === 0) return null;
            return { ...t, events: filtered };
          };

          const hasAny = seasons.some((s) => bySeason[s].some((t) => filterTournament(t)));

          if (!hasAny) {
            return (
              <div className="py-6 md:py-8 text-center space-y-3">
                <Calendar className="w-8 md:w-10 h-8 md:h-10 text-slate-200 dark:text-slate-600 mx-auto" />
                <p className="text-slate-400 dark:text-slate-500 text-sm">
                  No tournament history available{statsTab !== 'total' ? ` for ${STATS_TABS.find((t) => t.key === statsTab)?.label}` : ''}.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-3 md:space-y-4">
              {seasons.map((season) => {
                const filtered = bySeason[season].map(filterTournament).filter(Boolean) as TswTournament[];
                if (filtered.length === 0) return null;
                const seasonExpanded = expandedYears.has(season);
                const seasonWins = filtered.reduce((s, t) => s + t.events.reduce((a, e) => a + e.wins, 0), 0);
                const seasonLosses = filtered.reduce((s, t) => s + t.events.reduce((a, e) => a + e.losses, 0), 0);
                return (
                  <div key={season} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => {
                        setExpandedYears((prev) => {
                          const next = new Set(prev);
                          if (next.has(season)) {
                            next.delete(season);
                          } else {
                            next.add(season);
                            setCollapsedTournaments((ct) => {
                              const updated = new Set(ct);
                              filtered.forEach((_, i) => updated.delete(`${season}-${i}`));
                              return updated;
                            });
                          }
                          return next;
                        });
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 md:px-4 py-2.5 md:py-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform shrink-0 ${seasonExpanded ? 'rotate-0' : '-rotate-90'}`} />
                        <span className="text-sm md:text-base font-bold text-slate-700 dark:text-slate-200">Season {season}</span>
                        <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 font-normal">{filtered.length} {filtered.length === 1 ? 'tournament' : 'tournaments'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] md:text-xs font-semibold text-emerald-600 dark:text-emerald-400">{seasonWins}W</span>
                        <span className="text-[10px] md:text-xs text-slate-300 dark:text-slate-600">-</span>
                        <span className="text-[10px] md:text-xs font-semibold text-rose-600 dark:text-rose-400">{seasonLosses}L</span>
                      </div>
                    </button>
                    {seasonExpanded && (
                      <div className="px-3 md:px-4 py-2.5 md:py-3 space-y-2.5 md:space-y-3">
                        {filtered.map((t, ti) => {
                          const tournKey = `${season}-${ti}`;
                          const matchesForTournament = sortMatchesByDate(
                            (t.matches ?? []).filter(
                              (m) => statsTab === 'total' || m.category === statsTab,
                            ),
                          );
                          const isCollapsed = collapsedTournaments.has(tournKey);
                          const showMatches = !isCollapsed && matchesForTournament.length > 0;
                          return (
                            <div key={ti} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3 md:p-4 hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                              <div className="flex items-start justify-between gap-2 md:gap-3">
                                <div className="min-w-0">
                                  {t.url ? (
                                    <a
                                      href={t.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-orange-600 transition-colors"
                                    >
                                      {t.name}
                                    </a>
                                  ) : (
                                    <p className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-100">{t.name}</p>
                                  )}
                                  <div className="flex flex-wrap gap-x-2 md:gap-x-3 gap-y-0.5 mt-1 text-[10px] md:text-xs text-slate-400 dark:text-slate-500">
                                    {t.dates && <span>{t.dates}</span>}
                                    {t.location && <span className="hidden sm:inline">{t.location}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {t.url && (
                                    <a
                                      href={t.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-orange-500 hover:text-orange-600"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    </a>
                                  )}
                                  {matchesForTournament.length > 0 && (
                                    <button
                                      onClick={() => setCollapsedTournaments((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(tournKey)) next.delete(tournKey);
                                        else next.add(tournKey);
                                        return next;
                                      })}
                                      className="inline-flex items-center gap-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                      title={isCollapsed ? 'Show results' : 'Hide results'}
                                    >
                                      <ChevronDown className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2.5 md:mt-3 flex flex-wrap items-center gap-1.5 md:gap-2">
                                {t.events.map((ev, ei) => {
                                  const total = ev.wins + ev.losses;
                                  const allWins = ev.wins === total;
                                  const allLosses = ev.losses === total;
                                  return (
                                    <span
                                      key={ei}
                                      className={`inline-flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-0.5 md:py-1 rounded-lg text-[10px] md:text-xs font-medium border ${
                                        allWins
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
                                          : allLosses
                                            ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300'
                                            : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300'
                                      }`}
                                    >
                                      {ev.name}
                                      <span className="font-bold">{ev.wins}W-{ev.losses}L</span>
                                    </span>
                                  );
                                })}
                              </div>
                              {showMatches && (
                                <div className="mt-2.5 md:mt-3 pt-2.5 md:pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 md:space-y-2.5">
                                  {matchesForTournament.map((match, mi) => (
                                    <TournamentMatchCard
                                      key={mi}
                                      match={match}
                                      playerName={displayName}
                                      tournamentId={t.tswId}
                                      fromPath={location.pathname}
                                      onBeforePlayerNavigate={saveProfileReturnSnapshot}
                                      location={t.location}
                                      showTournament={false}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
