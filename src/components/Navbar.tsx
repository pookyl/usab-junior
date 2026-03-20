import { Link, useLocation } from 'react-router-dom';
import { Trophy, Home, Swords, Users, Moon, Sun, Monitor, Award, List } from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { useTournamentFocus } from '../contexts/TournamentFocusContext';
import { buildTournamentFocusNavItems } from '../utils/tournamentFocus';
import { getLastTournamentSubpagePath } from '../utils/tournamentReturnState';

const navItems = [
  { path: '/', label: 'Home', shortLabel: 'Home', icon: Home },
  { path: '/players', label: 'Rankings', shortLabel: 'Rankings', icon: Trophy },
  { path: '/directory', label: 'Players', shortLabel: 'Players', icon: Users },
  { path: '/tournaments', label: 'Tournaments', shortLabel: 'Tournaments', icon: Award },
  { path: '/head-to-head', label: 'H2H', shortLabel: 'H2H', icon: Swords },
];

const MODE_CYCLE: ThemeMode[] = ['system', 'light', 'dark'];
const MODE_ICON = { light: Sun, dark: Moon, system: Monitor };
const MODE_LABEL = { light: 'Light', dark: 'Dark', system: 'Auto' };
const TOURNAMENT_NAV_ICON = { home: Home, matches: Swords, players: Users, draws: List } as const;

export default function Navbar() {
  const location = useLocation();
  const { mode, setMode } = useTheme();
  const { isActive: isTournamentModeActive, activeTswId, isTransitioning } = useTournamentFocus();
  const tournamentReturnPath = getLastTournamentSubpagePath();
  const tournamentsTarget = tournamentReturnPath ?? '/tournaments';
  const tournamentsState = tournamentReturnPath ? { restoreTournamentScroll: true } : undefined;
  const tournamentNavItems = buildTournamentFocusNavItems(activeTswId).map((item) => ({
    ...item,
    icon: TOURNAMENT_NAV_ICON[item.key],
  }));
  const showTournamentNav = isTournamentModeActive && tournamentNavItems.length > 0;
  const tournamentOverviewPath = tournamentNavItems[0]?.path ?? null;

  const cycleMode = () => {
    const idx = MODE_CYCLE.indexOf(mode);
    setMode(MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]);
  };

  const getNavTarget = (path: string) => (path === '/tournaments' ? tournamentsTarget : path);
  const getNavState = (path: string) => (path === '/tournaments' ? tournamentsState : undefined);
  const desktopNavItems = showTournamentNav ? tournamentNavItems : navItems;
  const topBarBackgroundClass = showTournamentNav
    ? 'bg-gradient-to-r from-violet-900 to-indigo-900'
    : 'bg-slate-900';
  const topBarMutedTextClass = showTournamentNav ? 'text-violet-200' : 'text-slate-400';
  const topBarHoverClass = showTournamentNav ? 'hover:bg-violet-800/70' : 'hover:bg-slate-800';
  const topBarButtonTextClass = showTournamentNav ? 'text-violet-200' : 'text-slate-300';

  const ThemeIcon = MODE_ICON[mode];

  return (
    <>
      {/* Desktop top nav (md+) */}
      <nav className={`hidden md:block ${topBarBackgroundClass} text-white shadow-lg sticky top-0 z-40 pt-[env(safe-area-inset-top)] transition-colors duration-200 motion-reduce:transition-none`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/icon-192.png" alt="" className="w-9 h-9 rounded-lg" />
              <span className="text-xl font-bold tracking-tight">
                USAB<span className="text-violet-400"> Junior</span>
                <span className={`${topBarMutedTextClass} font-normal text-sm ml-1.5`}>
                  Hub
                  {showTournamentNav && <span className="ml-2 text-violet-300">· Tournament mode</span>}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-1">
              {desktopNavItems.map(({ path, label, icon: Icon }) => {
                const active =
                  path === '/' || path === tournamentOverviewPath
                    ? location.pathname === path
                    : location.pathname.startsWith(path);
                return (
                  <Link
                    key={path}
                    to={showTournamentNav ? path : getNavTarget(path)}
                    state={showTournamentNav ? undefined : getNavState(path)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-violet-600 text-white'
                        : `text-white ${topBarHoverClass}`
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
              <div className="ml-2 flex items-center gap-1">
                <button
                  onClick={cycleMode}
                  className={`p-2 rounded-lg ${topBarButtonTextClass} ${topBarHoverClass} hover:text-white transition-colors`}
                  aria-label={`Theme: ${MODE_LABEL[mode]}`}
                  title={`Theme: ${MODE_LABEL[mode]}`}
                >
                  <ThemeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile top bar (< md) — compact branding only */}
      <header className={`md:hidden ${topBarBackgroundClass} text-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-3 sticky top-0 z-40 transition-colors duration-200 motion-reduce:transition-none`}>
        <div className="flex items-center gap-2.5 flex-1">
          <img src="/icon-192.png" alt="" className="w-8 h-8 rounded-lg" />
          <span className="text-lg font-bold tracking-tight">
            USAB<span className="text-violet-400"> Junior</span>
            <span className={`${topBarMutedTextClass} font-normal text-xs ml-1`}>
              Hub
              {showTournamentNav && <span className="ml-1 text-violet-300">· Tournament mode</span>}
            </span>
          </span>
        </div>
        <button
          onClick={cycleMode}
          className={`p-1.5 rounded-lg ${topBarButtonTextClass} ${topBarHoverClass} hover:text-white transition-colors`}
          aria-label={`Theme: ${MODE_LABEL[mode]}`}
          title={`Theme: ${MODE_LABEL[mode]}`}
        >
          <ThemeIcon className="w-4 h-4" />
        </button>
      </header>

      {/* Mobile bottom tab bar (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 pb-[env(safe-area-inset-bottom)] transition-colors duration-200 motion-reduce:transition-none">
        <div className={`flex items-stretch transition-all duration-200 motion-reduce:transition-none ${
          isTransitioning ? 'opacity-80 scale-[0.99]' : 'opacity-100 scale-100'
        }`}>
          {showTournamentNav
            ? tournamentNavItems.map(({ path, shortLabel, icon: Icon }) => {
              const active =
                path === tournamentOverviewPath
                  ? location.pathname === path
                  : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                    active
                      ? 'text-violet-600 dark:text-violet-400'
                      : 'text-slate-600 dark:text-slate-300 active:text-slate-700 dark:active:text-slate-200'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                  <span className={`text-[10px] font-medium ${active ? 'font-semibold' : ''}`}>
                    {shortLabel}
                  </span>
                </Link>
              );
            })
            : navItems.map(({ path, shortLabel, icon: Icon }) => {
              const active =
                path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={getNavTarget(path)}
                  state={getNavState(path)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                    active
                      ? 'text-violet-600 dark:text-violet-400'
                      : 'text-slate-600 dark:text-slate-300 active:text-slate-700 dark:active:text-slate-200'
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
