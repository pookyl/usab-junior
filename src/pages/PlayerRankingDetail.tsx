import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Trophy,
  RefreshCw,
  Medal,
} from 'lucide-react';
import type {
  AgeGroup,
  EventType,
  RankingCategoryDetail,
  RankingTournamentEntry,
  ScheduledTournament,
} from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES, EVENT_LABELS } from '../types/junior';
import {
  fetchPlayerRankingDetail,
  fetchTournaments,
  usabPlayerBaseUrl,
} from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';

const AGE_GRADIENT: Record<string, string> = {
  U11: 'from-violet-500 to-violet-700',
  U13: 'from-blue-500 to-blue-700',
  U15: 'from-emerald-500 to-emerald-700',
  U17: 'from-amber-500 to-amber-600',
  U19: 'from-rose-500 to-rose-700',
};

const AGE_BORDER: Record<string, string> = {
  U11: 'border-violet-200 dark:border-violet-800',
  U13: 'border-blue-200 dark:border-blue-800',
  U15: 'border-emerald-200 dark:border-emerald-800',
  U17: 'border-amber-200 dark:border-amber-800',
  U19: 'border-rose-200 dark:border-rose-800',
};

const AGE_PILL_BG: Record<string, string> = {
  U11: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  U13: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  U15: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  U17: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  U19: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

const AGE_PILL_ACTIVE: Record<string, string> = {
  U11: 'bg-violet-600 text-white dark:bg-violet-500',
  U13: 'bg-blue-600 text-white dark:bg-blue-500',
  U15: 'bg-emerald-600 text-white dark:bg-emerald-500',
  U17: 'bg-amber-600 text-white dark:bg-amber-500',
  U19: 'bg-rose-600 text-white dark:bg-rose-500',
};

type FilterKey = 'all' | `${AgeGroup}-${EventType}`;

function buildTournamentLookup(tournaments: ScheduledTournament[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const t of tournaments) {
    if (!t.tswId) continue;
    const key = t.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    lookup.set(key, t.tswId);
  }
  return lookup;
}

function findTswId(name: string, lookup: Map<string, string>): string | null {
  const key = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const [k, v] of lookup) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

function CategoryCard({
  section,
  tournamentLookup,
}: {
  section: RankingCategoryDetail;
  tournamentLookup: Map<string, string>;
}) {
  const totalPoints = section.rankingPoints || 1;

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border ${AGE_BORDER[section.ageGroup] ?? 'border-slate-200 dark:border-slate-700'} overflow-hidden`}>
      <div className={`bg-gradient-to-r ${AGE_GRADIENT[section.ageGroup] ?? 'from-slate-500 to-slate-700'} px-4 md:px-5 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] md:text-xs font-bold bg-white/20 text-white">
            {section.eventType} {section.ageGroup}
          </span>
          <span className="text-white/70 text-xs hidden sm:inline">
            {EVENT_LABELS[section.eventType as EventType] ?? section.eventType}
          </span>
        </div>
        <div className="flex items-center gap-4 text-white">
          <div className="text-right">
            <span className="text-lg md:text-xl font-black">#{section.rank}</span>
          </div>
          <div className="text-right">
            <span className="text-base md:text-lg font-bold">{section.rankingPoints.toLocaleString()}</span>
            <span className="text-white/60 text-[10px] ml-1">pts</span>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="text-left text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider px-5 py-2.5">Tournament</th>
              <th className="text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 py-2.5 w-24">Position</th>
              <th className="text-right text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider px-5 py-2.5 w-32">Points</th>
            </tr>
          </thead>
          <tbody>
            {section.tournaments.map((t, i) => (
              <TournamentRow key={i} tournament={t} totalPoints={totalPoints} tournamentLookup={tournamentLookup} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
        {section.tournaments.map((t, i) => (
          <TournamentMobileCard key={i} tournament={t} totalPoints={totalPoints} tournamentLookup={tournamentLookup} />
        ))}
      </div>
    </div>
  );
}

function TournamentRow({
  tournament,
  totalPoints,
  tournamentLookup,
}: {
  tournament: RankingTournamentEntry;
  totalPoints: number;
  tournamentLookup: Map<string, string>;
}) {
  const tswId = findTswId(tournament.tournamentName, tournamentLookup);
  const pct = Math.round((tournament.points / totalPoints) * 100);
  const muted = !tournament.contributing;

  return (
    <tr className={`border-b border-slate-50 dark:border-slate-800/50 last:border-0 ${muted ? 'opacity-50' : ''}`}>
      <td className="px-5 py-2.5">
        <div>
          {tswId ? (
            <Link
              to={`/tournaments/${tswId}`}
              className="text-sm text-slate-800 dark:text-slate-200 hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate"
            >
              {tournament.tournamentName}
            </Link>
          ) : (
            <span className="text-sm text-slate-800 dark:text-slate-200 truncate">{tournament.tournamentName}</span>
          )}
        </div>
        {tournament.location && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{tournament.location}</p>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'}`}>
          {tournament.place}
        </span>
      </td>
      <td className="px-5 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${muted ? 'bg-slate-300 dark:bg-slate-600' : 'bg-violet-400 dark:bg-violet-500'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className={`text-sm font-semibold tabular-nums ${muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
            {tournament.points.toLocaleString()}
          </span>
          <span className={`text-[10px] tabular-nums w-8 text-right ${muted ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>
            {pct}%
          </span>
        </div>
      </td>
    </tr>
  );
}

function TournamentMobileCard({
  tournament,
  totalPoints,
  tournamentLookup,
}: {
  tournament: RankingTournamentEntry;
  totalPoints: number;
  tournamentLookup: Map<string, string>;
}) {
  const tswId = findTswId(tournament.tournamentName, tournamentLookup);
  const pct = Math.round((tournament.points / totalPoints) * 100);
  const muted = !tournament.contributing;

  return (
    <div className={`px-4 py-3 ${muted ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div>
            {tswId ? (
              <Link
                to={`/tournaments/${tswId}`}
                className="text-[13px] text-slate-800 dark:text-slate-200 hover:text-violet-600 dark:hover:text-violet-400 transition-colors leading-tight"
              >
                {tournament.tournamentName}
              </Link>
            ) : (
              <span className="text-[13px] text-slate-800 dark:text-slate-200 leading-tight">{tournament.tournamentName}</span>
            )}
          </div>
          {tournament.location && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{tournament.location}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'}`}>
          {tournament.place}
        </span>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${muted ? 'bg-slate-300 dark:bg-slate-600' : 'bg-violet-400 dark:bg-violet-500'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className={`text-sm font-semibold tabular-nums ${muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
            {tournament.points.toLocaleString()}
          </span>
          <span className={`text-[10px] tabular-nums w-8 text-right ${muted ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PlayerRankingDetail() {
  const { id: usabId } = useParams<{ id: string }>();
  const location = useLocation();
  const { players } = usePlayers();

  const [sections, setSections] = useState<RankingCategoryDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [tournamentLookup, setTournamentLookup] = useState<Map<string, string>>(new Map());

  const rankedPlayer = useMemo(
    () => players.find((p) => p.usabId === usabId),
    [players, usabId],
  );
  const playerName = rankedPlayer?.name
    ?? (location.state as { name?: string } | null)?.name
    ?? '';

  useEffect(() => {
    if (!usabId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPlayerRankingDetail(usabId)
      .then((data) => {
        if (!cancelled) setSections(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load ranking details');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [usabId]);

  useEffect(() => {
    let cancelled = false;
    fetchTournaments()
      .then((data) => {
        if (cancelled) return;
        const all = data.tournaments
          ?? Object.values(data.seasons ?? {}).flatMap((s) => s.tournaments);
        setTournamentLookup(buildTournamentLookup(all));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const sortedSections = useMemo(
    () =>
      [...sections].sort((a, b) => {
        const agCmp = AGE_GROUPS.indexOf(a.ageGroup as AgeGroup) - AGE_GROUPS.indexOf(b.ageGroup as AgeGroup);
        if (agCmp !== 0) return agCmp;
        return EVENT_TYPES.indexOf(a.eventType as EventType) - EVENT_TYPES.indexOf(b.eventType as EventType);
      }),
    [sections],
  );

  const filteredSections = useMemo(
    () =>
      filter === 'all'
        ? sortedSections
        : sortedSections.filter((s) => `${s.ageGroup}-${s.eventType}` === filter),
    [sortedSections, filter],
  );

  const categoryKeys = useMemo(
    () => sortedSections.map((s) => `${s.ageGroup}-${s.eventType}` as FilterKey),
    [sortedSections],
  );

  if (!usabId) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400 dark:text-slate-500 text-lg">Player not found.</p>
        <Link to="/directory" className="text-violet-600 hover:underline mt-2 inline-block">
          Back to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-4 md:space-y-5">
      {/* Back link */}
      <Link
        to={`/directory/${usabId}`}
        className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {playerName ? `Back to ${playerName}` : 'Back to Profile'}
      </Link>

      {/* Compact header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 px-4 md:px-5 py-3.5 md:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-sm md:text-base font-black text-white shrink-0">
              {(playerName || usabId).split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {playerName ? `${playerName}'s Ranking Breakdown` : `Ranking Breakdown`}
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                <span>USAB: <span className="font-mono text-slate-600 dark:text-slate-300">{usabId}</span></span>
                {!loading && sections.length > 0 && (
                  <>
                    <span>·</span>
                    <span>{sections.length} ranked {sections.length === 1 ? 'event' : 'events'}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      {!loading && categoryKeys.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
          <button
            onClick={() => setFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            All
          </button>
          {categoryKeys.map((key) => {
            const [ag, et] = key.split('-');
            const isActive = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  isActive
                    ? (AGE_PILL_ACTIVE[ag] ?? 'bg-slate-800 text-white')
                    : (AGE_PILL_BG[ag] ?? 'bg-slate-100 text-slate-600') + ' hover:opacity-80'
                }`}
              >
                {et} {ag}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-16 text-center">
          <RefreshCw className="w-7 h-7 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">Loading ranking details…</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="py-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm mb-2">{error}</p>
          <a
            href={usabPlayerBaseUrl(usabId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 hover:underline text-sm inline-flex items-center gap-1"
          >
            View on USAB Rankings <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sections.length === 0 && (
        <div className="py-16 text-center">
          <Medal className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">No ranking data available.</p>
        </div>
      )}

      {/* Category cards */}
      {!loading && !error && filteredSections.map((section) => (
        <CategoryCard
          key={`${section.ageGroup}-${section.eventType}`}
          section={section}
          tournamentLookup={tournamentLookup}
        />
      ))}

      {/* Footer reference */}
      {!loading && !error && sections.length > 0 && (
        <div className="flex items-center justify-center flex-wrap gap-x-2 gap-y-1 pt-2 pb-4">
          <Trophy className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Data from USAB Junior Rankings
          </span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <a
            href={usabPlayerBaseUrl(usabId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors inline-flex items-center gap-1"
          >
            View original <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <a
            href="https://usabjrrankings.org/show_points_table"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors inline-flex items-center gap-1"
          >
            Points Table <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
