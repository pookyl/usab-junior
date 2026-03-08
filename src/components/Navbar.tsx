import { Link, useLocation } from 'react-router-dom';
import { Trophy, BarChart2, Home, Feather, Swords, Users } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', shortLabel: 'Home', icon: Home },
  { path: '/players', label: 'Rankings', shortLabel: 'Rankings', icon: Trophy },
  { path: '/directory', label: 'Players', shortLabel: 'Players', icon: Users },
  { path: '/analytics', label: 'Analytics', shortLabel: 'Charts', icon: BarChart2 },
  { path: '/head-to-head', label: 'Head to Head', shortLabel: 'H2H', icon: Swords },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <>
      {/* Desktop top nav (md+) */}
      <nav className="hidden md:block bg-slate-900 text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-violet-500 to-blue-600 p-2 rounded-lg">
                <Feather className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                USA<span className="text-violet-400">Junior</span>
                <span className="text-slate-400 font-normal text-sm ml-1.5">Badminton</span>
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

      {/* Mobile top bar (< md) — compact branding only */}
      <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="bg-gradient-to-br from-violet-500 to-blue-600 p-1.5 rounded-lg">
            <Feather className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            USA<span className="text-violet-400">Junior</span>
            <span className="text-slate-400 font-normal text-xs ml-1">Badminton</span>
          </span>
        </Link>
      </header>

      {/* Mobile bottom tab bar (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {navItems.map(({ path, shortLabel, icon: Icon }) => {
            const active =
              path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                  active
                    ? 'text-violet-600'
                    : 'text-slate-400 active:text-slate-600'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-[10px] font-medium ${active ? 'font-semibold' : ''}`}>
                  {shortLabel}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
