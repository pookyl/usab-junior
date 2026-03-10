import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Trophy, BarChart2, Home, Feather, Swords, Users, Moon, Sun, Monitor, Calendar, RefreshCw } from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { usePlayers } from '../contexts/PlayersContext';

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

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function DatePickerButton() {
  const { rankingsDate, availableDates, changeDate, loading } = usePlayers();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasMultiple = availableDates.length > 1;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => hasMultiple && setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg transition-colors ${
          open
            ? 'bg-slate-700 text-white'
            : hasMultiple
              ? 'text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer'
              : 'text-slate-400 cursor-default'
        }`}
        aria-label={`Rankings date: ${formatFullDate(rankingsDate)}`}
        title={`Rankings as of ${formatFullDate(rankingsDate)}`}
      >
        {loading ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <Calendar className="w-4 h-4" />
        )}
        <span className="hidden md:inline text-xs font-medium">{formatShortDate(rankingsDate)}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-700">
            Rankings Date
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {availableDates.map((date, i) => (
              <button
                key={date}
                onClick={() => { changeDate(date); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  date === rankingsDate
                    ? 'bg-violet-600 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {formatFullDate(date)}
                {i === 0 && <span className="ml-1.5 text-[10px] opacity-60">(Latest)</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
              <div className="ml-2 flex items-center gap-1">
                <DatePickerButton />
                <button
                  onClick={cycleMode}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                  aria-label={`Theme: ${MODE_LABEL[mode]}`}
                  title={`Theme: ${MODE_LABEL[mode]}`}
                >
                  <ThemeIcon className="w-4 h-4" />
                  <span className="text-xs font-medium">{MODE_LABEL[mode]}</span>
                </button>
              </div>
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
        <DatePickerButton />
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
