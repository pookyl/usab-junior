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
});

