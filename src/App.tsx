import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Rankings from './pages/Players';
import PlayerDetail from './pages/PlayerDetail';
import Analytics from './pages/Analytics';
import HeadToHead from './pages/HeadToHead';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/players" element={<Rankings />} />
            <Route path="/players/:id" element={<PlayerDetail />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/head-to-head" element={<HeadToHead />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
