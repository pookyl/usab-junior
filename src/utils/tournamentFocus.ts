export interface TournamentFocusNavItem {
  key: 'home' | 'matches' | 'players' | 'draws';
  label: string;
  shortLabel: string;
  path: string;
}

export function buildTournamentFocusNavItems(tswId: string | null): TournamentFocusNavItem[] {
  if (!tswId) return [];

  const basePath = `/tournaments/${tswId}`;
  return [
    { key: 'home', label: 'Home', shortLabel: 'Home', path: basePath },
    { key: 'matches', label: 'Matches', shortLabel: 'Matches', path: `${basePath}/matches` },
    { key: 'players', label: 'Players', shortLabel: 'Players', path: `${basePath}/players` },
    { key: 'draws', label: 'Draws', shortLabel: 'Draws', path: `${basePath}/draws` },
  ];
}

const LAST_TOURNAMENT_PATH_KEY = 'tournament-focus-lastPath';

export function getLastTournamentPath(): string | null {
  try { return sessionStorage.getItem(LAST_TOURNAMENT_PATH_KEY); } catch { return null; }
}

export function setLastTournamentPath(path: string) {
  try { sessionStorage.setItem(LAST_TOURNAMENT_PATH_KEY, path); } catch { /* storage unavailable */ }
}

export function clearLastTournamentPath() {
  try { sessionStorage.removeItem(LAST_TOURNAMENT_PATH_KEY); } catch { /* storage unavailable */ }
}

function isTournamentPath(path: string, basePath: string): boolean {
  return path === basePath || path.startsWith(`${basePath}/`);
}

const TOURNAMENT_DETAIL_RE = /^\/tournaments\/[^/]+\/(player|draw|event)\/[^/]+$/;

export function isWithinTournamentFocusScope(
  pathname: string,
  activeTswId: string | null,
  fromPath?: string | null,
  lastTournamentPath?: string | null,
): boolean {
  if (!activeTswId) return false;
  const basePath = `/tournaments/${activeTswId}`;
  if (isTournamentPath(pathname, basePath)) return true;

  const hasActiveTournamentHistory =
    lastTournamentPath != null && isTournamentPath(lastTournamentPath, basePath);

  // Cross-tournament detail pages (player/draw/event from a different tournament):
  // keep mode if the user has recently been on the active tournament.
  if (TOURNAMENT_DETAIL_RE.test(pathname) && hasActiveTournamentHistory) {
    return true;
  }

  if (pathname.startsWith('/directory/')) {
    if (fromPath != null && isTournamentPath(fromPath, basePath)) return true;
    // Allow when fromPath is from any tournament and we have active tournament history
    // (cross-tournament exploration chain), or when fromPath is lost (page refresh).
    if (hasActiveTournamentHistory && (fromPath == null || fromPath.startsWith('/tournaments/'))) {
      return true;
    }
    return false;
  }

  return false;
}

