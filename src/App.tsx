import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import { PlayersProvider } from './contexts/PlayersContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Dashboard from './pages/Dashboard';
import Rankings from './pages/Players';
import AllPlayers from './pages/AllPlayers';
import PlayerProfile from './pages/PlayerProfile';
import HeadToHead from './pages/HeadToHead';

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
      <BrowserRouter>
        <PlayersProvider>
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
            <ScrollToTop />
            <Navbar />
            <main className="pb-20 md:pb-0">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/players" element={<Rankings />} />
                <Route path="/players/:id" element={<PlayerRedirect />} />
                <Route path="/directory" element={<AllPlayers />} />
                <Route path="/directory/:id" element={<PlayerProfile />} />
                <Route path="/analytics" element={<Navigate to="/players" replace />} />
                <Route path="/head-to-head" element={<HeadToHead />} />
              </Routes>
            </main>
          </div>
        </PlayersProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
