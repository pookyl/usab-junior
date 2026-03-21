import { describe, it, expect } from 'vitest';
import { buildTournamentFocusNavItems, isWithinTournamentFocusScope } from './tournamentFocus';

describe('buildTournamentFocusNavItems', () => {
  it('returns empty when tswId is missing', () => {
    expect(buildTournamentFocusNavItems(null)).toEqual([]);
  });

  it('builds the 4 tournament focus nav items in order', () => {
    const items = buildTournamentFocusNavItems('abc-123');
    expect(items.map((item) => item.label)).toEqual(['Home', 'Matches', 'Players', 'Draws']);
    expect(items.map((item) => item.path)).toEqual([
      '/tournaments/abc-123',
      '/tournaments/abc-123/matches',
      '/tournaments/abc-123/players',
      '/tournaments/abc-123/draws',
    ]);
  });
});

describe('isWithinTournamentFocusScope', () => {
  it('matches the active tournament home path', () => {
    expect(isWithinTournamentFocusScope('/tournaments/abc-123', 'abc-123')).toBe(true);
  });

  it('matches sub-routes under the active tournament', () => {
    expect(isWithinTournamentFocusScope('/tournaments/abc-123/matches', 'abc-123')).toBe(true);
    expect(isWithinTournamentFocusScope('/tournaments/abc-123/player/42', 'abc-123')).toBe(true);
  });

  it('rejects non-tournament routes and other tournament ids', () => {
    expect(isWithinTournamentFocusScope('/players', 'abc-123')).toBe(false);
    expect(isWithinTournamentFocusScope('/tournaments/xyz-999', 'abc-123')).toBe(false);
  });

  it('rejects partial id prefix matches', () => {
    expect(isWithinTournamentFocusScope('/tournaments/abc-1234', 'abc-123')).toBe(false);
  });

  it('keeps focus mode on player profile opened from active tournament flow', () => {
    expect(
      isWithinTournamentFocusScope('/directory/9999', 'abc-123', '/tournaments/abc-123/player/42'),
    ).toBe(true);
  });

  it('does not keep focus mode on player profile opened outside active tournament flow', () => {
    expect(isWithinTournamentFocusScope('/directory/9999', 'abc-123', '/directory/1234')).toBe(false);
    expect(isWithinTournamentFocusScope('/directory/9999', 'abc-123', null)).toBe(false);
  });

  it('falls back to lastTournamentPath when fromPath is missing', () => {
    expect(
      isWithinTournamentFocusScope('/directory/9999', 'abc-123', null, '/tournaments/abc-123/player/42'),
    ).toBe(true);
  });

  it('rejects profile when fromPath is non-tournament and no active tournament history', () => {
    expect(
      isWithinTournamentFocusScope('/directory/9999', 'abc-123', '/directory/1234'),
    ).toBe(false);
  });

  it('rejects profile when fromPath is non-tournament even with active tournament history', () => {
    expect(
      isWithinTournamentFocusScope('/directory/9999', 'abc-123', '/directory/1234', '/tournaments/abc-123/players'),
    ).toBe(false);
  });

  it('prefers fromPath over lastTournamentPath when fromPath is present', () => {
    expect(
      isWithinTournamentFocusScope('/directory/9999', 'abc-123', '/tournaments/abc-123/matches', '/tournaments/xyz-999'),
    ).toBe(true);
  });

  it('rejects when both fromPath and lastTournamentPath are missing', () => {
    expect(isWithinTournamentFocusScope('/directory/9999', 'abc-123', null, null)).toBe(false);
  });

  it('rejects when lastTournamentPath is from a different tournament', () => {
    expect(
      isWithinTournamentFocusScope('/directory/9999', 'abc-123', null, '/tournaments/xyz-999/player/1'),
    ).toBe(false);
  });

  // Cross-tournament exploration
  it('keeps mode on a different tournament player detail when active tournament history exists', () => {
    expect(
      isWithinTournamentFocusScope('/tournaments/xyz-999/player/42', 'abc-123', null, '/tournaments/abc-123/player/10'),
    ).toBe(true);
  });

  it('keeps mode on a different tournament draw detail when active tournament history exists', () => {
    expect(
      isWithinTournamentFocusScope('/tournaments/xyz-999/draw/5', 'abc-123', null, '/tournaments/abc-123/draws'),
    ).toBe(true);
  });

  it('exits mode on a different tournament hub (not a detail page)', () => {
    expect(
      isWithinTournamentFocusScope('/tournaments/xyz-999', 'abc-123', null, '/tournaments/abc-123/player/10'),
    ).toBe(false);
  });

  it('exits mode on a different tournament tab page (not a detail page)', () => {
    expect(
      isWithinTournamentFocusScope('/tournaments/xyz-999/matches', 'abc-123', null, '/tournaments/abc-123/player/10'),
    ).toBe(false);
  });

  it('does not keep mode on cross-tournament detail without active tournament history', () => {
    expect(
      isWithinTournamentFocusScope('/tournaments/xyz-999/player/42', 'abc-123', null, null),
    ).toBe(false);
  });

  it('keeps mode on profile reached from cross-tournament detail with active history', () => {
    expect(
      isWithinTournamentFocusScope('/directory/9999', 'abc-123', '/tournaments/xyz-999/player/42', '/tournaments/abc-123/player/10'),
    ).toBe(true);
  });

  it('keeps mode on profile with no fromPath but active tournament history (e.g. page refresh)', () => {
    expect(
      isWithinTournamentFocusScope('/directory/9999', 'abc-123', null, '/tournaments/abc-123/player/10'),
    ).toBe(true);
  });
});

describe('isWithinTournamentFocusScope — full navigation flow', () => {
  const ACTIVE = 'abc-123';

  // Simulates: enter tournament mode → players tab → player detail →
  // profile → click match-card name (different tournament) → that player's profile
  it('stays in scope through the entire cross-tournament exploration chain', () => {
    let lastTournamentPath: string | null = null;

    // Step 1: tournament players tab
    const step1 = '/tournaments/abc-123/players';
    expect(isWithinTournamentFocusScope(step1, ACTIVE, null, lastTournamentPath)).toBe(true);
    lastTournamentPath = step1;

    // Step 2: click a player → active tournament player detail
    const step2 = '/tournaments/abc-123/player/100';
    expect(isWithinTournamentFocusScope(step2, ACTIVE, step1, lastTournamentPath)).toBe(true);
    lastTournamentPath = step2;

    // Step 3: click "Player Profile" → directory page (fromPath = tournament player detail)
    const step3 = '/directory/5001';
    expect(isWithinTournamentFocusScope(step3, ACTIVE, step2, lastTournamentPath)).toBe(true);

    // Step 4: click player name on match card from a DIFFERENT tournament
    const step4 = '/tournaments/xyz-999/player/200';
    const step4From = step3; // fromPath is the profile page
    expect(isWithinTournamentFocusScope(step4, ACTIVE, step4From, lastTournamentPath)).toBe(true);
    // lastTournamentPath stays as step2 (only active tournament paths update it)

    // Step 5: click "Player Profile" on that cross-tournament detail
    const step5 = '/directory/6002';
    const step5From = step4; // fromPath is the cross-tournament detail
    expect(isWithinTournamentFocusScope(step5, ACTIVE, step5From, lastTournamentPath)).toBe(true);

    // Step 6: click yet another player name from another different tournament
    const step6 = '/tournaments/other-777/player/300';
    const step6From = step5;
    expect(isWithinTournamentFocusScope(step6, ACTIVE, step6From, lastTournamentPath)).toBe(true);

    // Step 7: that player's profile
    const step7 = '/directory/7003';
    const step7From = step6;
    expect(isWithinTournamentFocusScope(step7, ACTIVE, step7From, lastTournamentPath)).toBe(true);
  });

  it('exits when navigating to a non-detail page outside the active tournament', () => {
    const lastTournamentPath = '/tournaments/abc-123/player/100';

    expect(isWithinTournamentFocusScope('/', ACTIVE, null, lastTournamentPath)).toBe(false);
    expect(isWithinTournamentFocusScope('/players', ACTIVE, null, lastTournamentPath)).toBe(false);
    expect(isWithinTournamentFocusScope('/tournaments', ACTIVE, null, lastTournamentPath)).toBe(false);
    expect(isWithinTournamentFocusScope('/tournaments/xyz-999', ACTIVE, null, lastTournamentPath)).toBe(false);
    expect(isWithinTournamentFocusScope('/tournaments/xyz-999/matches', ACTIVE, null, lastTournamentPath)).toBe(false);
  });

  it('survives a page refresh mid-chain (fromPath lost)', () => {
    const lastTournamentPath = '/tournaments/abc-123/player/100';

    // Refresh on a cross-tournament player detail
    expect(
      isWithinTournamentFocusScope('/tournaments/xyz-999/player/42', ACTIVE, null, lastTournamentPath),
    ).toBe(true);

    // Refresh on a profile page
    expect(
      isWithinTournamentFocusScope('/directory/5001', ACTIVE, null, lastTournamentPath),
    ).toBe(true);
  });
});

