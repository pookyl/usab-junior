import { Link, useLocation } from 'react-router-dom';
import { Trophy, BarChart2, Home, Feather, Swords, Users } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/players', label: 'Rankings', icon: Trophy },
  { path: '/directory', label: 'Players', icon: Users },
  { path: '/analytics', label: 'Analytics', icon: BarChart2 },
  { path: '/head-to-head', label: 'Head to Head', icon: Swords },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="bg-slate-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-violet-500 to-blue-600 p-2 rounded-lg">
              <Feather className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              USA<span className="text-violet-400">Junior</span>
              <span className="text-slate-400 font-normal text-sm ml-1.5 hidden sm:inline">Badminton</span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const active =
                path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
