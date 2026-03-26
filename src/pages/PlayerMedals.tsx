import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Filter, X, Trophy } from 'lucide-react';
import type * as XLSXType from 'xlsx';
import { fetchPlayerMedals } from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';
import MedalIcon from '../components/tournament/MedalIcon';
import type { MedalPlace } from '../components/tournament/MedalIcon';
import type { PlayerMedalsResponse } from '../types/junior';
import { TOURNAMENT_TYPES } from '../types/junior';

const MEDAL_LABELS: Record<string, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze', fourth: '4th' };
const MEDAL_TYPES: MedalPlace[] = ['gold', 'silver', 'bronze', 'fourth'];

type MatchType = 'singles' | 'doubles' | 'mixed';
const MATCH_TYPES: MatchType[] = ['singles', 'doubles', 'mixed'];
const MATCH_TYPE_LABELS: Record<MatchType, string> = { singles: 'Singles', doubles: 'Doubles', mixed: 'Mixed' };

const OTHER_TYPE = 'Other';

const TYPE_COLORS: Record<string, string> = {
  ORC: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  OLC: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  CRC: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  National: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  Selection: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
  JDT: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
};

const MEDAL_CARD_STYLES: Record<MedalPlace, { ring: string; glow: string; bg: string }> = {
  gold:   { ring: 'ring-amber-400/30', glow: 'shadow-amber-500/10', bg: 'from-amber-500/10 to-yellow-500/5' },
  silver: { ring: 'ring-slate-300/30', glow: 'shadow-slate-400/10', bg: 'from-slate-300/10 to-slate-400/5' },
  bronze: { ring: 'ring-orange-400/30', glow: 'shadow-orange-500/10', bg: 'from-orange-500/10 to-amber-600/5' },
  fourth: { ring: 'ring-violet-400/20', glow: 'shadow-violet-500/10', bg: 'from-violet-500/10 to-purple-500/5' },
};

const MEDAL_ACCENT: Record<MedalPlace, string> = {
  gold:   'border-l-amber-400',
  silver: 'border-l-slate-400',
  bronze: 'border-l-orange-400',
  fourth: 'border-l-violet-400',
};

const MEDAL_CHIP_BG: Record<MedalPlace, string> = {
  gold:   'bg-amber-50 border-amber-200/60 dark:bg-amber-950/40 dark:border-amber-800/40',
  silver: 'bg-slate-50 border-slate-200/60 dark:bg-slate-800/60 dark:border-slate-700/40',
  bronze: 'bg-orange-50 border-orange-200/60 dark:bg-orange-950/40 dark:border-orange-800/40',
  fourth: 'bg-violet-50 border-violet-200/60 dark:bg-violet-950/40 dark:border-violet-800/40',
};

function bestMedalPlace(medals: { place: MedalPlace }[]): MedalPlace {
  const order: MedalPlace[] = ['gold', 'silver', 'bronze', 'fourth'];
  for (const p of order) {
    if (medals.some((m) => m.place === p)) return p;
  }
  return 'fourth';
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-medium border transition-all ${
        active
          ? 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-900 dark:border-violet-700 dark:text-violet-300'
          : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

function MedalStatCard({ place, count }: { place: MedalPlace; count: number }) {
  const style = MEDAL_CARD_STYLES[place];
  return (
    <div className={`relative flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${style.bg} backdrop-blur-sm ring-1 ${style.ring} shadow-lg ${style.glow} px-3 py-3 md:px-5 md:py-4 min-w-[70px] md:min-w-[90px]`}>
      <MedalIcon place={place} size={28} />
      <span className="text-xl md:text-2xl font-black text-white mt-1">{count}</span>
      <span className="text-[9px] md:text-[10px] font-medium text-white/50 uppercase tracking-wider">{MEDAL_LABELS[place]}</span>
    </div>
  );
}

function MedalSummaryPill({ place, count }: { place: MedalPlace; count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
      <MedalIcon place={place} size={16} />
      {count}
    </span>
  );
}

function formatDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate) return '—';
  if (endDate && endDate !== startDate) return `${startDate} – ${endDate}`;
  return startDate;
}

export default function PlayerMedals() {
  const { id: usabId } = useParams<{ id: string }>();
  const location = useLocation();
  const { players: allPlayers, directoryPlayers, loading: loadingAllPlayers, directoryLoading } = usePlayers();

  const rankedPlayer = allPlayers.find((p) => p.usabId === usabId) ?? null;
  const dirPlayer = directoryPlayers.find((p) => p.usabId === usabId) ?? null;
  const playerName = (location.state as { name?: string } | null)?.name
    ?? rankedPlayer?.name ?? dirPlayer?.name ?? '';

  const [data, setData] = useState<PlayerMedalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [medalFilter, setMedalFilter] = useState<Set<MedalPlace>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [matchTypeFilter, setMatchTypeFilter] = useState<Set<MatchType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!usabId || !playerName) {
      if (!loadingAllPlayers && !directoryLoading) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPlayerMedals(usabId, playerName)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load medals'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [usabId, playerName, loadingAllPlayers, directoryLoading]);

  const toggleFilter = useCallback(<T,>(_set: Set<T>, setFn: React.Dispatch<React.SetStateAction<Set<T>>>, val: T) => {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  }, []);

  const hasAnyUsab = useMemo(() => data?.tournaments.some((t) => t.isUsab) ?? false, [data]);
  const availableTypes = useMemo(() => {
    if (!data) return [] as string[];
    const usabTypes = new Set(data.tournaments.filter((t) => t.tournamentType).map((t) => t.tournamentType!));
    const known = TOURNAMENT_TYPES.filter((t) => usabTypes.has(t));
    const hasOther = data.tournaments.some((t) => !t.tournamentType);
    return hasOther ? [...known, OTHER_TYPE] : known;
  }, [data]);
  const availableMatchTypes = useMemo(() => {
    if (!data) return [] as MatchType[];
    const cats = new Set(data.tournaments.flatMap((t) => t.medals.map((m) => m.category)));
    return MATCH_TYPES.filter((mt) => cats.has(mt));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.tournaments.filter((t) => {
      if (typeFilter.size > 0) {
        const matchesKnown = t.tournamentType && typeFilter.has(t.tournamentType);
        const matchesOther = typeFilter.has(OTHER_TYPE) && !t.tournamentType;
        if (!matchesKnown && !matchesOther) return false;
      }
      const medalFiltered = medalFilter.size > 0
        ? t.medals.filter((m) => medalFilter.has(m.place))
        : t.medals;
      const matchFiltered = matchTypeFilter.size > 0
        ? medalFiltered.filter((m) => matchTypeFilter.has(m.category as MatchType))
        : medalFiltered;
      return matchFiltered.length > 0;
    }).map((t) => {
      let medals = t.medals;
      if (medalFilter.size > 0) medals = medals.filter((m) => medalFilter.has(m.place));
      if (matchTypeFilter.size > 0) medals = medals.filter((m) => matchTypeFilter.has(m.category as MatchType));
      return medals === t.medals ? t : { ...t, medals };
    });
  }, [data, medalFilter, typeFilter, matchTypeFilter]);

  const hasActiveFilters = medalFilter.size > 0 || typeFilter.size > 0 || matchTypeFilter.size > 0;

  const clearFilters = useCallback(() => {
    setMedalFilter(new Set());
    setTypeFilter(new Set());
    setMatchTypeFilter(new Set());
  }, []);

  const totalMedals = data ? data.summary.gold + data.summary.silver + data.summary.bronze + data.summary.fourth : 0;

  const usabTypeCounts = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const t of data.tournaments) {
      if (!t.isUsab) continue;
      const type = t.tournamentType || 'Other';
      map.set(type, (map.get(type) || 0) + t.medals.length);
    }
    const order = [...TOURNAMENT_TYPES, 'Other'];
    return order.filter((t) => map.has(t)).map((t) => ({ type: t, count: map.get(t)! }));
  }, [data]);

  const filteredSummary = useMemo(() => {
    const s = { gold: 0, silver: 0, bronze: 0, fourth: 0 };
    for (const t of filtered) {
      for (const m of t.medals) s[m.place]++;
    }
    return s;
  }, [filtered]);
  const filteredTotal = filteredSummary.gold + filteredSummary.silver + filteredSummary.bronze + filteredSummary.fourth;

  const handleExport = useCallback(async () => {
    if (!data || filtered.length === 0) return;
    const XLSX: typeof XLSXType = await import('xlsx');
    const rows: Record<string, string>[] = [];
    for (const t of filtered) {
      for (const m of t.medals) {
        rows.push({
          Tournament: t.tournamentName,
          'Start Date': t.startDate ?? '',
          'End Date': t.endDate ?? '',
          Medal: MEDAL_LABELS[m.place] ?? m.place,
          Event: m.event,
          'Match Type': MATCH_TYPE_LABELS[m.category as MatchType] ?? m.category,
          ...(hasAnyUsab ? {
            'USAB Tournament': t.isUsab ? 'Yes' : 'No',
            Type: t.tournamentType ?? OTHER_TYPE,
          } : {}),
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => (r[key] ?? '').length)) + 2,
    }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Medals');
    const safeName = (data.playerName || 'player').replace(/[^a-zA-Z0-9]/g, '-');
    XLSX.writeFile(wb, `${safeName}-medals.xlsx`);
  }, [data, filtered, hasAnyUsab]);

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-4 md:space-y-6">
      {/* Back */}
      <Link
        to={`/directory/${usabId}`}
        className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Profile
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-violet-900 to-purple-900 p-5 md:p-8 text-white">
        <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-purple-400/5 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-lg md:text-xl font-black text-white shadow-lg shadow-violet-500/20 shrink-0">
              {(playerName || '??').split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg md:text-2xl font-bold truncate">
                {playerName || `Player #${usabId}`}
              </h1>
              <p className="text-white/40 text-xs md:text-sm font-medium tracking-wide">Medal Collection</p>
            </div>
          </div>

          {data && totalMedals > 0 && (
            <div className="flex items-center gap-2.5 md:gap-3 md:ml-auto">
              <div className="flex items-center gap-2 mr-2 md:mr-4">
                <Trophy className="w-5 h-5 text-amber-400/80" />
                <span className="text-2xl md:text-3xl font-black">{totalMedals}</span>
              </div>
              {MEDAL_TYPES.map((p) => (
                data.summary[p] > 0 ? <MedalStatCard key={p} place={p} count={data.summary[p]} /> : null
              ))}
            </div>
          )}
        </div>

        {data && totalMedals > 0 && (
          <div className="relative mt-4 pt-4 border-t border-white/10 space-y-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-white/40">
              <span>{data.tournaments.length} {data.tournaments.length === 1 ? 'tournament' : 'tournaments'}</span>
              <span className="hidden sm:inline">·</span>
              <span>{data.tournaments.filter((t) => t.isUsab).length} USAB</span>
            </div>
            {usabTypeCounts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-white/30 uppercase tracking-wider mr-1">USAB</span>
                {usabTypeCounts.map(({ type, count }) => (
                  <span
                    key={type}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold border backdrop-blur-sm ${TYPE_COLORS[type] ?? 'bg-white/5 text-white/60 border-white/10'}`}
                  >
                    {type} <span className="opacity-60">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <RefreshCw className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">Loading medal history…</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-rose-500 text-sm mb-2">Could not load medals.</p>
          <p className="text-slate-400 dark:text-slate-500 text-xs">{error}</p>
        </div>
      ) : data && totalMedals === 0 ? (
        <div className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-8 md:p-14 text-center">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-50/50 to-transparent dark:from-violet-950/20" />
          <div className="relative space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
              <Trophy className="w-7 h-7 text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base font-medium">
              No medals recorded yet
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs max-w-sm mx-auto">
              Medals are earned from tournament finals, semi-finals, and playoff matches. Keep competing!
            </p>
          </div>
        </div>
      ) : data && (
        <>
          {/* Filtered counts */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400 text-xs font-medium">
                Showing {filteredTotal} {filteredTotal === 1 ? 'medal' : 'medals'}:
              </span>
              <MedalSummaryPill place="gold" count={filteredSummary.gold} />
              <MedalSummaryPill place="silver" count={filteredSummary.silver} />
              <MedalSummaryPill place="bronze" count={filteredSummary.bronze} />
              <MedalSummaryPill place="fourth" count={filteredSummary.fourth} />
            </div>
          )}

          {/* Filter bar + Export */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium border transition-colors ${
                hasActiveFilters
                  ? 'bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-950 dark:border-violet-700 dark:text-violet-300'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-bold">
                  {medalFilter.size + typeFilter.size + matchTypeFilter.size}
                </span>
              )}
            </button>

            <button
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Export Excel
            </button>
          </div>

          {showFilters && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 md:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Filter Results</span>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs text-violet-600 hover:underline flex items-center gap-1">
                    <X className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>

              <div>
                <p className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 mb-1.5">Medal Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {MEDAL_TYPES.map((m) => (
                    <FilterPill
                      key={m}
                      label={MEDAL_LABELS[m]}
                      active={medalFilter.has(m)}
                      onClick={() => toggleFilter(medalFilter, setMedalFilter, m)}
                    />
                  ))}
                </div>
              </div>

              {availableMatchTypes.length > 1 && (
                <div>
                  <p className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 mb-1.5">Match Type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableMatchTypes.map((mt) => (
                      <FilterPill
                        key={mt}
                        label={MATCH_TYPE_LABELS[mt]}
                        active={matchTypeFilter.has(mt)}
                        onClick={() => toggleFilter(matchTypeFilter, setMatchTypeFilter, mt)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {availableTypes.length > 0 && (
                <div>
                  <p className="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 mb-1.5">Tournament Type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTypes.map((t) => (
                      <FilterPill
                        key={t}
                        label={t}
                        active={typeFilter.has(t)}
                        onClick={() => toggleFilter(typeFilter, setTypeFilter, t)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 && hasActiveFilters ? (
            <div className="py-8 text-center">
              <p className="text-slate-400 dark:text-slate-500 text-sm">No medals match the current filters.</p>
              <button onClick={clearFilters} className="text-violet-600 hover:underline text-sm mt-2">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-3 md:space-y-4">
              {filtered.map((t, ti) => {
                const accent = MEDAL_ACCENT[bestMedalPlace(t.medals)];
                return (
                  <div
                    key={ti}
                    className={`group relative bg-white dark:bg-slate-900 rounded-xl md:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 border-l-[3px] ${accent} overflow-hidden transition-shadow hover:shadow-md`}
                  >
                    {/* Tournament header */}
                    <div className="px-3.5 pt-3.5 pb-2 md:px-5 md:pt-4 md:pb-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {t.tournamentName}
                          </h3>
                          {t.tswId && t.tswPlayerId && (
                            <Link
                              to={`/tournaments/${t.tswId}/player/${t.tswPlayerId}`}
                              className="text-[10px] md:text-xs text-violet-500 hover:text-violet-600 hover:underline shrink-0 font-medium"
                            >
                              Match details
                            </Link>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
                          <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                            {formatDateRange(t.startDate, t.endDate)}
                          </span>
                          {t.tournamentType && (
                            <span className={`inline-block px-1.5 md:px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold border ${TYPE_COLORS[t.tournamentType] ?? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
                              {t.tournamentType}
                            </span>
                          )}
                          {t.region && (
                            <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500">{t.region}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Medal list */}
                    <div className="px-3.5 pb-3.5 md:px-5 md:pb-4">
                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        {t.medals.map((m, mi) => (
                          <span
                            key={mi}
                            className={`inline-flex items-center gap-1.5 px-2 md:px-2.5 py-1 md:py-1.5 rounded-lg border text-[10px] md:text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors ${MEDAL_CHIP_BG[m.place]}`}
                          >
                            <MedalIcon place={m.place} size={16} />
                            <span className="truncate max-w-[140px] md:max-w-none">{m.event}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
