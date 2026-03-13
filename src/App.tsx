import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import { PlayersProvider } from './contexts/PlayersContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Home from './pages/Dashboard';
import Rankings from './pages/Players';
import AllPlayers from './pages/AllPlayers';
import PlayerProfile from './pages/PlayerProfile';
import HeadToHead from './pages/HeadToHead';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';

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

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function PlayerRedirect() {
  const { id } = useParams();
  return <Navigate to={`/directory/${id}`} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <PlayersProvider>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
              <ScrollToTop />
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
                </Routes>
              </main>
            </div>
          </PlayersProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
