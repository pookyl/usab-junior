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

export function isWithinTournamentFocusScope(
  pathname: string,
  activeTswId: string | null,
  fromPath?: string | null,
): boolean {
  if (!activeTswId) return false;
  const basePath = `/tournaments/${activeTswId}`;
  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) return true;

  // Keep tournament mode when opening player profiles from a tournament route.
  if (pathname.startsWith('/directory/') && fromPath) {
    return fromPath === basePath || fromPath.startsWith(`${basePath}/`);
  }

  return false;
}

