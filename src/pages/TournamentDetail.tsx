import { useParams, useSearchParams, Link, Navigate } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink,
  Calendar, MapPin, Swords, Users, List, CalendarDays, Bookmark, Trophy, Medal,
} from 'lucide-react';
import { useTournamentMeta, formatDateRange } from '../hooks/useTournamentMeta';

// Re-export for backward compatibility (App.tsx, BracketDisplay.test.ts)
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

export default function TournamentDetail() {
  const { tswId } = useParams<{ tswId: string }>();
  const [searchParams] = useSearchParams();
  const meta = useTournamentMeta(tswId);

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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        Back to Tournaments
      </Link>

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
          <a
            href={tswUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            TournamentSoftware
          </a>
        </div>
      </div>

      {/* Section pills grid */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
        {SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <Link
              key={section.id}
              to={`/tournaments/${tswId}/${section.id}`}
              state={{ name: meta.name, hostClub: meta.hostClub, startDate: meta.startDate, endDate: meta.endDate }}
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
