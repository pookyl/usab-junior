import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, ChevronDown, ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import type { StatsCategory, TswPlayerStats, TswTournament } from '../types/junior';
import { fetchPlayerTswStats, tswSearchUrl } from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';
import { parseScoreString } from '../utils/playerUtils';
import { usePlayerProfile } from '../components/player/PlayerProfileLayout';

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
    if (!Number.isNaN(d.getTime())) {
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
  const indexed = matches.map((m, i) => ({ m, i, ts: m.date ? new Date(m.date).getTime() : Number.NaN }));
  const hasDate = indexed.some((x) => !Number.isNaN(x.ts));
  if (!hasDate) return matches;
  indexed.sort((a, b) => {
    const aValid = !Number.isNaN(a.ts);
    const bValid = !Number.isNaN(b.ts);
    if (aValid && bValid) return a.ts - b.ts;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return a.i - b.i;
  });
  return indexed.map((x) => x.m);
}

function parseTournamentStartDate(t: TswTournament): number {
  if (t.startDate) {
    const ts = new Date(t.startDate + 'T00:00:00').getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  const d = new Date(t.dates.split(' - ')[0]);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
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

function PlayerNameLinkGroup({
  players,
  tournamentId,
  fromPath,
  className,
}: {
  players: Array<{ name: string; playerId: number | null }>;
  tournamentId?: string;
  fromPath?: string;
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

function TournamentMatchCard({
  match,
  playerName,
  tournamentId,
  fromPath,
  location,
  showTournament = true,
}: {
  match: import('../types/junior').TswMatchResult;
  playerName: string;
  tournamentId?: string;
  fromPath?: string;
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

export default function PlayerTournaments() {
  const { usabId, displayName } = usePlayerProfile();
  const location = useLocation();
  const {
    loading: loadingAllPlayers,
    directoryLoading,
  } = usePlayers();

  const [tswStats, setTswStats] = useState<TswPlayerStats | null>(null);
  const [loadingTsw, setLoadingTsw] = useState(false);
  const [tswError, setTswError] = useState<string | null>(null);
  const [statsTab, setStatsTab] = useState<StatsCategory>('total');
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [collapsedTournaments, setCollapsedTournaments] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!usabId || !displayName) {
      if (!loadingAllPlayers && !directoryLoading) setLoadingTsw(false);
      return;
    }
    let cancelled = false;
    setLoadingTsw(true);
    setTswError(null);
    fetchPlayerTswStats(usabId, displayName)
      .then((data) => {
        if (cancelled) return;
        setTswStats(data);
        setTswError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTswStats(null);
        setTswError(err instanceof Error ? err.message : 'Could not load tournament history');
      })
      .finally(() => {
        if (!cancelled) setLoadingTsw(false);
      });
    return () => {
      cancelled = true;
    };
  }, [usabId, displayName, loadingAllPlayers, directoryLoading]);

  useEffect(() => {
    setCollapsedTournaments(new Set());
    const tby = tswStats?.tournamentsByYear;
    if (!tby) {
      setExpandedYears(new Set());
      return;
    }
    const bySeason = groupBySeason(tby);
    const seasons = Object.keys(bySeason).sort((a, b) => {
      const aStart = parseInt(a.split('-')[0], 10);
      const bStart = parseInt(b.split('-')[0], 10);
      return bStart - aStart;
    });
    const seasonsWithResults = seasons.filter((season) =>
      bySeason[season].some((t) =>
        statsTab === 'total' || t.events.some((e) => e.category === statsTab),
      ),
    );
    const current = currentSeasonKey();
    const defaultSeason = seasonsWithResults.includes(current) ? current : seasonsWithResults[0];
    setExpandedYears(defaultSeason ? new Set([defaultSeason]) : new Set());
  }, [statsTab, tswStats]);

  return (
    <div className="space-y-4 md:space-y-6">
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

        {!loadingTsw && tswStats && tswStats.total.career.total > 0 && (
          <div className="mb-4 flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
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
        )}

        {loadingTsw ? (
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
                  {tswError
                    ? `Tournament history could not be loaded: ${tswError}`
                    : `No tournament history available${statsTab !== 'total' ? ` for ${STATS_TABS.find((t) => t.key === statsTab)?.label}` : ''}.`}
                </p>
                {!tswError ? null : (
                  <a
                    href={tswSearchUrl(displayName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm hover:bg-orange-600 transition-colors"
                  >
                    Search on TournamentSoftware <ExternalLink className="w-4 h-4" />
                  </a>
                )}
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
