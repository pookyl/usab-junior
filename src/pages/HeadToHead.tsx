import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Swords, Search, RefreshCw, Trophy, ExternalLink } from 'lucide-react';
import type { AgeGroup, EventType, JuniorPlayer, H2HResult, H2HMatch } from '../types/junior';
import { AGE_GROUPS, EVENT_TYPES, EVENT_LABELS } from '../types/junior';
import { useRankings } from '../hooks/useRankings';
import { fetchH2H, tswH2HUrl, tswSearchUrl } from '../services/rankingsService';

const AGE_COLORS: Record<AgeGroup, string> = {
  U11: 'bg-violet-600',
  U13: 'bg-blue-600',
  U15: 'bg-emerald-600',
  U17: 'bg-amber-500',
  U19: 'bg-rose-600',
};

const AGE_LIGHT: Record<AgeGroup, string> = {
  U11: 'bg-violet-50 text-violet-700 border-violet-200',
  U13: 'bg-blue-50 text-blue-700 border-blue-200',
  U15: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  U17: 'bg-amber-50 text-amber-700 border-amber-200',
  U19: 'bg-rose-50 text-rose-700 border-rose-200',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatScore(match: H2HMatch): string {
  return match.scores.map(([a, b]) => `${a}-${b}`).join(' / ');
}

function eventCategory(event: string): 'Singles' | 'Doubles' | 'Mixed' {
  const e = event.toUpperCase();
  if (e.includes('XD') || e.includes('MIXED')) return 'Mixed';
  if (e.includes('BD') || e.includes('GD') || e.includes('DOUBLES')) return 'Doubles';
  return 'Singles';
}

// ── PlayerPicker ──────────────────────────────────────────────────────────────

interface PlayerPickerProps {
  label: string;
  accentA: boolean;
  players: JuniorPlayer[];
  selected: JuniorPlayer | null;
  onSelect: (p: JuniorPlayer | null) => void;
  loading: boolean;
  exclude: string | null;
}

function PlayerPicker({ label, accentA, players, selected, onSelect, loading, exclude }: PlayerPickerProps) {
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
    if (!query) return pool.slice(0, 15);
    const q = query.toLowerCase();
    return pool.filter((p) => p.name.toLowerCase().includes(q) || p.usabId.includes(q)).slice(0, 15);
  }, [players, query, exclude]);

  const avatarBg = accentA ? 'bg-violet-600' : 'bg-blue-600';
  const ringColor = accentA ? 'focus:ring-violet-400' : 'focus:ring-blue-400';
  const selectedBorder = accentA ? 'border-violet-200' : 'border-blue-200';
  const itemHover = accentA ? 'hover:bg-violet-50' : 'hover:bg-blue-50';

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
            <p className="font-semibold text-slate-800 truncate">{selected.name}</p>
            <p className="text-xs text-slate-400 font-mono">
              #{selected.rank} · {selected.rankingPoints.toLocaleString()} pts · ID {selected.usabId}
            </p>
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
              placeholder={loading ? 'Loading players…' : 'Search by name or USAB ID…'}
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
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">No players found</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.usabId}
                    onClick={() => { onSelect(p); setQuery(''); setOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 ${itemHover} flex items-center gap-3 transition-colors border-b border-slate-50 last:border-0`}
                  >
                    <span className="text-xs text-slate-400 w-8 text-right font-mono shrink-0">#{p.rank}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.rankingPoints.toLocaleString()} pts</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MatchCard ─────────────────────────────────────────────────────────────────

function MatchCard({ match, nameA, nameB }: { match: H2HMatch; nameA: string; nameB: string }) {
  const cat = eventCategory(match.event);

  return (
    <div className={`border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${
      match.team1Won
        ? 'border-l-4 border-l-violet-400 border-t-slate-100 border-r-slate-100 border-b-slate-100'
        : match.team2Won
        ? 'border-l-4 border-l-blue-400 border-t-slate-100 border-r-slate-100 border-b-slate-100'
        : 'border-slate-100'
    }`}>
      {/* Header */}
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

      {/* Match body */}
      <div className="px-4 py-3">
        {/* Team 1 */}
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
          {/* Scores */}
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

        {/* Team 2 */}
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

        {/* Score summary */}
        <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-2 text-xs text-slate-400">
          <span className="font-mono">{formatScore(match)}</span>
          {match.date && <><span>·</span><span>{match.date}</span></>}
          {match.venue && <><span>·</span><span>{match.venue}</span></>}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HeadToHead() {
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('U11');
  const [eventType, setEventType] = useState<EventType>('BS');
  const [playerA, setPlayerA] = useState<JuniorPlayer | null>(null);
  const [playerB, setPlayerB] = useState<JuniorPlayer | null>(null);
  const { players, loading: rankingsLoading } = useRankings(ageGroup, eventType);

  const [h2hResult, setH2hResult] = useState<H2HResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compared, setCompared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<'All' | 'Singles' | 'Doubles' | 'Mixed'>('All');

  useEffect(() => {
    setPlayerA(null);
    setPlayerB(null);
    setH2hResult(null);
    setCompared(false);
    setError(null);
  }, [ageGroup, eventType]);

  const handleCompare = useCallback(async () => {
    if (!playerA || !playerB) return;
    setComparing(true);
    setCompared(false);
    setH2hResult(null);
    setError(null);
    setFilterCat('All');

    try {
      const result = await fetchH2H(playerA.usabId, playerB.usabId);
      setH2hResult(result);
      setCompared(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load head to head data');
    } finally {
      setComparing(false);
    }
  }, [playerA, playerB]);

  const filteredMatches = useMemo(() => {
    if (!h2hResult) return [];
    if (filterCat === 'All') return h2hResult.matches;
    return h2hResult.matches.filter((m) => eventCategory(m.event) === filterCat);
  }, [h2hResult, filterCat]);

  const categories = useMemo(() => {
    if (!h2hResult) return [];
    const cats = new Set(h2hResult.matches.map((m) => eventCategory(m.event)));
    return ['All', ...Array.from(cats)] as ('All' | 'Singles' | 'Doubles' | 'Mixed')[];
  }, [h2hResult]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Swords className="w-6 h-6 text-violet-600" />
          <h1 className="text-3xl font-bold text-slate-800">Head to Head</h1>
        </div>
        <p className="text-slate-500">
          Compare two players' direct match results · Match data from{' '}
          <a
            href="https://www.tournamentsoftware.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 hover:underline"
          >
            tournamentsoftware.com
          </a>
          {' '}· Rankings from{' '}
          <a
            href="https://usabjrrankings.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            usabjrrankings.org
          </a>
        </p>
      </div>

      {/* Age Group Tabs */}
      <div className="flex gap-2 flex-wrap">
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

      {/* Event Type Pills */}
      <div className="flex gap-2 flex-wrap">
        {EVENT_TYPES.map((et) => (
          <button
            key={et}
            onClick={() => setEventType(et)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
              eventType === et
                ? AGE_LIGHT[ageGroup]
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
            }`}
          >
            <span className="font-bold">{et}</span>
            <span className="ml-1.5 text-xs hidden sm:inline opacity-75">· {EVENT_LABELS[et]}</span>
          </button>
        ))}
      </div>

      {/* Player Selection Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-base font-semibold text-slate-700 mb-5">Select Two Players</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PlayerPicker
            label="Player 1"
            accentA={true}
            players={players}
            selected={playerA}
            onSelect={(p) => { setPlayerA(p); setCompared(false); }}
            loading={rankingsLoading}
            exclude={playerB?.usabId ?? null}
          />
          <PlayerPicker
            label="Player 2"
            accentA={false}
            players={players}
            selected={playerB}
            onSelect={(p) => { setPlayerB(p); setCompared(false); }}
            loading={rankingsLoading}
            exclude={playerA?.usabId ?? null}
          />
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={handleCompare}
            disabled={!playerA || !playerB || comparing}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md"
          >
            {comparing ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Loading matches…</>
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
          <p className="text-slate-500">Fetching match history from TournamentSoftware…</p>
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
      {compared && h2hResult && playerA && playerB && !comparing && (
        <>
          {/* H2H Scorecard */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 md:p-8 text-white">
            <div className="flex items-center justify-center gap-2 mb-6">
              <p className="text-slate-400 text-xs uppercase tracking-widest">
                Head to Head · All Events
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
                <div className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center text-xl font-black mx-auto mb-3">
                  {playerA.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
                <p className="font-bold text-base md:text-lg leading-tight">{playerA.name}</p>
                <p className="text-slate-400 text-xs mt-1">
                  #{playerA.rank} · {playerA.rankingPoints.toLocaleString()} pts
                </p>
                <p className="text-5xl md:text-6xl font-black text-violet-400 mt-5 tabular-nums">
                  {h2hResult.team1wins}
                </p>
                <p className="text-slate-500 text-xs mt-1.5">Match wins</p>
              </div>

              {/* VS divider */}
              <div className="text-center shrink-0 px-2">
                <p className="text-3xl font-black text-slate-600">VS</p>
                <p className="text-slate-600 text-xs mt-3">
                  {h2hResult.matches.length} match{h2hResult.matches.length !== 1 ? 'es' : ''}
                </p>
              </div>

              {/* Player B */}
              <div className="flex-1 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-xl font-black mx-auto mb-3">
                  {playerB.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
                <p className="font-bold text-base md:text-lg leading-tight">{playerB.name}</p>
                <p className="text-slate-400 text-xs mt-1">
                  #{playerB.rank} · {playerB.rankingPoints.toLocaleString()} pts
                </p>
                <p className="text-5xl md:text-6xl font-black text-blue-400 mt-5 tabular-nums">
                  {h2hResult.team2wins}
                </p>
                <p className="text-slate-500 text-xs mt-1.5">Match wins</p>
              </div>
            </div>
          </div>

          {/* Stats comparison */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-medium">National Rank</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-black text-violet-600">#{playerA.rank}</span>
                <span className="text-slate-300 text-xs">vs</span>
                <span className="text-lg font-black text-blue-600">#{playerB.rank}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-medium">Ranking Points</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-black text-violet-600">{playerA.rankingPoints.toLocaleString()}</span>
                <span className="text-slate-300 text-xs">vs</span>
                <span className="text-lg font-black text-blue-600">{playerB.rankingPoints.toLocaleString()}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-medium">Career W-L</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-bold text-violet-600">{h2hResult.careerWL.team1 || '—'}</span>
                <span className="text-slate-300 text-xs">vs</span>
                <span className="text-sm font-bold text-blue-600">{h2hResult.careerWL.team2 || '—'}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-medium">This Year W-L</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-bold text-violet-600">{h2hResult.yearWL.team1 || '—'}</span>
                <span className="text-slate-300 text-xs">vs</span>
                <span className="text-sm font-bold text-blue-600">{h2hResult.yearWL.team2 || '—'}</span>
              </div>
            </div>
          </div>

          {/* Win rate bar */}
          {(h2hResult.team1wins > 0 || h2hResult.team2wins > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-medium text-center">
                H2H Win Rate
              </p>
              <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all"
                  style={{
                    width: `${(h2hResult.team1wins / (h2hResult.team1wins + h2hResult.team2wins)) * 100}%`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs font-bold text-violet-600">
                  {playerA.name.split(' ')[0]} ({h2hResult.team1wins})
                </span>
                <span className="text-xs font-bold text-blue-600">
                  {playerB.name.split(' ')[0]} ({h2hResult.team2wins})
                </span>
              </div>
            </div>
          )}

          {/* Match list */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Match History</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Actual head-to-head matches across Singles, Doubles & Mixed events
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

              {/* Category filter */}
              {categories.length > 2 && (
                <div className="flex gap-2 mt-3">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCat(cat)}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                        filterCat === cat
                          ? 'bg-slate-700 text-white'
                          : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      {cat}
                      {cat !== 'All' && ` (${h2hResult.matches.filter((m) => eventCategory(m.event) === cat).length})`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4">
              {h2hResult.matches.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <Trophy className="w-10 h-10 text-slate-200 mx-auto" />
                  <p className="text-slate-500 font-medium">No head-to-head matches found</p>
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
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  No matches in this category.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMatches.map((match, i) => (
                    <MatchCard
                      key={i}
                      match={match}
                      nameA={playerA.name}
                      nameB={playerB.name}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* TSW footer */}
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
