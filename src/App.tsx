import { Component, Suspense, lazy, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams, useLocation, matchPath } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import useScrollRestore from './hooks/useScrollRestore';
import Navbar from './components/Navbar';
import { PlayersProvider } from './contexts/PlayersContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TournamentFocusProvider, useTournamentFocus } from './contexts/TournamentFocusContext';
import { WatchlistProvider } from './contexts/WatchlistContext';
import { rememberTournamentDetailOrigin } from './utils/tournamentReturnState';
import { isWithinTournamentFocusScope, getLastTournamentPath, setLastTournamentPath } from './utils/tournamentFocus';

const Home = lazy(() => import('./pages/Dashboard'));
const Rankings = lazy(() => import('./pages/Players'));
const AllPlayers = lazy(() => import('./pages/AllPlayers'));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const PlayerRankingDetail = lazy(() => import('./pages/PlayerRankingDetail'));
const HeadToHead = lazy(() => import('./pages/HeadToHead'));
const Tournaments = lazy(() => import('./pages/Tournaments'));
const TournamentHub = lazy(() => import('./pages/TournamentHub'));
const TournamentPlayerDetail = lazy(() => import('./pages/TournamentPlayerDetail'));
const TournamentDrawDetail = lazy(() => import('./pages/TournamentDrawDetail'));
const TournamentMatchesPage = lazy(() => import('./pages/tournament/TournamentMatchesPage'));
const TournamentPlayersPage = lazy(() => import('./pages/tournament/TournamentPlayersPage'));
const TournamentDrawsPage = lazy(() => import('./pages/tournament/TournamentDrawsPage'));
const TournamentEventsPage = lazy(() => import('./pages/tournament/TournamentEventsPage'));
const TournamentSeedsPage = lazy(() => import('./pages/tournament/TournamentSeedsPage'));
const TournamentWinnersPage = lazy(() => import('./pages/tournament/TournamentWinnersPage'));
const TournamentMedalsPage = lazy(() => import('./pages/tournament/TournamentMedalsPage'));
const TournamentWatchlistPage = lazy(() => import('./pages/tournament/TournamentWatchlistPage'));
const TournamentEventDetail = lazy(() => import('./pages/TournamentEventDetail'));
const PlayerSchedulePage = lazy(() => import('./pages/tournament/PlayerSchedulePage'));

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

function RouteFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="h-32 rounded-2xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60 animate-pulse" />
    </div>
  );
}

function SuspendedPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function PlayersDataLayout() {
  return (
    <PlayersProvider>
      <Outlet />
    </PlayersProvider>
  );
}

function TournamentDetailLayout() {
  return (
    <WatchlistProvider>
      <Outlet />
    </WatchlistProvider>
  );
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
  '/directory/:id/rankings',
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
  return <Analytics route={route} path={pathname} scriptSrc="/a/script.js" />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <TournamentFocusProvider>
              <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
                <AnalyticsWithRoutes />
                <ScrollManager />
                <TournamentRouteTracker />
                <TournamentFocusAutoExit />
                <TournamentModeTransitionLayer />
                <Navbar />
                <main className="pb-20 md:pb-0">
                  <Routes>
                    <Route element={<PlayersDataLayout />}>
                      <Route path="/" element={<SuspendedPage><Home /></SuspendedPage>} />
                      <Route path="/players" element={<SuspendedPage><Rankings /></SuspendedPage>} />
                      <Route path="/players/:id" element={<PlayerRedirect />} />
                      <Route path="/directory" element={<SuspendedPage><AllPlayers /></SuspendedPage>} />
                      <Route path="/directory/:id/rankings" element={<SuspendedPage><PlayerRankingDetail /></SuspendedPage>} />
                      <Route path="/directory/:id" element={<SuspendedPage><PlayerProfile /></SuspendedPage>} />
                      <Route path="/analytics" element={<Navigate to="/players" replace />} />
                      <Route path="/head-to-head" element={<SuspendedPage><HeadToHead /></SuspendedPage>} />
                    </Route>
                    <Route path="/tournaments" element={<SuspendedPage><Tournaments /></SuspendedPage>} />
                    <Route path="/tournaments/:tswId" element={<TournamentDetailLayout />}>
                      <Route index element={<SuspendedPage><TournamentHub /></SuspendedPage>} />
                      <Route path="matches" element={<SuspendedPage><TournamentMatchesPage /></SuspendedPage>} />
                      <Route path="players" element={<SuspendedPage><TournamentPlayersPage /></SuspendedPage>} />
                      <Route path="draws" element={<SuspendedPage><TournamentDrawsPage /></SuspendedPage>} />
                      <Route path="events" element={<SuspendedPage><TournamentEventsPage /></SuspendedPage>} />
                      <Route path="seeds" element={<SuspendedPage><TournamentSeedsPage /></SuspendedPage>} />
                      <Route path="winners" element={<SuspendedPage><TournamentWinnersPage /></SuspendedPage>} />
                      <Route path="medals" element={<SuspendedPage><TournamentMedalsPage /></SuspendedPage>} />
                      <Route path="watchlist" element={<SuspendedPage><TournamentWatchlistPage /></SuspendedPage>} />
                      <Route path="event/:eventId" element={<SuspendedPage><TournamentEventDetail /></SuspendedPage>} />
                      <Route path="draw/:drawId" element={<SuspendedPage><TournamentDrawDetail /></SuspendedPage>} />
                      <Route path="player/:playerId/schedule" element={<SuspendedPage><PlayerSchedulePage /></SuspendedPage>} />
                      <Route path="player/:playerId" element={<SuspendedPage><TournamentPlayerDetail /></SuspendedPage>} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
          </TournamentFocusProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
