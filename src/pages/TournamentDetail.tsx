import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink,
  Calendar, MapPin, List, Swords, Users, Trophy, Medal,
} from 'lucide-react';
import { fetchTournaments } from '../services/rankingsService';
import MatchesTab from '../components/tournament/tabs/MatchesTab';
import PlayersTab from '../components/tournament/tabs/PlayersTab';
import DrawsTab from '../components/tournament/tabs/DrawsTab';
import WinnersTab from '../components/tournament/tabs/WinnersTab';
import MedalsTab from '../components/tournament/tabs/MedalsTab';

// Re-export for backward compatibility (App.tsx, BracketDisplay.test.ts)
export { default as TournamentPlayerDetail } from './TournamentPlayerDetail';
export { default as TournamentDrawDetail } from './TournamentDrawDetail';
export { buildDisplayRounds } from '../components/tournament/BracketView';
export type { DisplayPlayer, DisplayMatch, DisplayRound } from '../components/tournament/BracketView';

// ── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'matches', label: 'Matches', icon: Swords },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'draws', label: 'Draws', icon: List },
  { id: 'winners', label: 'Winners', icon: Trophy },
  { id: 'medals', label: 'Medals', icon: Medal },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ── Main Page ───────────────────────────────────────────────────────────────

export default function TournamentDetail() {
  const { tswId } = useParams<{ tswId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const TAB_IDS = TABS.map(t => t.id) as readonly TabId[];
  const rawTab = searchParams.get('tab');
  const activeTab: TabId = TAB_IDS.includes(rawTab as TabId) ? (rawTab as TabId) : 'matches';

  const routeState = location.state as { name?: string; hostClub?: string; startDate?: string; endDate?: string } | null;

  const [tournamentName, setTournamentName] = useState(routeState?.name || '');
  const [tournamentMeta, setTournamentMeta] = useState({
    hostClub: routeState?.hostClub || '',
    startDate: routeState?.startDate || '',
    endDate: routeState?.endDate || '',
  });

  useEffect(() => {
    if (tournamentName || !tswId) return;
    let cancelled = false;
    fetchTournaments()
      .then(data => {
        if (cancelled) return;
        const allTournaments = data.tournaments
          ?? Object.values(data.seasons ?? {}).flatMap(s => s.tournaments);
        const match = allTournaments.find(t => t.tswId?.toUpperCase() === tswId.toUpperCase());
        if (match) {
          setTournamentName(match.name);
          setTournamentMeta({ hostClub: match.hostClub, startDate: match.startDate ?? '', endDate: match.endDate ?? '' });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tswId, tournamentName]);

  function setTab(tab: TabId) {
    setSearchParams({ tab }, { replace: true });
  }

  if (!tswId) return null;

  const tswUrl = `https://www.tournamentsoftware.com/tournament/${tswId}`;

  function formatDateRange(start: string, end: string) {
    if (!start) return '';
    const s = new Date(start + 'T00:00:00');
    const e = end ? new Date(end + 'T00:00:00') : s;
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (start === end || !end) return s.toLocaleDateString('en-US', opts);
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        Back to Tournaments
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mb-2">
          {tournamentName || 'Tournament'}
        </h1>
        <div className="flex items-center gap-4 flex-wrap mt-2 text-sm text-slate-500 dark:text-slate-400">
          {tournamentMeta.startDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDateRange(tournamentMeta.startDate, tournamentMeta.endDate)}
            </span>
          )}
          {tournamentMeta.hostClub && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {tournamentMeta.hostClub}
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

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide">
        <nav className="flex gap-1 min-w-max" role="tablist" aria-label="Tournament sections">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === 'draws' && <DrawsTab tswId={tswId} active={activeTab === 'draws'} />}
        {activeTab === 'players' && <PlayersTab tswId={tswId} active={activeTab === 'players'} />}
        {activeTab === 'winners' && <WinnersTab tswId={tswId} active={activeTab === 'winners'} />}
        {activeTab === 'medals' && <MedalsTab tswId={tswId} active={activeTab === 'medals'} />}
        {activeTab === 'matches' && <MatchesTab tswId={tswId} active={activeTab === 'matches'} />}
      </div>
    </div>
  );
}
