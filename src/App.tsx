import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Navbar from './components/Navbar';
import { PlayersProvider } from './contexts/PlayersContext';
import Dashboard from './pages/Dashboard';
import Rankings from './pages/Players';
import AllPlayers from './pages/AllPlayers';
import PlayerProfile from './pages/PlayerProfile';
import Analytics from './pages/Analytics';
import HeadToHead from './pages/HeadToHead';

function PlayerRedirect() {
  const { id } = useParams();
  return <Navigate to={`/directory/${id}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <PlayersProvider>
        <div className="min-h-screen bg-slate-50">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/players" element={<Rankings />} />
              <Route path="/players/:id" element={<PlayerRedirect />} />
              <Route path="/directory" element={<AllPlayers />} />
              <Route path="/directory/:id" element={<PlayerProfile />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/head-to-head" element={<HeadToHead />} />
            </Routes>
          </main>
        </div>
      </PlayersProvider>
    </BrowserRouter>
  );
}
