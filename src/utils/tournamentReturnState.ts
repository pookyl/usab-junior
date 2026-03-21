const playerOriginByPath = new Map<string, string>();
const drawOriginByPath = new Map<string, string>();
const eventOriginByPath = new Map<string, string>();

type TournamentDetailType = 'player' | 'draw' | 'event';

function getDetailMeta(pathname: string): { type: TournamentDetailType; tswId: string } | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 4 || segments[0] !== 'tournaments' || !segments[1]) return null;
  if (segments[2] === 'player' && segments[3]) return { type: 'player', tswId: segments[1] };
  if (segments[2] === 'draw' && segments[3]) return { type: 'draw', tswId: segments[1] };
  if (segments[2] === 'event' && segments[3]) return { type: 'event', tswId: segments[1] };
  return null;
}

function isValidOriginForTournament(tswId: string, fromPath: string): boolean {
  return fromPath.startsWith(`/tournaments/${tswId}/`) && !fromPath.includes('/player/');
}

export function rememberTournamentDetailOrigin(pathname: string, fromPath?: string): void {
  if (!fromPath) return;
  const detail = getDetailMeta(pathname);
  if (!detail) return;
  if (!isValidOriginForTournament(detail.tswId, fromPath)) return;

  if (detail.type === 'draw') {
    if (fromPath.includes('/draw/')) return;
    drawOriginByPath.set(pathname, fromPath);
    return;
  }

  if (detail.type === 'event') {
    if (fromPath.includes('/event/')) return;
    eventOriginByPath.set(pathname, fromPath);
    return;
  }

  playerOriginByPath.set(pathname, fromPath);
}

export function getTournamentPlayerOrigin(pathname: string): string | null {
  return playerOriginByPath.get(pathname) ?? null;
}

export function getTournamentDrawOrigin(pathname: string): string | null {
  return drawOriginByPath.get(pathname) ?? null;
}

export function getTournamentEventOrigin(pathname: string): string | null {
  return eventOriginByPath.get(pathname) ?? null;
}
