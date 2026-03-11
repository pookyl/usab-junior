import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Swords, Search, RefreshCw, Trophy, ExternalLink, TrendingUp,
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
  AgeGroup, EventType, UniquePlayer, PlayerEntry, PlayerRankingTrend,
  H2HResult, H2HMatch,
  TswPlayerStats, TswMatchResult, StatsCategory,
} from '../types/junior';
import { AGE_GROUPS, EVENT_LABELS } from '../types/junior';
import { usePlayers } from '../contexts/PlayersContext';
import {
  fetchH2H, fetchPlayerTswStats, fetchPlayerRankingTrend, tswH2HUrl, tswSearchUrl,
} from '../services/rankingsService';

type Gender = 'Boy' | 'Girl' | 'All';

const AGE_COLORS: Record<AgeGroup, string> = {
  U11: 'bg-violet-600',
  U13: 'bg-blue-600',
  U15: 'bg-emerald-600',
  U17: 'bg-amber-500',
  U19: 'bg-rose-600',
};

const PLAYER_A_HEX = '#8b5cf6';
const PLAYER_B_HEX = '#3b82f6';

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}


function inferGender(entries: PlayerEntry[]): Gender | null {
  for (const e of entries) {
    if (e.eventType === 'BS' || e.eventType === 'BD') return 'Boy';
    if (e.eventType === 'GS' || e.eventType === 'GD') return 'Girl';
  }
  return null;
}

function entriesForAge(player: UniquePlayer, ageGroup: AgeGroup | null): PlayerEntry[] {
  const filtered = ageGroup
    ? player.entries.filter((e) => e.ageGroup === ageGroup)
    : player.entries;
  return [...filtered].sort((a, b) => a.rank - b.rank);
}

function bestEntry(player: UniquePlayer, ageGroup: AgeGroup | null): PlayerEntry | null {
  const entries = entriesForAge(player, ageGroup);
  return entries.length > 0 ? entries[0] : null;
}

export function eventCategory(event: string): 'Singles' | 'Doubles' | 'Mixed' {
  const e = event.toUpperCase();
  if (e.includes('XD') || e.includes('MIXED')) return 'Mixed';
  if (e.includes('BD') || e.includes('GD') || e.includes('DOUBLES')) return 'Doubles';
  return 'Singles';
}

function parseMatchDate(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// 3 = exact, 2 = substring, 1 = last-name-only, 0 = no match
export function playerMatchScore(playerName: string, teamPlayers: string[]): number {
  const pLower = playerName.toLowerCase().trim();
  const pLast = pLower.split(' ').pop() ?? '';
  let best = 0;
  for (const tp of teamPlayers) {
    const tpLower = tp.toLowerCase().trim();
    if (tpLower === pLower) return 3;
    if (tpLower.includes(pLower) || pLower.includes(tpLower)) best = Math.max(best, 2);
    const tpLast = tpLower.split(' ').pop() ?? '';
    if (pLast.length > 1 && tpLast === pLast) best = Math.max(best, 1);
  }
  return best;
}

export function normalizeMatch(match: H2HMatch, playerAName: string): H2HMatch {
  const score1 = playerMatchScore(playerAName, match.team1Players);
  const score2 = playerMatchScore(playerAName, match.team2Players);
  if (score1 >= score2 && score1 > 0) return match;
  if (score2 > score1 && score2 > 0) {
    return {
      ...match,
      team1Players: match.team2Players,
      team2Players: match.team1Players,
      team1Won: match.team2Won,
      team2Won: match.team1Won,
      scores: match.scores.map(([a, b]) => [b, a]),
    };
  }
  return match;
}

export function parseScoreString(score: string): number[][] {
  if (!score || score === 'Walkover') return [];
  return score.split(',').map((s) => s.trim()).filter(Boolean).map((game) => {
    const parts = game.split('-').map((n) => parseInt(n.trim(), 10));
    return parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) ? parts : [];
  }).filter((g) => g.length === 2);
}

function matchResultToH2HMatch(
  mr: TswMatchResult,
  playerName: string,
): H2HMatch {
  const playerTeam = mr.partner ? [playerName, mr.partner] : [playerName];
  const opponentTeam = mr.opponent.split(' / ').map((s) => s.trim());
  return {
    tournament: mr.tournament,
    tournamentUrl: mr.tournamentUrl ?? '',
    event: mr.event,
    round: mr.round,
    duration: '',
    team1Players: mr.won ? playerTeam : opponentTeam,
    team2Players: mr.won ? opponentTeam : playerTeam,
    team1Won: mr.won,
    team2Won: !mr.won,
    scores: parseScoreString(mr.score),
    date: mr.date,
    venue: '',
  };
}

export function opponentMatches(
  mr: TswMatchResult,
  playerBName: string,
): boolean {
  const bLower = playerBName.toLowerCase().trim();
  return mr.opponent.toLowerCase().split('/').some((part) => part.trim() === bLower);
}

export function findMatchesBetween(
  statsA: TswPlayerStats | null,
  playerAName: string,
  playerBName: string,
): H2HMatch[] {
  if (!statsA) return [];
  return statsA.recentResults
    .filter((mr) => opponentMatches(mr, playerBName))
    .map((mr) => matchResultToH2HMatch(mr, playerAName));
}

// ── PlayerPicker ─────────────────────────────────────────────────────────────

interface PlayerPickerProps {
  label: string;
  accent: 'violet' | 'blue';
  players: UniquePlayer[];
  selected: UniquePlayer | null;
  onSelect: (p: UniquePlayer | null) => void;
  loading: boolean;
  exclude: string | null;
  ageGroup: AgeGroup | null;
}

function PlayerPicker({ label, accent, players, selected, onSelect, loading, exclude, ageGroup }: PlayerPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    const pool = players.filter((p) => p.usabId !== exclude);
    if (!query) return pool;
    const q = query.toLowerCase();
    return pool.filter((p) => p.name.toLowerCase().includes(q) || p.usabId.includes(q));
  }, [players, query, exclude]);

  const isViolet = accent === 'violet';
  const avatarBg = isViolet ? 'bg-violet-600' : 'bg-blue-600';
  const ringColor = isViolet ? 'focus:ring-violet-400 dark:focus:ring-violet-600' : 'focus:ring-blue-400 dark:focus:ring-blue-600';
  const selectedBorder = isViolet ? 'border-violet-200' : 'border-blue-200';
  const itemHover = isViolet ? 'hover:bg-violet-50 active:bg-violet-50 dark:hover:bg-violet-900/40 dark:active:bg-violet-900/40' : 'hover:bg-blue-50 active:bg-blue-50 dark:hover:bg-blue-900/40 dark:active:bg-blue-900/40';

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </label>

      {selected ? (
        <div className={`flex items-center gap-2.5 md:gap-3 p-3 md:p-3.5 bg-white dark:bg-slate-900 border-2 ${selectedBorder} rounded-xl`}>
          <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl ${avatarBg} flex items-center justify-center text-white font-black text-xs md:text-sm shrink-0`}>
            {selected.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{selected.name}</p>
              <Link
                to={`/directory/${selected.usabId}`}
                className="text-violet-500 hover:text-violet-700 shrink-0"
                title="View profile"
              >
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-1 md:gap-1.5 mt-1">
              {entriesForAge(selected, ageGroup).slice(0, 3).map((e) => (
                <span
                  key={`${e.ageGroup}-${e.eventType}`}
                  className="text-[10px] font-medium px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded"
                >
                  {!ageGroup ? `${e.ageGroup} ` : ''}{EVENT_LABELS[e.eventType].split(' ')[1]} #{e.rank}
                </span>
              ))}
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">ID {selected.usabId}</span>
            </div>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors shrink-0"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={loading ? 'Loading players…' : `Search by name or USAB ID…`}
              value={query}
              disabled={loading}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              className={`w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 ${ringColor} bg-white dark:bg-slate-900 disabled:opacity-60`}
            />
            {loading && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-slate-600 animate-spin" />
            )}
          </div>

          {open && !loading && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-80 md:max-h-96 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-sm">No players found</div>
              ) : (
                filtered.map((p) => {
                  const best = bestEntry(p, ageGroup);
                  const ageEntries = entriesForAge(p, ageGroup);
                  return (
                    <button
                      key={p.usabId}
                      onClick={() => { onSelect(p); setQuery(''); setOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 ${itemHover} flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0`}
                    >
                        <span className="text-xs text-slate-400 dark:text-slate-500 w-8 text-right font-mono shrink-0">
                        {best ? `#${best.rank}` : '—'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                        <div className="flex gap-1.5 mt-0.5 flex-wrap">
                          {ageEntries.slice(0, 3).map((e) => (
                            <span key={`${e.ageGroup}-${e.eventType}`} className="text-[10px] text-slate-400 dark:text-slate-500">
                              {!ageGroup ? `${e.ageGroup} ` : ''}{e.eventType} #{e.rank}
                            </span>
                          ))}
                          {ageEntries.length > 3 && (
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">+{ageEntries.length - 3}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MatchCard ────────────────────────────────────────────────────────────────

function PlayerNameLinks({
  players,
  playerLookup,
  colorClass,
}: {
  players: string[];
  playerLookup: Map<string, string>;
  colorClass: string;
}) {
  return (
    <span className={`text-xs md:text-sm truncate ${colorClass}`}>
      {players.map((name, i) => {
        const usabId = playerLookup.get(name.toLowerCase().trim());
        return (
          <span key={i}>
            {i > 0 && ' / '}
            {usabId ? (
              <Link
                to={`/directory/${usabId}`}
                className="hover:underline"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </span>
        );
      })}
    </span>
  );
}

function MatchCard({ match, playerLookup }: { match: H2HMatch; playerLookup: Map<string, string> }) {
  const cat = eventCategory(match.event);
  const tswBase = 'https://www.tournamentsoftware.com';
  const tournamentHref = match.tournamentUrl
    ? (match.tournamentUrl.startsWith('http') ? match.tournamentUrl : `${tswBase}${match.tournamentUrl}`)
    : '';

  return (
    <div className={`border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${
      match.team1Won
        ? 'border-l-4 border-l-violet-400 border-t-slate-100 dark:border-t-slate-800 border-r-slate-100 dark:border-r-slate-800 border-b-slate-100 dark:border-b-slate-800'
        : match.team2Won
        ? 'border-l-4 border-l-blue-400 border-t-slate-100 dark:border-t-slate-800 border-r-slate-100 dark:border-r-slate-800 border-b-slate-100 dark:border-b-slate-800'
        : 'border-slate-100 dark:border-slate-800'
    }`}>
      <div className="bg-slate-50 dark:bg-slate-800/50 px-3 md:px-4 py-2 md:py-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            cat === 'Singles'
              ? 'bg-green-100 text-green-700'
              : cat === 'Doubles'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-purple-100 text-purple-700'
          }`}>
            {match.event}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{match.round}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 min-w-0">
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
      </div>

      <div className="px-3 md:px-4 py-2.5 md:py-3">
        <div className={`flex items-center gap-2 md:gap-3 py-1 md:py-1.5 ${match.team1Won ? 'font-bold' : ''}`}>
          <span className={`w-5 h-5 md:w-6 md:h-6 rounded-md flex items-center justify-center text-[10px] md:text-xs font-bold text-white shrink-0 ${
            match.team1Won ? 'bg-violet-500' : 'bg-slate-300'
          }`}>
            {match.team1Won ? 'W' : 'L'}
          </span>
          <div className="flex-1 min-w-0">
            <PlayerNameLinks
              players={match.team1Players}
              playerLookup={playerLookup}
              colorClass={match.team1Won ? 'text-violet-700' : 'text-slate-600 dark:text-slate-300'}
            />
          </div>
          <div className="flex gap-1.5 md:gap-2 shrink-0">
            {match.scores.length > 0 ? match.scores.map(([a, b], i) => (
              <span key={i} className={`text-xs md:text-sm font-mono tabular-nums ${
                a > b
                  ? `${match.team1Won ? 'text-violet-700' : 'text-blue-700'} font-bold`
                  : 'text-slate-600 dark:text-slate-300 font-normal'
              }`}>
                {a}
              </span>
            )) : !match.team1Won ? (
              <span className="text-xs md:text-sm font-normal text-slate-400 dark:text-slate-500">Walkover</span>
            ) : null}
          </div>
        </div>

        <div className={`flex items-center gap-2 md:gap-3 py-1 md:py-1.5 ${match.team2Won ? 'font-bold' : ''}`}>
          <span className={`w-5 h-5 md:w-6 md:h-6 rounded-md flex items-center justify-center text-[10px] md:text-xs font-bold text-white shrink-0 ${
            match.team2Won ? 'bg-blue-500' : 'bg-slate-300'
          }`}>
            {match.team2Won ? 'W' : 'L'}
          </span>
          <div className="flex-1 min-w-0">
            <PlayerNameLinks
              players={match.team2Players}
              playerLookup={playerLookup}
              colorClass={match.team2Won ? 'text-blue-700' : 'text-slate-600 dark:text-slate-300'}
            />
          </div>
          <div className="flex gap-1.5 md:gap-2 shrink-0">
            {match.scores.length > 0 ? match.scores.map(([a, b], i) => (
              <span key={i} className={`text-xs md:text-sm font-mono tabular-nums ${
                b > a
                  ? `${match.team1Won ? 'text-violet-700' : 'text-blue-700'} font-bold`
                  : 'text-slate-600 dark:text-slate-300 font-normal'
              }`}>
                {b}
              </span>
            )) : !match.team2Won ? (
              <span className="text-xs md:text-sm font-normal text-slate-400 dark:text-slate-500">Walkover</span>
            ) : null}
          </div>
        </div>

        {(match.date || match.venue || match.duration) && (
          <div className="mt-1.5 md:mt-2 pt-1.5 md:pt-2 border-t border-slate-50 dark:border-slate-800 flex items-center gap-2 text-[10px] md:text-xs text-slate-400 dark:text-slate-500">
            {match.date && <span>{match.date}</span>}
            {match.date && match.duration && <span>·</span>}
            {match.duration && <span>{match.duration}</span>}
            {(match.date || match.duration) && match.venue && <span>·</span>}
            {match.venue && <span>{match.venue}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── StatsRow ─────────────────────────────────────────────────────────────────

function StatsRow({
  label,
  valA,
  valB,
  barA,
  barB,
  subA,
  subB,
  gapClass,
}: {
  label: string;
  valA: string;
  valB: string;
  barA?: number;
  barB?: number;
  subA?: string;
  subB?: string;
  gapClass?: string;
}) {
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] ${gapClass ?? 'gap-2 md:gap-3'} items-center py-2.5 md:py-3 border-b border-slate-50 dark:border-slate-800 last:border-0`}>
      <div className="text-right space-y-1">
        <p className="text-xs md:text-sm font-bold text-violet-600">{valA}</p>
        {barA !== undefined && (
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-violet-400 rounded-full ml-auto" style={{ width: `${barA}%` }} />
          </div>
        )}
        {subA && <p className="text-[10px] text-slate-400 dark:text-slate-500">{subA}</p>}
      </div>
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12 md:w-16 text-center">{label}</p>
      <div className="space-y-1">
        <p className="text-xs md:text-sm font-bold text-blue-600">{valB}</p>
        {barB !== undefined && (
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${barB}%` }} />
          </div>
        )}
        {subB && <p className="text-[10px] text-slate-400 dark:text-slate-500">{subB}</p>}
      </div>
    </div>
  );
}

// ── H2H Ranking Trend Chart ──────────────────────────────────────────────────

function H2HRankingTrendChart({
  trendA,
  trendB,
  nameA,
  nameB,
  ageGroup,
  eventType,
  asOfDate,
}: {
  trendA: PlayerRankingTrend;
  trendB: PlayerRankingTrend;
  nameA: string;
  nameB: string;
  ageGroup: AgeGroup;
  eventType: EventType;
  asOfDate: string;
}) {
  const buildSeries = (trend: PlayerRankingTrend) =>
    trend.trend
      .filter((point) => point.date <= asOfDate)
      .map((point) => {
        const entry = point.entries.find(
          (e) => e.ageGroup === ageGroup && e.eventType === eventType,
        );
        if (!entry) return null;
        return { date: point.date, rank: entry.rank, points: entry.rankingPoints };
      })
      .filter(Boolean) as { date: string; rank: number; points: number }[];

  const seriesA = buildSeries(trendA);
  const seriesB = buildSeries(trendB);

  const allDates = [...new Set([...seriesA.map((d) => d.date), ...seriesB.map((d) => d.date)])].sort();

  const mapA = new Map(seriesA.map((d) => [d.date, d]));
  const mapB = new Map(seriesB.map((d) => [d.date, d]));

  const chartData = allDates.map((date) => ({
    date,
    label: formatDateLabel(date),
    rankA: mapA.get(date)?.rank ?? null,
    rankB: mapB.get(date)?.rank ?? null,
    pointsA: mapA.get(date)?.points ?? null,
    pointsB: mapB.get(date)?.points ?? null,
  }));

  if (chartData.length < 2) {
    return (
      <div className="py-4 text-center">
        <TrendingUp className="w-6 h-6 text-slate-200 dark:text-slate-600 mx-auto mb-1" />
        <p className="text-slate-400 dark:text-slate-500 text-xs">
          Not enough historical data for {ageGroup} {eventType}
        </p>
      </div>
    );
  }

  const allRanks = chartData.flatMap((d) => [d.rankA, d.rankB]).filter((r): r is number => r !== null);
  const maxRank = Math.max(...allRanks);
  const rankDomain: [number, number] = [1, Math.ceil(maxRank * 1.1)];

  return (
    <div className="pt-3 pb-1">
      <div className="flex items-center justify-center gap-x-5 mb-2 text-[10px] md:text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 rounded-full bg-violet-500" />
          {nameA}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 rounded-full bg-blue-500" />
          {nameB}
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
          <span className="inline-block w-5 border-t-2 border-dashed border-current" />
          Points
        </span>
      </div>
      <div className="-mx-2 md:mx-0">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 5, right: -10, left: -15, bottom: 5 }}>
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
              formatter={(value: unknown, name: unknown) => {
                const n = name as string;
                if (value === null || value === undefined) return ['—', n];
                return [n.startsWith('Rank') ? `#${value}` : (value as number).toLocaleString(), n];
              }}
              labelFormatter={(_label: unknown, payload: ReadonlyArray<{ payload?: { date?: string } }>) => {
                const dateStr = payload[0]?.payload?.date;
                if (!dateStr) return '';
                const d = new Date(dateStr + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              }}
            />
            <Line yAxisId="rank" type="monotone" dataKey="rankA" name={`Rank · ${nameA}`}
              stroke={PLAYER_A_HEX} strokeWidth={2.5}
              dot={{ r: 3, fill: PLAYER_A_HEX, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              connectNulls />
            <Line yAxisId="rank" type="monotone" dataKey="rankB" name={`Rank · ${nameB}`}
              stroke={PLAYER_B_HEX} strokeWidth={2.5}
              dot={{ r: 3, fill: PLAYER_B_HEX, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              connectNulls />
            <Line yAxisId="points" type="monotone" dataKey="pointsA" name={`Points · ${nameA}`}
              stroke={PLAYER_A_HEX} strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.5}
              dot={false} connectNulls />
            <Line yAxisId="points" type="monotone" dataKey="pointsB" name={`Points · ${nameB}`}
              stroke={PLAYER_B_HEX} strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.5}
              dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

// Module-level cache — survives route changes, immune to StrictMode double-mount
let _h2hSnap: {
  ageGroup: AgeGroup | null;
  gender: Gender;
  playerAId: string;
  playerBId: string;
  h2hResult: H2HResult | null;
  tswStatsA: TswPlayerStats | null;
  tswStatsB: TswPlayerStats | null;
  filterCat: 'All' | 'Singles' | 'Doubles' | 'Mixed';
  scrollY: number;
} | null = null;

export default function HeadToHead() {
  const { players: allPlayers, loading: playersLoading } = usePlayers();

  const snap = _h2hSnap;
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(snap?.ageGroup ?? 'U13');
  const [gender, setGender] = useState<Gender>(snap?.gender ?? 'Boy');
  const resultsRef = useRef<HTMLDivElement>(null);
  const [playerA, setPlayerA] = useState<UniquePlayer | null>(null);
  const [playerB, setPlayerB] = useState<UniquePlayer | null>(null);

  const [h2hResult, setH2hResult] = useState<H2HResult | null>(snap?.h2hResult ?? null);
  const [tswStatsA, setTswStatsA] = useState<TswPlayerStats | null>(snap?.tswStatsA ?? null);
  const [tswStatsB, setTswStatsB] = useState<TswPlayerStats | null>(snap?.tswStatsB ?? null);
  const [trendA, setTrendA] = useState<PlayerRankingTrend | null>(null);
  const [trendB, setTrendB] = useState<PlayerRankingTrend | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compared, setCompared] = useState(!!snap?.h2hResult || !!snap?.tswStatsA || !!snap?.tswStatsB);
  const [error, setError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<'All' | 'Singles' | 'Doubles' | 'Mixed'>(snap?.filterCat ?? 'All');
  const [expandedRankingKey, setExpandedRankingKey] = useState<string | null>(null);
  const { rankingsDate } = usePlayers();

  // Restore player objects from snapshot IDs once allPlayers loads
  const restoredPlayers = useRef(false);
  useEffect(() => {
    if (restoredPlayers.current || playersLoading || allPlayers.length === 0) return;
    restoredPlayers.current = true;
    if (!snap) return;
    const a = allPlayers.find((p) => p.usabId === snap.playerAId) ?? null;
    const b = allPlayers.find((p) => p.usabId === snap.playerBId) ?? null;
    if (a) setPlayerA(a);
    if (b) setPlayerB(b);
    if (a && b && snap.scrollY) {
      requestAnimationFrame(() => window.scrollTo(0, snap.scrollY));
    }
  }, [playersLoading, allPlayers, snap]);

  // Save snapshot on unmount
  useEffect(() => {
    return () => {
      _h2hSnap = {
        ageGroup,
        gender,
        playerAId: playerA?.usabId ?? '',
        playerBId: playerB?.usabId ?? '',
        h2hResult,
        tswStatsA,
        tswStatsB,
        filterCat,
        scrollY: window.scrollY,
      };
    };
  });

  const filteredPlayers = useMemo(() => {
    return allPlayers
      .filter((p) => {
        if (ageGroup && !p.entries.some((e) => e.ageGroup === ageGroup)) return false;
        if (gender !== 'All') return inferGender(p.entries) === gender;
        return true;
      })
      .sort((a, b) => {
        const ae = bestEntry(a, ageGroup);
        const be = bestEntry(b, ageGroup);
        if (!ae) return 1;
        if (!be) return -1;
        return ae.rank - be.rank;
      });
  }, [allPlayers, ageGroup, gender]);

  // Clear selections on user-initiated filter changes only
  const prevFilters = useRef({ ageGroup, gender });
  useEffect(() => {
    if (prevFilters.current.ageGroup === ageGroup && prevFilters.current.gender === gender) return;
    prevFilters.current = { ageGroup, gender };
    setPlayerA(null);
    setPlayerB(null);
    setH2hResult(null);
    setTswStatsA(null);
    setTswStatsB(null);
    setCompared(false);
    setError(null);
  }, [ageGroup, gender]);

  const handleCompare = useCallback(async () => {
    if (!playerA || !playerB) return;
    setComparing(true);
    setCompared(false);
    setH2hResult(null);
    setTswStatsA(null);
    setTswStatsB(null);
    setTrendA(null);
    setTrendB(null);
    setError(null);
    setFilterCat('All');
    setExpandedRankingKey(null);

    try {
      const [h2h, statsA, statsB] = await Promise.allSettled([
        fetchH2H(playerA.usabId, playerB.usabId),
        fetchPlayerTswStats(playerA.usabId, playerA.name),
        fetchPlayerTswStats(playerB.usabId, playerB.name),
      ]);

      const h2hVal = h2h.status === 'fulfilled' ? h2h.value : null;
      const statsAVal = statsA.status === 'fulfilled' ? statsA.value : null;
      const statsBVal = statsB.status === 'fulfilled' ? statsB.value : null;

      setH2hResult(h2hVal);
      setTswStatsA(statsAVal);
      setTswStatsB(statsBVal);

      if (!h2hVal && !statsAVal && !statsBVal) {
        setError('Failed to load comparison data. Please try again.');
      } else {
        setCompared(true);
        requestAnimationFrame(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } catch {
      setError('Unexpected error. Please try again.');
    } finally {
      setComparing(false);
    }
  }, [playerA, playerB]);

  const ALL_FILTER_CATS: { key: 'All' | 'Singles' | 'Doubles' | 'Mixed'; label: string }[] = [
    { key: 'All', label: 'All' },
    { key: 'Singles', label: 'Singles' },
    { key: 'Doubles', label: 'Doubles' },
    { key: 'Mixed', label: 'Mixed' },
  ];

  const normalizedMatches = useMemo(() => {
    if (!playerA || !playerB) return [];
    const h2hMatches = h2hResult
      ? h2hResult.matches.map((m) => normalizeMatch(m, playerA.name))
      : [];

    const woMatches = findMatchesBetween(tswStatsA, playerA.name, playerB.name);
    const woFromB = findMatchesBetween(tswStatsB, playerB.name, playerA.name)
      .map((m) => normalizeMatch(m, playerA.name));

    const existing = new Set(
      h2hMatches.map((m) => `${m.tournament}|${m.event}|${m.round}|${m.date}`),
    );
    const merged = [...h2hMatches];
    for (const wo of [...woMatches, ...woFromB]) {
      const key = `${wo.tournament}|${wo.event}|${wo.round}|${wo.date}`;
      if (!existing.has(key)) {
        existing.add(key);
        merged.push(normalizeMatch(wo, playerA.name));
      }
    }

    merged.sort((a, b) => {
      const da = parseMatchDate(a.date);
      const db = parseMatchDate(b.date);
      if (da && db) return db - da;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
    return merged;
  }, [h2hResult, playerA, playerB, tswStatsA, tswStatsB]);

  const filteredMatches = useMemo(() => {
    if (filterCat === 'All') return normalizedMatches;
    return normalizedMatches.filter((m) => eventCategory(m.event) === filterCat);
  }, [normalizedMatches, filterCat]);

  const filteredWins = useMemo(() => ({
    team1: filteredMatches.filter((m) => m.team1Won).length,
    team2: filteredMatches.filter((m) => m.team2Won).length,
    total: filteredMatches.length,
  }), [filteredMatches]);

  const playerLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPlayers) {
      map.set(p.name.toLowerCase().trim(), p.usabId);
    }
    return map;
  }, [allPlayers]);

  const tswCatKey: StatsCategory = filterCat === 'All' ? 'total'
    : filterCat === 'Singles' ? 'singles'
    : filterCat === 'Doubles' ? 'doubles'
    : 'mixed';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Swords className="w-5 h-5 md:w-6 md:h-6 text-violet-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">Head to Head</h1>
        </div>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
          Compare two players · Data from{' '}
          <a href="https://www.tournamentsoftware.com" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">
            TSW
          </a>
          {' '}& {' '}
          <a href="https://usabjrrankings.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            USAB
          </a>
        </p>
      </div>

      {/* Age Group Tabs — horizontal scroll on mobile */}
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Filter by Age Group</p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
          {AGE_GROUPS.map((ag) => (
            <button
              key={ag}
              onClick={() => setAgeGroup(ageGroup === ag ? null : ag)}
              className={`px-5 py-2 md:py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm whitespace-nowrap shrink-0 ${
                ageGroup === ag
                  ? `${AGE_COLORS[ag]} text-white scale-105`
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              {ag}
            </button>
          ))}
        </div>
      </div>

      {/* Gender Pills — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
        {(['All', 'Boy', 'Girl'] as Gender[]).map((g) => (
          <button
            key={g}
            onClick={() => setGender(g)}
            className={`px-3.5 md:px-4 py-2 rounded-xl text-sm font-medium transition-all border whitespace-nowrap shrink-0 shadow-sm ${
              gender === g
                ? (ageGroup ? `${AGE_COLORS[ageGroup]} text-white border-transparent scale-105` : 'bg-slate-700 text-white border-transparent scale-105')
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            <span className="font-bold">{g === 'All' ? '⚥ All' : g === 'Boy' ? '♂ Boy' : '♀ Girl'}</span>
          </button>
        ))}
      </div>

      {/* Player count */}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {playersLoading ? 'Loading players…' : `${filteredPlayers.length} player${filteredPlayers.length !== 1 ? 's' : ''}${gender !== 'All' ? ` (${gender}${filteredPlayers.length !== 1 ? 's' : ''})` : ''}${ageGroup ? ` in ${ageGroup}` : ''}`}
      </p>

      {/* Player Selection */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
        <h2 className="text-sm md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-4 md:mb-5">Select Two Players</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <PlayerPicker
            label="Player 1"
            accent="violet"
            players={filteredPlayers}
            selected={playerA}
            onSelect={(p) => { setPlayerA(p); setCompared(false); }}
            loading={playersLoading}
            exclude={playerB?.usabId ?? null}
            ageGroup={ageGroup}
          />
          <PlayerPicker
            label="Player 2"
            accent="blue"
            players={filteredPlayers}
            selected={playerB}
            onSelect={(p) => { setPlayerB(p); setCompared(false); }}
            loading={playersLoading}
            exclude={playerA?.usabId ?? null}
            ageGroup={ageGroup}
          />
        </div>

        <div className="mt-5 md:mt-6 flex justify-center">
          <button
            onClick={handleCompare}
            disabled={!playerA || !playerB || comparing}
            className="flex items-center gap-2 px-6 md:px-8 py-2.5 md:py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md text-sm md:text-base"
          >
            {comparing ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</>
            ) : (
              <><Swords className="w-4 h-4" /> Compare</>
            )}
          </button>
        </div>
      </div>

      {/* Loading */}
      {comparing && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-8 md:p-12 text-center">
          <RefreshCw className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Fetching match history & statistics…</p>
        </div>
      )}

      {/* Error */}
      {error && !comparing && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-4 md:p-6 text-center">
          <p className="text-red-700 dark:text-red-300 font-medium text-sm">{error}</p>
          {playerA && playerB && (
            <a
              href={tswH2HUrl(playerA.usabId, playerB.usabId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-sm text-orange-600 hover:underline"
            >
              Try on TournamentSoftware <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Results */}
      {compared && playerA && playerB && !comparing && (
        <div ref={resultsRef} className="space-y-4 md:space-y-6">
          {/* Global Category Filter */}
          <div className="flex items-center gap-2 md:gap-3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-2 md:p-3">
            <span className="text-[10px] md:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1 md:pl-2 shrink-0">Show</span>
            <div className="flex gap-1 md:gap-1.5 flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              {ALL_FILTER_CATS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterCat(key)}
                  className={`flex-1 px-2 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
                    filterCat === key
                      ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>


          {/* H2H Scorecard */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 md:p-8 text-white">
            <div className="flex items-center justify-center mb-4 md:mb-6">
              <p className="text-slate-400 text-[10px] md:text-xs uppercase tracking-widest">
                Head to Head · {filterCat === 'All' ? 'All Events' : filterCat}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 md:gap-4">
              {/* Player A */}
              <div className="flex-1 text-center min-w-0">
                <Link to={`/directory/${playerA.usabId}`}>
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-violet-600 flex items-center justify-center text-base md:text-xl font-black mx-auto mb-2 md:mb-3 hover:scale-105 transition-transform">
                    {playerA.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </div>
                </Link>
                <Link to={`/directory/${playerA.usabId}`} className="hover:text-violet-300 transition-colors">
                  <p className="font-bold text-sm md:text-lg leading-tight truncate">{playerA.name}</p>
                </Link>
                <p className="text-4xl md:text-6xl font-black text-violet-400 mt-3 md:mt-4 tabular-nums">
                  {filteredWins.team1}
                </p>
                <p className="text-slate-500 text-[10px] md:text-xs mt-1">Match wins</p>
              </div>

              {/* VS donut chart */}
              {(() => {
                const pctA = filteredWins.total > 0
                  ? Math.round((filteredWins.team1 / filteredWins.total) * 100)
                  : 50;
                return (
                  <div className="text-center shrink-0 px-1 md:px-2">
                    <div
                      className="w-32 h-32 md:w-36 md:h-36 rounded-full mx-auto relative"
                      style={{
                        background: filteredWins.total > 0
                          ? `conic-gradient(from 180deg, #a78bfa 0% ${pctA}%, #60a5fa ${pctA}% 100%)`
                          : '#475569',
                      }}
                    >
                      <div className="absolute inset-6 md:inset-7 rounded-full bg-slate-800 flex items-center justify-center flex-col">
                        <p className="text-base md:text-lg font-black text-white">{filteredWins.total}</p>
                        <p className="text-[10px] md:text-xs text-slate-500 -mt-0.5">matches</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Player B */}
              <div className="flex-1 text-center min-w-0">
                <Link to={`/directory/${playerB.usabId}`}>
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-blue-600 flex items-center justify-center text-base md:text-xl font-black mx-auto mb-2 md:mb-3 hover:scale-105 transition-transform">
                    {playerB.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </div>
                </Link>
                <Link to={`/directory/${playerB.usabId}`} className="hover:text-blue-300 transition-colors">
                  <p className="font-bold text-sm md:text-lg leading-tight truncate">{playerB.name}</p>
                </Link>
                <p className="text-4xl md:text-6xl font-black text-blue-400 mt-3 md:mt-4 tabular-nums">
                  {filteredWins.team2}
                </p>
                <p className="text-slate-500 text-[10px] md:text-xs mt-1">Match wins</p>
              </div>
            </div>
          </div>

          {/* Stats Comparison from TSW */}
          {(tswStatsA || tswStatsB) && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
              <div className="flex items-center gap-2 mb-4 md:mb-5">
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
                <h2 className="text-sm md:text-base font-semibold text-slate-800 dark:text-slate-100">
                  {filterCat !== 'All' ? `${filterCat} ` : ''}Stats Comparison
                </h2>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 md:gap-3 mb-3 md:mb-4 px-1">
                <p className="text-right text-[10px] md:text-xs font-bold text-violet-600 truncate">{playerA.name}</p>
                <div className="w-12 md:w-16" />
                <p className="text-[10px] md:text-xs font-bold text-blue-600 truncate">{playerB.name}</p>
              </div>

              <StatsRow
                label="Career"
                valA={tswStatsA ? `${tswStatsA[tswCatKey].career.wins}W-${tswStatsA[tswCatKey].career.losses}L` : '—'}
                valB={tswStatsB ? `${tswStatsB[tswCatKey].career.wins}W-${tswStatsB[tswCatKey].career.losses}L` : '—'}
                barA={tswStatsA?.[tswCatKey].career.winPct}
                barB={tswStatsB?.[tswCatKey].career.winPct}
                subA={tswStatsA ? `${tswStatsA[tswCatKey].career.winPct}%` : undefined}
                subB={tswStatsB ? `${tswStatsB[tswCatKey].career.winPct}%` : undefined}
              />

              <StatsRow
                label="This Year"
                valA={tswStatsA ? `${tswStatsA[tswCatKey].thisYear.wins}W-${tswStatsA[tswCatKey].thisYear.losses}L` : '—'}
                valB={tswStatsB ? `${tswStatsB[tswCatKey].thisYear.wins}W-${tswStatsB[tswCatKey].thisYear.losses}L` : '—'}
                barA={tswStatsA?.[tswCatKey].thisYear.winPct}
                barB={tswStatsB?.[tswCatKey].thisYear.winPct}
                subA={tswStatsA ? `${tswStatsA[tswCatKey].thisYear.winPct}%` : undefined}
                subB={tswStatsB ? `${tswStatsB[tswCatKey].thisYear.winPct}%` : undefined}
              />

            </div>
          )}

          {/* Rankings comparison */}
          {playerA && playerB && (() => {
            const entriesA = entriesForAge(playerA, null);
            const entriesB = entriesForAge(playerB, null);
            const entryMapA = new Map(entriesA.map((e) => [`${e.ageGroup}-${e.eventType}`, e]));
            const entryMapB = new Map(entriesB.map((e) => [`${e.ageGroup}-${e.eventType}`, e]));
            const allKeys = [...new Set([...entryMapA.keys(), ...entryMapB.keys()])]
              .filter((key) => {
                if (filterCat === 'All') return true;
                const ev = key.split('-')[1];
                return eventCategory(ev) === filterCat;
              });
            allKeys.sort((a, b) => {
              const [agA, evA] = a.split('-');
              const [agB, evB] = b.split('-');
              if (agA !== agB) return agA.localeCompare(agB);
              return evA.localeCompare(evB);
            });
            if (allKeys.length === 0) return null;
            return (
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
                <div className="flex items-center gap-2 mb-3 md:mb-4">
                  <Trophy className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                  <h2 className="text-sm md:text-base font-semibold text-slate-800 dark:text-slate-100">{filterCat !== 'All' ? `${filterCat} ` : ''}Rankings</h2>
                </div>
                <div>
                  {allKeys.map((key) => {
                    const eA = entryMapA.get(key);
                    const eB = entryMapB.get(key);
                    const [ag, ev] = key.split('-') as [AgeGroup, EventType];
                    const label = `${ag} ${ev}`;
                    const bothRanked = !!eA && !!eB;
                    const isExpanded = expandedRankingKey === key;

                    const handleRankingClick = async () => {
                      if (!bothRanked || !playerA || !playerB) return;
                      if (isExpanded) { setExpandedRankingKey(null); return; }
                      setExpandedRankingKey(key);
                      if (trendA && trendB) return;
                      setLoadingTrends(true);
                      try {
                        const [trA, trB] = await Promise.allSettled([
                          fetchPlayerRankingTrend(playerA.usabId),
                          fetchPlayerRankingTrend(playerB.usabId),
                        ]);
                        setTrendA(trA.status === 'fulfilled' ? trA.value : null);
                        setTrendB(trB.status === 'fulfilled' ? trB.value : null);
                      } finally {
                        setLoadingTrends(false);
                      }
                    };

                    return (
                      <div key={key}>
                        <div
                          role={bothRanked ? 'button' : undefined}
                          tabIndex={bothRanked ? 0 : undefined}
                          onClick={handleRankingClick}
                          onKeyDown={(e) => { if (bothRanked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleRankingClick(); } }}
                          className={bothRanked ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors rounded-lg' : ''}
                        >
                          <StatsRow
                            label={label}
                            valA={eA ? `#${eA.rank}` : ''}
                            valB={eB ? `#${eB.rank}` : ''}
                            gapClass="gap-6 md:gap-8"
                          />
                        </div>
                        {isExpanded && loadingTrends && (
                          <div className="py-4 text-center">
                            <RefreshCw className="w-5 h-5 text-slate-300 dark:text-slate-600 animate-spin mx-auto" />
                          </div>
                        )}
                        {isExpanded && !loadingTrends && trendA && trendB && (
                          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                            <H2HRankingTrendChart
                              trendA={trendA}
                              trendB={trendB}
                              nameA={playerA.name.split(' ')[0]}
                              nameB={playerB.name.split(' ')[0]}
                              ageGroup={ag}
                              eventType={ev}
                              asOfDate={rankingsDate}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Direct Match History */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between flex-wrap gap-2 md:gap-3">
                <div>
                  <h2 className="text-sm md:text-base font-semibold text-slate-800 dark:text-slate-100">
                    Match History{filterCat !== 'All' ? ` · ${filterCat}` : ''}
                  </h2>
                  <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
                  </p>
                </div>
                <a
                  href={tswH2HUrl(playerA.usabId, playerB.usabId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs md:text-sm text-orange-600 hover:underline"
                >
                  TSW <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="p-3 md:p-4">
              {!h2hResult || filteredMatches.length === 0 ? (
                <div className="py-8 md:py-12 text-center space-y-3">
                  <Trophy className="w-8 md:w-10 h-8 md:h-10 text-slate-200 dark:text-slate-600 mx-auto" />
                  <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                    {filterCat !== 'All' && h2hResult && h2hResult.matches.length > 0
                      ? `No ${filterCat.toLowerCase()} matches`
                      : 'No direct matches found'}
                  </p>
                  {filterCat !== 'All' && h2hResult && h2hResult.matches.length > 0 ? (
                    <button
                      onClick={() => setFilterCat('All')}
                      className="text-sm text-violet-600 hover:underline"
                    >
                      Show all {h2hResult.matches.length} matches
                    </button>
                  ) : (
                    <div className="flex gap-3 justify-center flex-wrap pt-2">
                      <a
                        href={tswSearchUrl(playerA.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs md:text-sm text-orange-600 hover:underline"
                      >
                        {playerA.name.split(' ')[0]} on TSW <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <a
                        href={tswSearchUrl(playerB.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs md:text-sm text-orange-600 hover:underline"
                      >
                        {playerB.name.split(' ')[0]} on TSW <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 md:space-y-3">
                  {filteredMatches.map((match, i) => (
                    <MatchCard key={i} match={match} playerLookup={playerLookup} />
                  ))}
                </div>
              )}
            </div>
          </div>



        </div>
      )}
    </div>
  );
}
