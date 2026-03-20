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

export function isWithinTournamentFocusScope(pathname: string, activeTswId: string | null): boolean {
  if (!activeTswId) return false;
  const basePath = `/tournaments/${activeTswId}`;
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

