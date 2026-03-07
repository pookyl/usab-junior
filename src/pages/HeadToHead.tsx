import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Swords, Search, RefreshCw, Trophy, ExternalLink, TrendingUp,
} from 'lucide-react';
import type {
  AgeGroup, UniquePlayer, PlayerEntry, H2HResult, H2HMatch,
  TswPlayerStats, StatsCategory,
} from '../types/junior';
import { AGE_GROUPS, EVENT_LABELS } from '../types/junior';
import { usePlayers } from '../contexts/PlayersContext';
import {
  fetchH2H, fetchPlayerTswStats, tswH2HUrl, tswSearchUrl,
} from '../services/rankingsService';

type Gender = 'Boy' | 'Girl';

const AGE_COLORS: Record<AgeGroup, string> = {
  U11: 'bg-violet-600',
  U13: 'bg-blue-600',
  U15: 'bg-emerald-600',
  U17: 'bg-amber-500',
  U19: 'bg-rose-600',
};

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

function formatScore(match: H2HMatch): string {
  return match.scores.map(([a, b]) => `${a}-${b}`).join(' / ');
}

function eventCategory(event: string): 'Singles' | 'Doubles' | 'Mixed' {
  const e = event.toUpperCase();
  if (e.includes('XD') || e.includes('MIXED')) return 'Mixed';
  if (e.includes('BD') || e.includes('GD') || e.includes('DOUBLES')) return 'Doubles';
  return 'Singles';
}

/**
 * In TSW H2H data, team1/team2 row positions can swap in doubles/mixed matches
 * relative to the queried player order. This checks whether playerA is on team1
 * by matching names, then swaps the match data if needed so playerA is always team1.
 */
function isPlayerOnTeam(playerName: string, teamPlayers: string[]): boolean {
  const pLower = playerName.toLowerCase().trim();
  const pLast = pLower.split(' ').pop() ?? '';
  for (const tp of teamPlayers) {
    const tpLower = tp.toLowerCase().trim();
    if (tpLower === pLower) return true;
    if (tpLower.includes(pLower) || pLower.includes(tpLower)) return true;
    const tpLast = tpLower.split(' ').pop() ?? '';
    if (pLast.length > 1 && tpLast === pLast) return true;
  }
  return false;
}

function normalizeMatch(match: H2HMatch, playerAName: string): H2HMatch {
  if (isPlayerOnTeam(playerAName, match.team1Players)) return match;
  if (!isPlayerOnTeam(playerAName, match.team2Players)) return match;
  return {
    ...match,
    team1Players: match.team2Players,
    team2Players: match.team1Players,
    team1Won: match.team2Won,
    team2Won: match.team1Won,
    scores: match.scores.map(([a, b]) => [b, a]),
  };
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
    if (!query) return pool.slice(0, 20);
    const q = query.toLowerCase();
    return pool.filter((p) => p.name.toLowerCase().includes(q) || p.usabId.includes(q)).slice(0, 20);
  }, [players, query, exclude]);

  const isViolet = accent === 'violet';
  const avatarBg = isViolet ? 'bg-violet-600' : 'bg-blue-600';
  const ringColor = isViolet ? 'focus:ring-violet-400' : 'focus:ring-blue-400';
  const selectedBorder = isViolet ? 'border-violet-200' : 'border-blue-200';
  const itemHover = isViolet ? 'hover:bg-violet-50' : 'hover:bg-blue-50';

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        {label}
      </label>

      {selected ? (
        <div className={`flex items-center gap-3 p-3.5 bg-white border-2 ${selectedBorder} rounded-xl`}>
          <div className={`w-10 h-10 rounded-xl ${avatarBg} flex items-center justify-center text-white font-black text-sm shrink-0`}>
            {selected.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-800 truncate">{selected.name}</p>
              <Link
                to={`/directory/${selected.usabId}`}
                className="text-violet-500 hover:text-violet-700 shrink-0"
                title="View profile"
              >
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {entriesForAge(selected, ageGroup).map((e) => (
                <span
                  key={`${e.ageGroup}-${e.eventType}`}
                  className="text-[10px] font-medium px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded"
                >
                  {!ageGroup ? `${e.ageGroup} ` : ''}{EVENT_LABELS[e.eventType].split(' ')[1]} #{e.rank}
                </span>
              ))}
              <span className="text-[10px] text-slate-400 font-mono">ID {selected.usabId}</span>
            </div>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors shrink-0"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={loading ? 'Loading players…' : `Search by name or USAB ID…`}
              value={query}
              disabled={loading}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              className={`w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${ringColor} bg-white disabled:opacity-60`}
            />
            {loading && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 animate-spin" />
            )}
          </div>

          {open && !loading && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">No players found</div>
              ) : (
                filtered.map((p) => {
                  const best = bestEntry(p, ageGroup);
                  const ageEntries = entriesForAge(p, ageGroup);
                  return (
                    <button
                      key={p.usabId}
                      onClick={() => { onSelect(p); setQuery(''); setOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 ${itemHover} flex items-center gap-3 transition-colors border-b border-slate-50 last:border-0`}
                    >
                      <span className="text-xs text-slate-400 w-8 text-right font-mono shrink-0">
                        {best ? `#${best.rank}` : '—'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                        <div className="flex gap-1.5 mt-0.5 flex-wrap">
                          {ageEntries.slice(0, 4).map((e) => (
                            <span key={`${e.ageGroup}-${e.eventType}`} className="text-[10px] text-slate-400">
                              {!ageGroup ? `${e.ageGroup} ` : ''}{e.eventType} #{e.rank}
                            </span>
                          ))}
                          {ageEntries.length > 4 && (
                            <span className="text-[10px] text-slate-300">+{ageEntries.length - 4}</span>
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

function MatchCard({ match }: { match: H2HMatch }) {
  const cat = eventCategory(match.event);

  return (
    <div className={`border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${
      match.team1Won
        ? 'border-l-4 border-l-violet-400 border-t-slate-100 border-r-slate-100 border-b-slate-100'
        : match.team2Won
        ? 'border-l-4 border-l-blue-400 border-t-slate-100 border-r-slate-100 border-b-slate-100'
        : 'border-slate-100'
    }`}>
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100">
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
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-medium text-slate-600">{match.round}</span>
          {match.duration && (
            <>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-400">{match.duration}</span>
            </>
          )}
        </div>
        <p className="text-sm font-semibold text-slate-700 mt-1">{match.tournament}</p>
      </div>

      <div className="px-4 py-3">
        <div className={`flex items-center gap-3 py-1.5 ${match.team1Won ? 'font-bold' : ''}`}>
          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0 ${
            match.team1Won ? 'bg-violet-500' : 'bg-slate-300'
          }`}>
            {match.team1Won ? 'W' : 'L'}
          </span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm truncate ${match.team1Won ? 'text-violet-700' : 'text-slate-600'}`}>
              {match.team1Players.join(' / ')}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {match.scores.map(([a], i) => (
              <span key={i} className={`text-sm font-mono tabular-nums ${
                match.team1Won ? 'text-violet-700 font-bold' : 'text-slate-500'
              }`}>
                {a}
              </span>
            ))}
          </div>
        </div>

        <div className={`flex items-center gap-3 py-1.5 ${match.team2Won ? 'font-bold' : ''}`}>
          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0 ${
            match.team2Won ? 'bg-blue-500' : 'bg-slate-300'
          }`}>
            {match.team2Won ? 'W' : 'L'}
          </span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm truncate ${match.team2Won ? 'text-blue-700' : 'text-slate-600'}`}>
              {match.team2Players.join(' / ')}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {match.scores.map(([, b], i) => (
              <span key={i} className={`text-sm font-mono tabular-nums ${
                match.team2Won ? 'text-blue-700 font-bold' : 'text-slate-500'
              }`}>
                {b}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-2 text-xs text-slate-400">
          <span className="font-mono">{formatScore(match)}</span>
          {match.date && <><span>·</span><span>{match.date}</span></>}
          {match.venue && <><span>·</span><span>{match.venue}</span></>}
        </div>
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
}: {
  label: string;
  valA: string;
  valB: string;
  barA?: number;
  barB?: number;
  subA?: string;
  subB?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center py-3 border-b border-slate-50 last:border-0">
      <div className="text-right space-y-1">
        <p className="text-sm font-bold text-violet-600">{valA}</p>
        {barA !== undefined && (
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-violet-400 rounded-full ml-auto" style={{ width: `${barA}%` }} />
          </div>
        )}
        {subA && <p className="text-[10px] text-slate-400">{subA}</p>}
      </div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-16 text-center">{label}</p>
      <div className="space-y-1">
        <p className="text-sm font-bold text-blue-600">{valB}</p>
        {barB !== undefined && (
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${barB}%` }} />
          </div>
        )}
        {subB && <p className="text-[10px] text-slate-400">{subB}</p>}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function HeadToHead() {
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [gender, setGender] = useState<Gender>('Boy');
  const [playerA, setPlayerA] = useState<UniquePlayer | null>(null);
  const [playerB, setPlayerB] = useState<UniquePlayer | null>(null);
  const { players: allPlayers, loading: playersLoading } = usePlayers();

  const [h2hResult, setH2hResult] = useState<H2HResult | null>(null);
  const [tswStatsA, setTswStatsA] = useState<TswPlayerStats | null>(null);
  const [tswStatsB, setTswStatsB] = useState<TswPlayerStats | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compared, setCompared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<'All' | 'Singles' | 'Doubles' | 'Mixed'>('All');

  const filteredPlayers = useMemo(() => {
    return allPlayers
      .filter((p) => {
        if (ageGroup && !p.entries.some((e) => e.ageGroup === ageGroup)) return false;
        return inferGender(p.entries) === gender;
      })
      .sort((a, b) => {
        const ae = bestEntry(a, ageGroup);
        const be = bestEntry(b, ageGroup);
        if (!ae) return 1;
        if (!be) return -1;
        return ae.rank - be.rank;
      });
  }, [allPlayers, ageGroup, gender]);

  useEffect(() => {
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
    setError(null);
    setFilterCat('All');

    try {
      const [h2h, statsA, statsB] = await Promise.allSettled([
        fetchH2H(playerA.usabId, playerB.usabId),
        fetchPlayerTswStats(playerA.usabId, playerA.name),
        fetchPlayerTswStats(playerB.usabId, playerB.name),
      ]);

      if (h2h.status === 'fulfilled') setH2hResult(h2h.value);
      if (statsA.status === 'fulfilled') setTswStatsA(statsA.value);
      if (statsB.status === 'fulfilled') setTswStatsB(statsB.value);

      if (h2h.status === 'rejected' && statsA.status === 'rejected' && statsB.status === 'rejected') {
        setError('Failed to load comparison data. Please try again.');
      } else {
        setCompared(true);
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
    if (!h2hResult || !playerA) return [];
    return h2hResult.matches.map((m) => normalizeMatch(m, playerA.name));
  }, [h2hResult, playerA]);

  const filteredMatches = useMemo(() => {
    if (filterCat === 'All') return normalizedMatches;
    return normalizedMatches.filter((m) => eventCategory(m.event) === filterCat);
  }, [normalizedMatches, filterCat]);

  const filteredWins = useMemo(() => ({
    team1: filteredMatches.filter((m) => m.team1Won).length,
    team2: filteredMatches.filter((m) => m.team2Won).length,
    total: filteredMatches.length,
  }), [filteredMatches]);

  const tswCatKey: StatsCategory = filterCat === 'All' ? 'total'
    : filterCat === 'Singles' ? 'singles'
    : filterCat === 'Doubles' ? 'doubles'
    : 'mixed';

  const bestA = playerA ? bestEntry(playerA, ageGroup) : null;
  const bestB = playerB ? bestEntry(playerB, ageGroup) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Swords className="w-6 h-6 text-violet-600" />
          <h1 className="text-3xl font-bold text-slate-800">Head to Head</h1>
        </div>
        <p className="text-slate-500">
          Compare two players — match data from{' '}
          <a href="https://www.tournamentsoftware.com" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">
            tournamentsoftware.com
          </a>
          {' '}· Rankings from{' '}
          <a href="https://usabjrrankings.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            usabjrrankings.org
          </a>
        </p>
      </div>

      {/* Filters: Age Group + Gender */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex gap-2 flex-wrap flex-1">
          <button
            onClick={() => setAgeGroup(null)}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
              ageGroup === null
                ? 'bg-slate-700 text-white scale-105'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
            }`}
          >
            All
          </button>
          {AGE_GROUPS.map((ag) => (
            <button
              key={ag}
              onClick={() => setAgeGroup(ag)}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
                ageGroup === ag
                  ? `${AGE_COLORS[ag]} text-white scale-105`
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
              }`}
            >
              {ag}
            </button>
          ))}
        </div>

        <div className="flex bg-slate-100 rounded-xl p-1 shrink-0">
          {(['Boy', 'Girl'] as Gender[]).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                gender === g
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {g === 'Boy' ? '👦 Boy' : '👧 Girl'}
            </button>
          ))}
        </div>
      </div>

      {/* Player count */}
      <p className="text-xs text-slate-400">
        {playersLoading ? 'Loading players…' : `${filteredPlayers.length} ${gender}${filteredPlayers.length !== 1 ? 's' : ''}${ageGroup ? ` in ${ageGroup}` : ''}`}
      </p>

      {/* Player Selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-base font-semibold text-slate-700 mb-5">Select Two Players</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        <div className="mt-6 flex justify-center">
          <button
            onClick={handleCompare}
            disabled={!playerA || !playerB || comparing}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md"
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-500">Fetching match history & statistics…</p>
          <p className="text-slate-400 text-sm mt-1">This may take a few seconds on first load</p>
        </div>
      )}

      {/* Error */}
      {error && !comparing && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-700 font-medium">{error}</p>
          {playerA && playerB && (
            <a
              href={tswH2HUrl(playerA.usabId, playerB.usabId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-sm text-orange-600 hover:underline"
            >
              Try on TournamentSoftware directly <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Results */}
      {compared && playerA && playerB && !comparing && (
        <>
          {/* Global Category Filter */}
          <div className="flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2 shrink-0">Show</span>
            <div className="flex gap-1.5 flex-1 bg-slate-100 rounded-xl p-1">
              {ALL_FILTER_CATS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterCat(key)}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    filterCat === key
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* H2H Scorecard */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 md:p-8 text-white">
            <div className="flex items-center justify-center gap-2 mb-6">
              <p className="text-slate-400 text-xs uppercase tracking-widest">
                Head to Head · {filterCat === 'All' ? 'All Events' : filterCat}
              </p>
              <a
                href={tswH2HUrl(playerA.usabId, playerB.usabId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300 transition-colors"
                title="View on TournamentSoftware"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="flex items-center justify-between gap-4">
              {/* Player A */}
              <div className="flex-1 text-center">
                <Link to={`/directory/${playerA.usabId}`}>
                  <div className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center text-xl font-black mx-auto mb-3 hover:scale-105 transition-transform">
                    {playerA.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </div>
                </Link>
                <Link to={`/directory/${playerA.usabId}`} className="hover:text-violet-300 transition-colors">
                  <p className="font-bold text-base md:text-lg leading-tight">{playerA.name}</p>
                </Link>
                <div className="flex flex-wrap justify-center gap-1 mt-2">
                  {entriesForAge(playerA, ageGroup).map((e) => (
                    <span key={`${e.ageGroup}-${e.eventType}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {!ageGroup ? `${e.ageGroup} ` : ''}{e.eventType} #{e.rank}
                    </span>
                  ))}
                </div>
                <p className="text-5xl md:text-6xl font-black text-violet-400 mt-4 tabular-nums">
                  {filteredWins.team1}
                </p>
                <p className="text-slate-500 text-xs mt-1.5">Match wins</p>
              </div>

              {/* VS */}
              <div className="text-center shrink-0 px-2">
                <p className="text-3xl font-black text-slate-600">VS</p>
                <p className="text-slate-600 text-xs mt-3">
                  {filteredWins.total} match{filteredWins.total !== 1 ? 'es' : ''}
                </p>
              </div>

              {/* Player B */}
              <div className="flex-1 text-center">
                <Link to={`/directory/${playerB.usabId}`}>
                  <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-xl font-black mx-auto mb-3 hover:scale-105 transition-transform">
                    {playerB.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </div>
                </Link>
                <Link to={`/directory/${playerB.usabId}`} className="hover:text-blue-300 transition-colors">
                  <p className="font-bold text-base md:text-lg leading-tight">{playerB.name}</p>
                </Link>
                <div className="flex flex-wrap justify-center gap-1 mt-2">
                  {entriesForAge(playerB, ageGroup).map((e) => (
                    <span key={`${e.ageGroup}-${e.eventType}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {!ageGroup ? `${e.ageGroup} ` : ''}{e.eventType} #{e.rank}
                    </span>
                  ))}
                </div>
                <p className="text-5xl md:text-6xl font-black text-blue-400 mt-4 tabular-nums">
                  {filteredWins.team2}
                </p>
                <p className="text-slate-500 text-xs mt-1.5">Match wins</p>
              </div>
            </div>
          </div>

          {/* H2H Win Rate Bar */}
          {(filteredWins.team1 > 0 || filteredWins.team2 > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-medium text-center">
                H2H Win Rate{filterCat !== 'All' ? ` · ${filterCat}` : ''}
              </p>
              <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all"
                  style={{
                    width: `${(filteredWins.team1 / (filteredWins.team1 + filteredWins.team2)) * 100}%`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs font-bold text-violet-600">
                  {playerA.name.split(' ')[0]} ({filteredWins.team1})
                </span>
                <span className="text-xs font-bold text-blue-600">
                  {playerB.name.split(' ')[0]} ({filteredWins.team2})
                </span>
              </div>
            </div>
          )}

          {/* Direct Match History */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">
                    Direct Match History{filterCat !== 'All' ? ` · ${filterCat}` : ''}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''} from TournamentSoftware
                  </p>
                </div>
                <a
                  href={tswH2HUrl(playerA.usabId, playerB.usabId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-orange-600 hover:underline"
                >
                  View on TSW <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="p-4">
              {!h2hResult || filteredMatches.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <Trophy className="w-10 h-10 text-slate-200 mx-auto" />
                  <p className="text-slate-500 font-medium">
                    {filterCat !== 'All' && h2hResult && h2hResult.matches.length > 0
                      ? `No ${filterCat.toLowerCase()} matches between these players`
                      : 'No direct head-to-head matches found'}
                  </p>
                  {filterCat !== 'All' && h2hResult && h2hResult.matches.length > 0 ? (
                    <button
                      onClick={() => setFilterCat('All')}
                      className="text-sm text-violet-600 hover:underline"
                    >
                      Show all {h2hResult.matches.length} matches instead
                    </button>
                  ) : (
                    <>
                      <p className="text-slate-400 text-sm max-w-sm mx-auto">
                        These players haven't faced each other in any recorded tournament on TournamentSoftware.
                      </p>
                      <div className="flex gap-3 justify-center flex-wrap pt-2">
                        <a
                          href={tswSearchUrl(playerA.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:underline"
                        >
                          {playerA.name} on TSW <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <span className="text-slate-300">·</span>
                        <a
                          href={tswSearchUrl(playerB.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:underline"
                        >
                          {playerB.name} on TSW <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMatches.map((match, i) => (
                    <MatchCard key={i} match={match} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-medium">
                Best{ageGroup ? ` ${ageGroup}` : ''} Rank
              </p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-black text-violet-600">{bestA ? `#${bestA.rank}` : '—'}</span>
                <span className="text-slate-300 text-xs">vs</span>
                <span className="text-lg font-black text-blue-600">{bestB ? `#${bestB.rank}` : '—'}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-medium">
                Best{ageGroup ? ` ${ageGroup}` : ''} Points
              </p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-black text-violet-600">{bestA?.rankingPoints.toLocaleString() ?? '—'}</span>
                <span className="text-slate-300 text-xs">vs</span>
                <span className="text-lg font-black text-blue-600">{bestB?.rankingPoints.toLocaleString() ?? '—'}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-medium">
                {filterCat !== 'All' ? `${filterCat} ` : ''}Career W-L
              </p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-bold text-violet-600">
                  {tswStatsA ? `${tswStatsA[tswCatKey].career.wins}-${tswStatsA[tswCatKey].career.losses}` : h2hResult?.careerWL.team1 || '—'}
                </span>
                <span className="text-slate-300 text-xs">vs</span>
                <span className="text-sm font-bold text-blue-600">
                  {tswStatsB ? `${tswStatsB[tswCatKey].career.wins}-${tswStatsB[tswCatKey].career.losses}` : h2hResult?.careerWL.team2 || '—'}
                </span>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-medium">
                {filterCat !== 'All' ? `${filterCat} ` : ''}Win %
              </p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-black text-violet-600">
                  {tswStatsA ? `${tswStatsA[tswCatKey].career.winPct}%` : '—'}
                </span>
                <span className="text-slate-300 text-xs">vs</span>
                <span className="text-lg font-black text-blue-600">
                  {tswStatsB ? `${tswStatsB[tswCatKey].career.winPct}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Stats Comparison from TSW */}
          {(tswStatsA || tswStatsB) && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                <h2 className="text-base font-semibold text-slate-800">
                  {filterCat !== 'All' ? `${filterCat} ` : ''}Statistics Comparison
                </h2>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 mb-4 px-1">
                <p className="text-right text-xs font-bold text-violet-600 truncate">{playerA.name}</p>
                <div className="w-16" />
                <p className="text-xs font-bold text-blue-600 truncate">{playerB.name}</p>
              </div>

              <StatsRow
                label="Career"
                valA={tswStatsA ? `${tswStatsA[tswCatKey].career.wins}W - ${tswStatsA[tswCatKey].career.losses}L` : '—'}
                valB={tswStatsB ? `${tswStatsB[tswCatKey].career.wins}W - ${tswStatsB[tswCatKey].career.losses}L` : '—'}
                barA={tswStatsA?.[tswCatKey].career.winPct}
                barB={tswStatsB?.[tswCatKey].career.winPct}
                subA={tswStatsA ? `${tswStatsA[tswCatKey].career.winPct}% win rate` : undefined}
                subB={tswStatsB ? `${tswStatsB[tswCatKey].career.winPct}% win rate` : undefined}
              />

              <StatsRow
                label="This Year"
                valA={tswStatsA ? `${tswStatsA[tswCatKey].thisYear.wins}W - ${tswStatsA[tswCatKey].thisYear.losses}L` : '—'}
                valB={tswStatsB ? `${tswStatsB[tswCatKey].thisYear.wins}W - ${tswStatsB[tswCatKey].thisYear.losses}L` : '—'}
                barA={tswStatsA?.[tswCatKey].thisYear.winPct}
                barB={tswStatsB?.[tswCatKey].thisYear.winPct}
                subA={tswStatsA ? `${tswStatsA[tswCatKey].thisYear.winPct}% win rate` : undefined}
                subB={tswStatsB ? `${tswStatsB[tswCatKey].thisYear.winPct}% win rate` : undefined}
              />

              {/* Recent form */}
              {(tswStatsA?.recentHistory?.length || tswStatsB?.recentHistory?.length) ? (
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Form</p>
                  <div className="space-y-3">
                    {tswStatsA && tswStatsA.recentHistory.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-violet-600 w-28 truncate text-right">
                          {playerA.name.split(' ')[0]}
                        </span>
                        <div className="flex gap-1">
                          {tswStatsA.recentHistory.slice(0, 15).map((h, i) => (
                            <span
                              key={i}
                              title={h.date}
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                                h.won ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            >
                              {h.won ? 'W' : 'L'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {tswStatsB && tswStatsB.recentHistory.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-blue-600 w-28 truncate text-right">
                          {playerB.name.split(' ')[0]}
                        </span>
                        <div className="flex gap-1">
                          {tswStatsB.recentHistory.slice(0, 15).map((h, i) => (
                            <span
                              key={i}
                              title={h.date}
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
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
                </div>
              ) : null}
            </div>
          )}

          {/* Rankings in this age group */}
          {playerA && playerB && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h2 className="text-base font-semibold text-slate-800">{ageGroup ? `${ageGroup} ` : ''}Rankings Comparison</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-violet-600 mb-2">{playerA.name}</p>
                  <div className="space-y-2">
                    {entriesForAge(playerA, ageGroup).map((e) => (
                      <div key={`${e.ageGroup}-${e.eventType}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-violet-50/50 border border-violet-100">
                        <span className="text-xs font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded">
                          {!ageGroup ? `${e.ageGroup} ` : ''}{e.eventType}
                        </span>
                        <span className="text-xs text-slate-500">{EVENT_LABELS[e.eventType]}</span>
                        <span className="ml-auto text-sm font-black text-violet-600">#{e.rank}</span>
                        <span className="text-xs text-slate-400">{e.rankingPoints.toLocaleString()} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-blue-600 mb-2">{playerB.name}</p>
                  <div className="space-y-2">
                    {entriesForAge(playerB, ageGroup).map((e) => (
                      <div key={`${e.ageGroup}-${e.eventType}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-blue-50/50 border border-blue-100">
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                          {!ageGroup ? `${e.ageGroup} ` : ''}{e.eventType}
                        </span>
                        <span className="text-xs text-slate-500">{EVENT_LABELS[e.eventType]}</span>
                        <span className="ml-auto text-sm font-black text-blue-600">#{e.rank}</span>
                        <span className="text-xs text-slate-400">{e.rankingPoints.toLocaleString()} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TSW Footer */}
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800">
                Full match details on TournamentSoftware.com
              </p>
              <p className="text-xs text-orange-600 mt-0.5">
                View draws, complete match scores, and tournament brackets
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <a
                href={tswH2HUrl(playerA.usabId, playerB.usabId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                H2H on TSW <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={tswSearchUrl(playerA.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-white text-orange-700 border border-orange-200 rounded-xl text-sm font-medium hover:bg-orange-50 transition-colors"
              >
                {playerA.name.split(' ')[0]} <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={tswSearchUrl(playerB.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-white text-orange-700 border border-orange-200 rounded-xl text-sm font-medium hover:bg-orange-50 transition-colors"
              >
                {playerB.name.split(' ')[0]} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
