import { describe, expect, it } from 'vitest';
import { mergeTournamentMeta } from './useTournamentMeta';

describe('mergeTournamentMeta', () => {
  it('prefers route state values when they exist', () => {
    expect(
      mergeTournamentMeta(
        {
          name: 'Route Name',
          hostClub: 'Route Club',
          startDate: '2026-03-01',
        },
        {
          name: 'Cached Name',
          hostClub: 'Cached Club',
          startDate: '2026-02-28',
          endDate: '2026-03-02',
        },
      ),
    ).toEqual({
      name: 'Route Name',
      hostClub: 'Route Club',
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    });
  });

  it('falls back to cached values when route state is missing', () => {
    expect(
      mergeTournamentMeta(
        null,
        {
          name: 'Cached Name',
          hostClub: 'Cached Club',
          startDate: '2026-03-10',
          endDate: '2026-03-12',
        },
      ),
    ).toEqual({
      name: 'Cached Name',
      hostClub: 'Cached Club',
      startDate: '2026-03-10',
      endDate: '2026-03-12',
    });
  });
});
