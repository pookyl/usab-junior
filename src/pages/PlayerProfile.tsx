import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Trophy,
  RefreshCw,
  Calendar,
  TrendingUp,
  Award,
  Activity,
  ChevronDown,
} from 'lucide-react';
import type {
  AgeGroup,
  PlayerEntry,
  TswPlayerStats,
  TswTournament,
  CategoryStats,
  StatsCategory,
} from '../types/junior';
import { EVENT_LABELS, AGE_GROUPS, EVENT_TYPES } from '../types/junior';
import {
  fetchPlayerDetail,
  fetchPlayerTswStats,
  usabPlayerUrl,
  tswSearchUrl,
} from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';

const AGE_GRADIENT: Record<AgeGroup, string> = {
  U11: 'from-violet-500 to-violet-700',
  U13: 'from-blue-500 to-blue-700',
  U15: 'from-emerald-500 to-emerald-700',
  U17: 'from-amber-500 to-amber-600',
  U19: 'from-rose-500 to-rose-700',
};

const AGE_BORDER: Record<AgeGroup, string> = {
  U11: 'border-violet-200 hover:border-violet-400',
  U13: 'border-blue-200 hover:border-blue-400',
  U15: 'border-emerald-200 hover:border-emerald-400',
  U17: 'border-amber-200 hover:border-amber-400',
  U19: 'border-rose-200 hover:border-rose-400',
};

const AGE_TEXT: Record<AgeGroup, string> = {
  U11: 'text-violet-600',
  U13: 'text-blue-600',
  U15: 'text-emerald-600',
  U17: 'text-amber-600',
  U19: 'text-rose-600',
};

function RankingCard({ entry }: { entry: PlayerEntry }) {
  return (
    <div className={`bg-white rounded-xl border ${AGE_BORDER[entry.ageGroup]} p-3 md:p-4`}>
      <div className="flex items-center justify-between mb-1.5 md:mb-2">
        <span className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold bg-gradient-to-r ${AGE_GRADIENT[entry.ageGroup]} text-white`}>
          {entry.ageGroup} {entry.eventType}
        </span>
        <span className={`text-xl md:text-2xl font-black ${AGE_TEXT[entry.ageGroup]}`}>
          #{entry.rank}
        </span>
      </div>
      <p className="text-[10px] md:text-xs text-slate-400">{EVENT_LABELS[entry.eventType]}</p>
      <div className="mt-1.5 md:mt-2 flex items-baseline gap-1">
        <span className="text-base md:text-lg font-bold text-slate-800">
          {entry.rankingPoints.toLocaleString()}
        </span>
        <span className="text-[10px] md:text-xs text-slate-400">pts</span>
      </div>
    </div>
  );
}

function WinLossBar({ wins, losses, pct }: { wins: number; losses: number; pct: number }) {
  const total = wins + losses;
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <span className="text-xs md:text-sm font-medium text-slate-700 whitespace-nowrap">
        {wins} / {losses} ({total})
      </span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] md:text-xs font-medium text-slate-400 whitespace-nowrap">{pct}%</span>
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
        <span className="text-xs md:text-sm text-slate-500 w-16 md:w-20 shrink-0">Career</span>
        <div className="flex-1">
          <WinLossBar wins={cat.career.wins} losses={cat.career.losses} pct={cat.career.winPct} />
        </div>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <span className="text-xs md:text-sm text-slate-500 w-16 md:w-20 shrink-0">This year</span>
        <div className="flex-1">
          <WinLossBar wins={cat.thisYear.wins} losses={cat.thisYear.losses} pct={cat.thisYear.winPct} />
        </div>
      </div>
    </div>
  );
}

function PlayerNameLink({
  name,
  nameMap,
  currentUsabId,
  className,
}: {
  name: string;
  nameMap: Map<string, string>;
  currentUsabId: string;
  className?: string;
}) {
  const parts = name.split(/\s*\/\s*/);
  return (
    <>
      {parts.map((part, i) => {
        const trimmed = part.trim();
        const foundId = nameMap.get(trimmed.toLowerCase());
        return (
          <span key={i}>
            {i > 0 && ' / '}
            {foundId && foundId !== currentUsabId ? (
              <Link
                to={`/directory/${foundId}`}
                className={`no-underline hover:text-violet-600 transition-colors ${className ?? ''}`}
                onClick={(e) => e.stopPropagation()}
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

export default function PlayerProfile() {
  const { id: usabId } = useParams<{ id: string }>();
  const { players: allPlayers, loading: loadingAllPlayers, playerNameMap } = usePlayers();

  const player = allPlayers.find((p) => p.usabId === usabId) ?? null;
  const [gender, setGender] = useState<string | null>(null);
  const [tswStats, setTswStats] = useState<TswPlayerStats | null>(null);
  const [loadingTsw, setLoadingTsw] = useState(true);
  const [statsTab, setStatsTab] = useState<StatsCategory>('total');
  const [expandedTournaments, setExpandedTournaments] = useState<Set<string>>(new Set());

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [usabId]);

  useEffect(() => {
    if (!usabId || !player) {
      setLoadingTsw(false);
      return;
    }

    setLoadingTsw(true);
    fetchPlayerTswStats(usabId, player.name)
      .then(setTswStats)
      .catch(() => setTswStats(null))
      .finally(() => setLoadingTsw(false));

    const best = player.entries.reduce((b, e) => (e.rank < b.rank ? e : b));
    fetchPlayerDetail(usabId, best.ageGroup, best.eventType)
      .then((d) => setGender(d?.gender ?? null))
      .catch(() => {});
  }, [usabId, player]);

  if (!usabId) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400 text-lg">Player not found.</p>
        <Link to="/directory" className="text-violet-600 hover:underline mt-2 inline-block">
          Back to Players
        </Link>
      </div>
    );
  }

  if (loadingAllPlayers && !player) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <RefreshCw className="w-8 h-8 text-slate-300 animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Loading player profile…</p>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <Link
          to="/directory"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Players
        </Link>
        <div className="py-16 text-center">
          <p className="text-slate-400 text-lg">Player USAB #{usabId} not found in current rankings.</p>
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

  const displayName = player.name;
  const bestEntry = player.entries.reduce((b, e) => (e.rank < b.rank ? e : b));
  const sortedEntries = [...player.entries].sort((a, b) => {
    const agOrder = AGE_GROUPS.indexOf(a.ageGroup) - AGE_GROUPS.indexOf(b.ageGroup);
    if (agOrder !== 0) return agOrder;
    return EVENT_TYPES.indexOf(a.eventType) - EVENT_TYPES.indexOf(b.eventType);
  });

  const ageGroupSet = [...new Set(player.entries.map((e) => e.ageGroup))].sort(
    (a, b) => AGE_GROUPS.indexOf(a) - AGE_GROUPS.indexOf(b),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-4 md:space-y-6">
      {/* Back */}
      <Link
        to="/directory"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Players
      </Link>

      {/* Hero card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 md:p-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-xl md:text-2xl font-black text-white shrink-0">
            {displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold mb-1.5 md:mb-2">{displayName}</h1>
            <div className="flex flex-wrap gap-1.5 md:gap-2 mb-1.5 md:mb-2">
              {ageGroupSet.map((ag) => (
                <span
                  key={ag}
                  className={`px-2.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold bg-gradient-to-r ${AGE_GRADIENT[ag]} text-white`}
                >
                  {ag}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 md:gap-3 text-white/60 text-xs md:text-sm">
              <span>USAB: <span className="font-mono text-white font-semibold">{usabId}</span></span>
              {gender && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>{gender === 'M' ? 'Boy' : gender === 'F' ? 'Girl' : gender}</span>
                </>
              )}
              <span className="hidden sm:inline">·</span>
              <span>{player.entries.length} ranked {player.entries.length === 1 ? 'event' : 'events'}</span>
            </div>
          </div>

          <div className="flex gap-5 md:gap-6 text-center shrink-0">
            <div>
              <p className="text-2xl md:text-3xl font-black text-violet-400">#{bestEntry.rank}</p>
              <p className="text-[10px] md:text-xs text-white/50 mt-0.5">Best Rank</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-black">{bestEntry.rankingPoints.toLocaleString()}</p>
              <p className="text-[10px] md:text-xs text-white/50 mt-0.5">Top Points</p>
            </div>
          </div>
        </div>

        <div className="mt-4 md:mt-5 flex flex-wrap gap-2 md:gap-3">
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

      {/* Rankings overview */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <Award className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
          <h2 className="text-base md:text-lg font-semibold text-slate-800">Rankings Overview</h2>
        </div>
        <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4">
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

      {/* Match Statistics from TSW */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
            <h2 className="text-base md:text-lg font-semibold text-slate-800">Statistics</h2>
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

        {loadingTsw ? (
          <div className="py-8 md:py-10 text-center">
            <RefreshCw className="w-7 h-7 text-slate-300 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Fetching match statistics…</p>
          </div>
        ) : tswStats && tswStats.total.career.total > 0 ? (
          <div className="space-y-5 md:space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {STATS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatsTab(tab.key)}
                  className={`flex-1 px-2 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-all ${
                    statsTab === tab.key
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Win-Loss section */}
            <div>
              <h5 className="text-[10px] md:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 md:mb-3">Win-Loss</h5>
              <StatsTabContent cat={tswStats[statsTab]} />
            </div>

            {/* History indicators */}
            {statsTab === 'total' && tswStats.recentHistory.length > 0 && (
              <div>
                <h5 className="text-[10px] md:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 md:mb-3">History</h5>
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

            {/* Recent results */}
            {(() => {
              const filtered = statsTab === 'total'
                ? tswStats.recentResults
                : tswStats.recentResults.filter((m) => m.category === statsTab);
              if (filtered.length === 0) return null;
              return (
                <div>
                  <h5 className="text-[10px] md:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 md:mb-3">
                    Recent Results{statsTab !== 'total' ? ` — ${STATS_TABS.find((t) => t.key === statsTab)?.label}` : ''}
                  </h5>
                  <div className="space-y-1.5 md:space-y-2">
                    {filtered.slice(0, 15).map((match, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg border ${
                          match.won
                            ? 'bg-emerald-50 border-emerald-100'
                            : 'bg-rose-50 border-rose-100'
                        }`}
                      >
                        <span
                          className={`px-1.5 md:px-2 py-0.5 rounded text-[10px] md:text-xs font-bold shrink-0 ${
                            match.won
                              ? 'bg-emerald-500 text-white'
                              : 'bg-rose-500 text-white'
                          }`}
                        >
                          {match.won ? 'W' : 'L'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs md:text-sm font-medium text-slate-700 truncate">
                            vs.{' '}
                            <PlayerNameLink
                              name={match.opponent}
                              nameMap={playerNameMap}
                              currentUsabId={usabId}
                              className="text-slate-700 hover:text-violet-600"
                            />
                          </p>
                          {match.partner && (
                            <p className="text-[10px] md:text-xs text-blue-500 truncate">
                              w/{' '}
                              <PlayerNameLink
                                name={match.partner}
                                nameMap={playerNameMap}
                                currentUsabId={usabId}
                                className="text-blue-500 hover:text-violet-600"
                              />
                            </p>
                          )}
                          <p className="text-[10px] md:text-xs text-slate-400 truncate">
                            {match.tournament}
                            {match.event && ` · ${match.event}`}
                            {match.round && ` · ${match.round}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs md:text-sm font-mono font-medium text-slate-600">
                            {match.score}
                          </p>
                          {match.date && (
                            <p className="text-[9px] md:text-[10px] text-slate-400">{match.date}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="py-6 md:py-8 text-center space-y-3">
            <Activity className="w-8 md:w-10 h-8 md:h-10 text-slate-200 mx-auto" />
            <p className="text-slate-400 text-sm">
              Match statistics could not be loaded automatically.
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
            <h2 className="text-base md:text-lg font-semibold text-slate-800">Tournament History</h2>
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

        {loadingTsw ? (
          <div className="py-8 md:py-10 text-center">
            <RefreshCw className="w-7 h-7 text-slate-300 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Loading tournament history…</p>
          </div>
        ) : (() => {
          const tby = tswStats?.tournamentsByYear ?? {};
          const years = Object.keys(tby).sort((a, b) => Number(b) - Number(a));

          const filterTournament = (t: TswTournament): TswTournament | null => {
            if (statsTab === 'total') return t;
            const filtered = t.events.filter((e) => e.category === statsTab);
            if (filtered.length === 0) return null;
            return { ...t, events: filtered };
          };

          const hasAny = years.some((y) => tby[y].some((t) => filterTournament(t)));

          if (!hasAny) {
            return (
              <div className="py-6 md:py-8 text-center space-y-3">
                <Calendar className="w-8 md:w-10 h-8 md:h-10 text-slate-200 mx-auto" />
                <p className="text-slate-400 text-sm">
                  No tournament history available{statsTab !== 'total' ? ` for ${STATS_TABS.find((t) => t.key === statsTab)?.label}` : ''}.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-5 md:space-y-6">
              {years.map((year) => {
                const filtered = tby[year].map(filterTournament).filter(Boolean) as TswTournament[];
                if (filtered.length === 0) return null;
                return (
                  <div key={year}>
                    <h3 className="text-xs md:text-sm font-bold text-slate-600 mb-2.5 md:mb-3 flex items-center gap-2">
                      <span className="px-2 md:px-2.5 py-0.5 bg-slate-100 rounded-full">{year}</span>
                      <span className="text-slate-400 font-normal">{filtered.length} {filtered.length === 1 ? 'tournament' : 'tournaments'}</span>
                    </h3>
                    <div className="space-y-2.5 md:space-y-3">
                      {filtered.map((t, ti) => {
                        const tournKey = `${year}-${ti}`;
                        const isExpanded = expandedTournaments.has(tournKey);
                        const matchesForTournament = (t.matches ?? []).filter(
                          (m) => statsTab === 'total' || m.category === statsTab,
                        );
                        return (
                          <div key={ti} className="border border-slate-100 rounded-xl p-3 md:p-4 hover:border-slate-200 transition-colors">
                            <div className="flex items-start justify-between gap-2 md:gap-3">
                              <div className="min-w-0">
                                {t.url ? (
                                  <a
                                    href={t.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs md:text-sm font-semibold text-slate-800 hover:text-orange-600 transition-colors"
                                  >
                                    {t.name}
                                  </a>
                                ) : (
                                  <p className="text-xs md:text-sm font-semibold text-slate-800">{t.name}</p>
                                )}
                                <div className="flex flex-wrap gap-x-2 md:gap-x-3 gap-y-0.5 mt-1 text-[10px] md:text-xs text-slate-400">
                                  {t.dates && <span>{t.dates}</span>}
                                  {t.location && <span className="hidden sm:inline">{t.location}</span>}
                                </div>
                              </div>
                              {t.url && (
                                <a
                                  href={t.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 text-orange-500 hover:text-orange-600"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                </a>
                              )}
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
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : allLosses
                                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                                          : 'bg-slate-50 border-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {ev.name}
                                    <span className="font-bold">{ev.wins}W-{ev.losses}L</span>
                                  </span>
                                );
                              })}
                              {matchesForTournament.length > 0 && (
                                <button
                                  onClick={() => setExpandedTournaments((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(tournKey)) next.delete(tournKey);
                                    else next.add(tournKey);
                                    return next;
                                  })}
                                  className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 md:py-1 rounded-lg text-[10px] md:text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                  {isExpanded ? 'Hide' : 'Results'}
                                  <ChevronDown className={`w-3 h-3 md:w-3.5 md:h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </div>
                            {isExpanded && matchesForTournament.length > 0 && (
                              <div className="mt-2.5 md:mt-3 pt-2.5 md:pt-3 border-t border-slate-100 space-y-1 md:space-y-1.5">
                                {matchesForTournament.map((match, mi) => (
                                  <div
                                    key={mi}
                                    className={`flex items-center gap-2 md:gap-2.5 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg text-[10px] md:text-xs ${
                                      match.won
                                        ? 'bg-emerald-50/60'
                                        : 'bg-rose-50/60'
                                    }`}
                                  >
                                    <span
                                      className={`px-1 md:px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-bold shrink-0 ${
                                        match.won ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                                      }`}
                                    >
                                      {match.won ? 'W' : 'L'}
                                    </span>
                                    <span className="text-slate-500 shrink-0 hidden sm:inline">{match.event}</span>
                                    <span className="text-slate-600 font-medium truncate">
                                      vs.{' '}
                                      <PlayerNameLink
                                        name={match.opponent}
                                        nameMap={playerNameMap}
                                        currentUsabId={usabId}
                                        className="text-slate-600 hover:text-violet-600"
                                      />
                                    </span>
                                    {match.partner && (
                                      <span className="text-blue-500 truncate hidden sm:inline">
                                        w/{' '}
                                        <PlayerNameLink
                                          name={match.partner}
                                          nameMap={playerNameMap}
                                          currentUsabId={usabId}
                                          className="text-blue-500 hover:text-violet-600"
                                        />
                                      </span>
                                    )}
                                    <span className="ml-auto font-mono text-slate-600 shrink-0">{match.score}</span>
                                    {match.round && (
                                      <span className="text-slate-400 shrink-0 hidden sm:inline">{match.round}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
