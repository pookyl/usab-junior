import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Download, Filter, X, Trophy } from 'lucide-react';
import type * as XLSXType from 'xlsx';
import { fetchPlayerMedals } from '../services/rankingsService';
import MedalIcon from '../components/tournament/MedalIcon';
import type { MedalPlace } from '../components/tournament/MedalIcon';
import type { PlayerMedalsResponse } from '../types/junior';
import { TOURNAMENT_TYPES } from '../types/junior';
import { usePlayerProfile } from '../components/player/PlayerProfileLayout';

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
  fourth: { ring: 'ring-orange-300/20', glow: 'shadow-orange-400/10', bg: 'from-orange-400/10 to-amber-500/5' },
};

const MEDAL_ACCENT: Record<MedalPlace, string> = {
  gold:   'border-l-amber-400',
  silver: 'border-l-slate-400',
  bronze: 'border-l-orange-400',
  fourth: 'border-l-orange-300',
};

const MEDAL_CHIP_BG: Record<MedalPlace, string> = {
  gold:   'bg-amber-50 border-amber-200/60 dark:bg-amber-950/40 dark:border-amber-800/40',
  silver: 'bg-slate-50 border-slate-200/60 dark:bg-slate-800/60 dark:border-slate-700/40',
  bronze: 'bg-orange-50 border-orange-200/60 dark:bg-orange-950/40 dark:border-orange-800/40',
  fourth: 'bg-orange-50/60 border-orange-200/50 dark:bg-orange-950/30 dark:border-orange-800/30',
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
      <span className="text-xl md:text-2xl font-black text-slate-800 dark:text-white mt-1">{count}</span>
      <span className="text-[9px] md:text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">{MEDAL_LABELS[place]}</span>
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
  const { usabId, displayName: playerName } = usePlayerProfile();

  const [data, setData] = useState<PlayerMedalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [medalFilter, setMedalFilter] = useState<Set<MedalPlace>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [matchTypeFilter, setMatchTypeFilter] = useState<Set<MatchType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [usabOnly, setUsabOnly] = useState(true);

  useEffect(() => {
    if (!usabId || !playerName) {
      setLoading(false);
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
  }, [usabId, playerName]);

  const toggleFilter = useCallback(<T,>(_set: Set<T>, setFn: React.Dispatch<React.SetStateAction<Set<T>>>, val: T) => {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  }, []);

  const hasAnyUsab = useMemo(() => data?.tournaments.some((t) => t.isUsab) ?? false, [data]);
  const effectiveUsabOnly = hasAnyUsab && usabOnly;

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
      if (effectiveUsabOnly && !t.isUsab) return false;
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
  }, [data, medalFilter, typeFilter, matchTypeFilter, effectiveUsabOnly]);

  const hasActiveFilters = medalFilter.size > 0 || typeFilter.size > 0 || matchTypeFilter.size > 0;

  const clearFilters = useCallback(() => {
    setMedalFilter(new Set());
    setTypeFilter(new Set());
    setMatchTypeFilter(new Set());
  }, []);

  const totalMedals = data ? data.summary.gold + data.summary.silver + data.summary.bronze + data.summary.fourth : 0;

  const displaySummary = useMemo(() => {
    if (!data) return { gold: 0, silver: 0, bronze: 0, fourth: 0 };
    if (!effectiveUsabOnly) return data.summary;
    const s = { gold: 0, silver: 0, bronze: 0, fourth: 0 };
    for (const t of data.tournaments) {
      if (!t.isUsab) continue;
      for (const m of t.medals) s[m.place]++;
    }
    return s;
  }, [data, effectiveUsabOnly]);
  const displayTotal = displaySummary.gold + displaySummary.silver + displaySummary.bronze + displaySummary.fourth;

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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Medal summary bar */}
      {data && totalMedals > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-500" />
              <span className="text-2xl md:text-3xl font-black text-slate-800 dark:text-slate-100">{displayTotal}</span>
              <span className="text-sm text-slate-400 dark:text-slate-500">{effectiveUsabOnly ? 'USAB Medals' : 'Medals'}</span>
              {hasAnyUsab && (
                <button
                  onClick={() => setUsabOnly((v) => !v)}
                  className={`ml-1 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-medium border transition-all ${
                    usabOnly
                      ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-300'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                  }`}
                >
                  USAB Only
                </button>
              )}
            </div>
            <div className="flex items-center gap-2.5 md:gap-3">
              {MEDAL_TYPES.map((p) => (
                displaySummary[p] > 0 ? <MedalStatCard key={p} place={p} count={displaySummary[p]} /> : null
              ))}
            </div>
          </div>
          {usabTypeCounts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {data.tournaments.length} tournaments · {data.tournaments.filter((t) => t.isUsab).length} USAB
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {usabTypeCounts.map(({ type, count }) => (
                  <span
                    key={type}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold border ${TYPE_COLORS[type] ?? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}
                  >
                    {type} <span className="opacity-60">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
