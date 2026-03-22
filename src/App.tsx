import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation, matchPath } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import useScrollRestore from './hooks/useScrollRestore';
import Navbar from './components/Navbar';
import { PlayersProvider } from './contexts/PlayersContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TournamentFocusProvider, useTournamentFocus } from './contexts/TournamentFocusContext';
import { WatchlistProvider } from './contexts/WatchlistContext';
import { rememberTournamentDetailOrigin } from './utils/tournamentReturnState';
import { isWithinTournamentFocusScope, getLastTournamentPath, setLastTournamentPath } from './utils/tournamentFocus';
import Home from './pages/Dashboard';
import Rankings from './pages/Players';
import AllPlayers from './pages/AllPlayers';
import PlayerProfile from './pages/PlayerProfile';
import HeadToHead from './pages/HeadToHead';
import Tournaments from './pages/Tournaments';
import TournamentHub, { TournamentPlayerDetail, TournamentDrawDetail } from './pages/TournamentHub';
import TournamentMatchesPage from './pages/tournament/TournamentMatchesPage';
import TournamentPlayersPage from './pages/tournament/TournamentPlayersPage';
import TournamentDrawsPage from './pages/tournament/TournamentDrawsPage';
import TournamentEventsPage from './pages/tournament/TournamentEventsPage';
import TournamentSeedsPage from './pages/tournament/TournamentSeedsPage';
import TournamentWinnersPage from './pages/tournament/TournamentWinnersPage';
import TournamentMedalsPage from './pages/tournament/TournamentMedalsPage';
import TournamentWatchlistPage from './pages/tournament/TournamentWatchlistPage';
import TournamentEventDetail from './pages/TournamentEventDetail';
import PlayerSchedulePage from './pages/tournament/PlayerSchedulePage';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Something went wrong</h1>
            <p className="text-slate-600 dark:text-slate-400">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Return Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollManager() {
  useScrollRestore();
  return null;
}

function TournamentRouteTracker() {
  const { pathname, state, key } = useLocation();

  useEffect(() => {
    rememberTournamentDetailOrigin(pathname, (state as { fromPath?: string } | null)?.fromPath);
  }, [pathname, state, key]);

  return null;
}

function TournamentFocusAutoExit() {
  const { pathname, state } = useLocation();
  const { isActive, activeTswId, exitMode } = useTournamentFocus();

  useEffect(() => {
    if (!isActive) return;
    if (!activeTswId) {
      exitMode();
      return;
    }

    const basePath = `/tournaments/${activeTswId}`;
    if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
      setLastTournamentPath(pathname);
    }

    const fromPath = (state as { fromPath?: string } | null)?.fromPath ?? null;
    const lastTournamentPath = getLastTournamentPath();
    if (!isWithinTournamentFocusScope(pathname, activeTswId, fromPath, lastTournamentPath)) {
      exitMode();
    }
  }, [pathname, state, isActive, activeTswId, exitMode]);

  return null;
}

function TournamentModeTransitionLayer() {
  const { isTransitioning, isActive } = useTournamentFocus();

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-30 transition-opacity duration-200 motion-reduce:transition-none ${
        isTransitioning ? 'opacity-100' : 'opacity-0'
      } ${
        isActive
          ? 'bg-violet-500/5 dark:bg-violet-300/5'
          : 'bg-slate-900/5 dark:bg-slate-100/5'
      }`}
    />
  );
}

function PlayerRedirect() {
  const { id } = useParams();
  return <Navigate to={`/directory/${id}`} replace />;
}

const ROUTE_PATTERNS = [
  '/tournaments/:tswId/event/:eventId',
  '/tournaments/:tswId/draw/:drawId',
  '/tournaments/:tswId/player/:playerId/schedule',
  '/tournaments/:tswId/player/:playerId',
  '/tournaments/:tswId/matches',
  '/tournaments/:tswId/players',
  '/tournaments/:tswId/draws',
  '/tournaments/:tswId/events',
  '/tournaments/:tswId/seeds',
  '/tournaments/:tswId/winners',
  '/tournaments/:tswId/medals',
  '/tournaments/:tswId/watchlist',
  '/tournaments/:tswId',
  '/directory/:id',
  '/players/:id',
  '/players',
  '/directory',
  '/head-to-head',
  '/tournaments',
  '/',
];

function AnalyticsWithRoutes() {
  const { pathname } = useLocation();
  const route = ROUTE_PATTERNS.find(pattern => matchPath(pattern, pathname)) ?? pathname;
  return <Analytics route={route} scriptSrc="/a/script.js" />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <PlayersProvider>
            <TournamentFocusProvider>
              <WatchlistProvider>
              <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
                <AnalyticsWithRoutes />
                <ScrollManager />
                <TournamentRouteTracker />
                <TournamentFocusAutoExit />
                <TournamentModeTransitionLayer />
                <Navbar />
                <main className="pb-20 md:pb-0">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/players" element={<Rankings />} />
                    <Route path="/players/:id" element={<PlayerRedirect />} />
                    <Route path="/directory" element={<AllPlayers />} />
                    <Route path="/directory/:id" element={<PlayerProfile />} />
                    <Route path="/analytics" element={<Navigate to="/players" replace />} />
                    <Route path="/head-to-head" element={<HeadToHead />} />
                    <Route path="/tournaments" element={<Tournaments />} />
                    <Route path="/tournaments/:tswId" element={<TournamentHub />} />
                    <Route path="/tournaments/:tswId/matches" element={<TournamentMatchesPage />} />
                    <Route path="/tournaments/:tswId/players" element={<TournamentPlayersPage />} />
                    <Route path="/tournaments/:tswId/draws" element={<TournamentDrawsPage />} />
                    <Route path="/tournaments/:tswId/events" element={<TournamentEventsPage />} />
                    <Route path="/tournaments/:tswId/seeds" element={<TournamentSeedsPage />} />
                    <Route path="/tournaments/:tswId/winners" element={<TournamentWinnersPage />} />
                    <Route path="/tournaments/:tswId/medals" element={<TournamentMedalsPage />} />
                    <Route path="/tournaments/:tswId/watchlist" element={<TournamentWatchlistPage />} />
                    <Route path="/tournaments/:tswId/event/:eventId" element={<TournamentEventDetail />} />
                    <Route path="/tournaments/:tswId/draw/:drawId" element={<TournamentDrawDetail />} />
                    <Route path="/tournaments/:tswId/player/:playerId/schedule" element={<PlayerSchedulePage />} />
                    <Route path="/tournaments/:tswId/player/:playerId" element={<TournamentPlayerDetail />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            </WatchlistProvider>
            </TournamentFocusProvider>
          </PlayersProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
