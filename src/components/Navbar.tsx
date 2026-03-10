import { Link, useLocation } from 'react-router-dom';
import { Trophy, BarChart2, Home, Feather, Swords, Users, Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';

const navItems = [
  { path: '/', label: 'Dashboard', shortLabel: 'Home', icon: Home },
  { path: '/players', label: 'Rankings', shortLabel: 'Rankings', icon: Trophy },
  { path: '/directory', label: 'Players', shortLabel: 'Players', icon: Users },
  { path: '/analytics', label: 'Analytics', shortLabel: 'Charts', icon: BarChart2 },
  { path: '/head-to-head', label: 'Head to Head', shortLabel: 'H2H', icon: Swords },
];

const MODE_CYCLE: ThemeMode[] = ['system', 'light', 'dark'];
const MODE_ICON = { light: Sun, dark: Moon, system: Monitor };
const MODE_LABEL = { light: 'Light', dark: 'Dark', system: 'Auto' };

export default function Navbar() {
  const location = useLocation();
  const { mode, setMode } = useTheme();

  const cycleMode = () => {
    const idx = MODE_CYCLE.indexOf(mode);
    setMode(MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]);
  };

  const ThemeIcon = MODE_ICON[mode];

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
              <button
                onClick={cycleMode}
                className="ml-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                aria-label={`Theme: ${MODE_LABEL[mode]}`}
                title={`Theme: ${MODE_LABEL[mode]}`}
              >
                <ThemeIcon className="w-4 h-4" />
                <span className="text-xs font-medium">{MODE_LABEL[mode]}</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile top bar (< md) — compact branding only */}
      <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <Link to="/" className="flex items-center gap-2.5 flex-1">
          <div className="bg-gradient-to-br from-violet-500 to-blue-600 p-1.5 rounded-lg">
            <Feather className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            USA<span className="text-violet-400">Junior</span>
            <span className="text-slate-400 font-normal text-xs ml-1">Badminton</span>
          </span>
        </Link>
        <button
          onClick={cycleMode}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          aria-label={`Theme: ${MODE_LABEL[mode]}`}
        >
          <ThemeIcon className="w-4 h-4" />
          <span className="text-[10px] font-medium">{MODE_LABEL[mode]}</span>
        </button>
      </header>

      {/* Mobile bottom tab bar (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 pb-[env(safe-area-inset-bottom)]">
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
                    ? 'text-violet-600 dark:text-violet-400'
                    : 'text-slate-400 dark:text-slate-500 active:text-slate-600'
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
