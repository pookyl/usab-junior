import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import useScrollRestore from './hooks/useScrollRestore';
import Navbar from './components/Navbar';
import { PlayersProvider } from './contexts/PlayersContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Home from './pages/Dashboard';
import Rankings from './pages/Players';
import AllPlayers from './pages/AllPlayers';
import PlayerProfile from './pages/PlayerProfile';
import HeadToHead from './pages/HeadToHead';
import Tournaments from './pages/Tournaments';
import TournamentDetail, { TournamentPlayerDetail, TournamentDrawDetail } from './pages/TournamentDetail';
import TournamentMatchesPage from './pages/tournament/TournamentMatchesPage';
import TournamentPlayersPage from './pages/tournament/TournamentPlayersPage';
import TournamentDrawsPage from './pages/tournament/TournamentDrawsPage';
import TournamentWinnersPage from './pages/tournament/TournamentWinnersPage';
import TournamentMedalsPage from './pages/tournament/TournamentMedalsPage';

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

function PlayerRedirect() {
  const { id } = useParams();
  return <Navigate to={`/directory/${id}`} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <PlayersProvider>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
              <ScrollManager />
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
                  <Route path="/tournaments/:tswId" element={<TournamentDetail />} />
                  <Route path="/tournaments/:tswId/matches" element={<TournamentMatchesPage />} />
                  <Route path="/tournaments/:tswId/players" element={<TournamentPlayersPage />} />
                  <Route path="/tournaments/:tswId/draws" element={<TournamentDrawsPage />} />
                  <Route path="/tournaments/:tswId/winners" element={<TournamentWinnersPage />} />
                  <Route path="/tournaments/:tswId/medals" element={<TournamentMedalsPage />} />
                  <Route path="/tournaments/:tswId/draw/:drawId" element={<TournamentDrawDetail />} />
                  <Route path="/tournaments/:tswId/player/:playerId" element={<TournamentPlayerDetail />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </PlayersProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
