import { useParams, useSearchParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { track } from '@vercel/analytics';
import {
  ArrowLeft, ExternalLink,
  Calendar, MapPin, Swords, Users, List, CalendarDays, Bookmark, Trophy, Medal, Eye,
} from 'lucide-react';
import { useTournamentMeta, formatDateRange } from '../hooks/useTournamentMeta';
import { useTournamentFocus } from '../contexts/TournamentFocusContext';

const _debugMode = new URLSearchParams(window.location.search).has('debug');

declare const __VERCEL_GIT_COMMIT_SHA__: string | null;

function isWatchlistEligible(startDate: string, endDate: string): boolean {
  if (!startDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const twoDaysFromNow = new Date(today.getTime() + 2 * 86_400_000);
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : start;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  return start <= twoDaysFromNow && end >= today;
}

// Re-export for backward compatibility
export { default as TournamentPlayerDetail } from './TournamentPlayerDetail';
export { default as TournamentDrawDetail } from './TournamentDrawDetail';
export { buildDisplayRounds } from '../components/tournament/BracketView';
export type { DisplayPlayer, DisplayMatch, DisplayRound } from '../components/tournament/BracketView';

// ── Section definitions (single source of truth for hub pills) ───────────────

const SECTIONS = [
  { id: 'matches', label: 'Matches', icon: Swords },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'draws',   label: 'Draws',   icon: List },
  { id: 'events',  label: 'Events',  icon: CalendarDays },
  { id: 'seeds',   label: 'Seeds',   icon: Bookmark },
  { id: 'winners', label: 'Winners', icon: Trophy },
  { id: 'medals',  label: 'Medals',  icon: Medal },
] as const;

// ── Main Page (Hub) ──────────────────────────────────────────────────────────

export default function TournamentHub() {
  const { tswId } = useParams<{ tswId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const meta = useTournamentMeta(tswId);
  const { isActive, activeTswId, enterMode, exitMode } = useTournamentFocus();

  // Backward compatibility: redirect ?tab=X to /tournaments/:tswId/X
  const legacyTab = searchParams.get('tab');
  if (legacyTab && tswId) {
    const validTabs = SECTIONS.map(s => s.id) as readonly string[];
    if (validTabs.includes(legacyTab)) {
      return <Navigate to={`/tournaments/${tswId}/${legacyTab}`} replace />;
    }
  }

  if (!tswId) return null;

  const tswUrl = `https://www.tournamentsoftware.com/tournament/${tswId}`;
  const isFocusedTournament = isActive && activeTswId === tswId;
  const showWatchlist = isFocusedTournament && (_debugMode || isWatchlistEligible(meta.startDate, meta.endDate));
  const releaseVersion = import.meta.env.VITE_RELEASE_VERSION ?? __VERCEL_GIT_COMMIT_SHA__ ?? 'unversioned';
  const handleTournamentModeToggle = () => {
    track('mode_toggle', {
      releaseVersion,
      mode: 'tournament_focus',
      tournamentId: tswId,
      nextState: isFocusedTournament ? 'exit_focus_mode' : 'enter_focus_mode',
    });
    if (isFocusedTournament) {
      exitMode();
      navigate('/', { replace: true });
      return;
    }
    enterMode(tswId);
    navigate(`/tournaments/${tswId}`, { replace: true });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          {isFocusedTournament ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 dark:text-violet-300">
              Tournament mode
            </span>
          ) : (
            <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline">
              <ArrowLeft className="w-4 h-4" />
              Back to Tournaments
            </Link>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mb-2">
          {meta.name || 'Tournament'}
        </h1>
        <div className="flex items-center gap-4 flex-wrap mt-2 text-sm text-slate-500 dark:text-slate-400">
          {meta.startDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDateRange(meta.startDate, meta.endDate)}
            </span>
          )}
          {meta.hostClub && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {meta.hostClub}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <a
            href={tswUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              track('tournament_external_link_click', {
                releaseVersion,
                tournamentId: tswId,
                target: 'tournamentsoftware',
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            TSW
          </a>
          <button
            type="button"
            onClick={handleTournamentModeToggle}
            aria-pressed={isFocusedTournament}
            className={`ml-auto shrink-0 inline-flex items-center rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
              isFocusedTournament
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700 dark:hover:bg-indigo-900/60'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            {isFocusedTournament ? 'Exit Tournament Mode' : 'Enter Tournament Mode'}
          </button>
        </div>
      </div>

      {/* Watchlist — tournament mode + upcoming/ongoing (or ?debug override) */}
      {showWatchlist && (
        <Link
          to={`/tournaments/${tswId}/watchlist`}
          state={{ name: meta.name, hostClub: meta.hostClub, startDate: meta.startDate, endDate: meta.endDate }}
          onClick={() => {
            track('tournament_section_click', {
              releaseVersion,
              tournamentId: tswId,
              section: 'watchlist',
            });
          }}
          className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center group-hover:bg-amber-100 dark:group-hover:bg-amber-900/40 transition-colors shrink-0">
            <Eye className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Watchlist</span>
            <p className="text-xs text-slate-400 dark:text-slate-500">Track selected players and their match results</p>
          </div>
        </Link>
      )}

      {/* Section pills grid */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
        {SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <Link
              key={section.id}
              to={`/tournaments/${tswId}/${section.id}`}
              state={{ name: meta.name, hostClub: meta.hostClub, startDate: meta.startDate, endDate: meta.endDate }}
              onClick={() => {
                track('tournament_section_click', {
                  releaseVersion,
                  tournamentId: tswId,
                  section: section.id,
                });
              }}
              className="flex flex-col items-center gap-2 p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-600 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center group-hover:bg-violet-100 dark:group-hover:bg-violet-900/40 transition-colors">
                <Icon className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {section.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
