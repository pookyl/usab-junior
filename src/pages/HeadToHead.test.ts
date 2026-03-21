import { describe, it, expect } from 'vitest';
import {
  opponentMatches,
  playerMatchScore,
  normalizeMatch,
  parseScoreString,
  eventCategory,
  findMatchesBetween,
} from './HeadToHead';
import type { TswMatchResult, TswPlayerStats, H2HMatch } from '../types/junior';

function makeTswMatch(overrides: Partial<TswMatchResult> = {}): TswMatchResult {
  return {
    tournament: 'Test Tournament',
    event: 'BS U13',
    round: 'Round of 64',
    opponent: 'Unknown',
    partner: '',
    category: 'singles',
    score: '21-15, 21-8',
    won: true,
    date: 'Sat 1/14/2023',
    ...overrides,
  };
}

function makeH2HMatch(overrides: Partial<H2HMatch> = {}): H2HMatch {
  return {
    tournament: 'Test Tournament',
    tournamentUrl: '',
    event: 'BS U13',
    round: 'Final',
    duration: '',
    team1Players: ['Player A'],
    team2Players: ['Player B'],
    team1Won: true,
    team2Won: false,
    scores: [[21, 15], [21, 8]],
    date: 'Sat 1/14/2023',
    venue: '',
    ...overrides,
  };
}

// ── opponentMatches ──────────────────────────────────────────────────────────

describe('opponentMatches', () => {
  it('matches exact name in singles', () => {
    const mr = makeTswMatch({ opponent: 'Daniel Li' });
    expect(opponentMatches(mr, 'Daniel Li')).toBe(true);
  });

  it('matches case-insensitively', () => {
    const mr = makeTswMatch({ opponent: 'Daniel LI' });
    expect(opponentMatches(mr, 'Daniel Li')).toBe(true);
  });

  it('matches with leading/trailing whitespace', () => {
    const mr = makeTswMatch({ opponent: '  Daniel Li  ' });
    expect(opponentMatches(mr, ' Daniel Li ')).toBe(true);
  });

  it('rejects different player with same last name and first initial (the original bug)', () => {
    const mr = makeTswMatch({ opponent: 'Derik S Li' });
    expect(opponentMatches(mr, 'Daniel Li')).toBe(false);
  });

  it('rejects different player with same last name', () => {
    const mr = makeTswMatch({ opponent: 'Sophia Li' });
    expect(opponentMatches(mr, 'Daniel Li')).toBe(false);
  });

  it('rejects completely different player', () => {
    const mr = makeTswMatch({ opponent: 'John Smith' });
    expect(opponentMatches(mr, 'Daniel Li')).toBe(false);
  });

  it('matches player in doubles opponent (first position)', () => {
    const mr = makeTswMatch({ opponent: 'Alice Meng / Sophia Sun' });
    expect(opponentMatches(mr, 'Alice Meng')).toBe(true);
  });

  it('matches player in doubles opponent (second position)', () => {
    const mr = makeTswMatch({ opponent: 'Jacob Zhou / Alice Meng' });
    expect(opponentMatches(mr, 'Alice Meng')).toBe(true);
  });

  it('rejects when player is not in doubles opponent', () => {
    const mr = makeTswMatch({ opponent: 'Sophia Sun / Emily Li' });
    expect(opponentMatches(mr, 'Alice Meng')).toBe(false);
  });

  it('rejects partial name match in doubles', () => {
    const mr = makeTswMatch({ opponent: 'Alice Wang / Someone Meng' });
    expect(opponentMatches(mr, 'Alice Meng')).toBe(false);
  });

  it('rejects name that contains target as substring', () => {
    const mr = makeTswMatch({ opponent: 'Charlie Smith' });
    expect(opponentMatches(mr, 'Li')).toBe(false);
  });
});

// ── eventCategory ────────────────────────────────────────────────────────────

describe('eventCategory', () => {
  it('categorizes BS as Singles', () => {
    expect(eventCategory('BS U13')).toBe('Singles');
  });

  it('categorizes GS as Singles', () => {
    expect(eventCategory('GS U17')).toBe('Singles');
  });

  it('categorizes BD as Doubles', () => {
    expect(eventCategory('BD U15')).toBe('Doubles');
  });

  it('categorizes GD as Doubles', () => {
    expect(eventCategory('GD U13')).toBe('Doubles');
  });

  it('categorizes XD as Mixed', () => {
    expect(eventCategory('XD U15')).toBe('Mixed');
  });

  it('categorizes event with MIXED keyword', () => {
    expect(eventCategory('Mixed Doubles')).toBe('Mixed');
  });
});

// ── parseScoreString ─────────────────────────────────────────────────────────

describe('parseScoreString', () => {
  it('parses two-game score', () => {
    expect(parseScoreString('21-15, 21-8')).toEqual([[21, 15], [21, 8]]);
  });

  it('parses three-game score', () => {
    expect(parseScoreString('21-18, 19-21, 21-15')).toEqual([[21, 18], [19, 21], [21, 15]]);
  });

  it('returns empty for Walkover', () => {
    expect(parseScoreString('Walkover')).toEqual([]);
  });

  it('returns empty for empty string', () => {
    expect(parseScoreString('')).toEqual([]);
  });
});

// ── playerMatchScore ─────────────────────────────────────────────────────────

describe('playerMatchScore', () => {
  it('returns 3 for exact match', () => {
    expect(playerMatchScore('Daniel Li', ['Daniel Li'])).toBe(3);
  });

  it('returns 3 for exact match case-insensitive', () => {
    expect(playerMatchScore('Daniel Li', ['daniel li'])).toBe(3);
  });

  it('returns 2 for substring match', () => {
    expect(playerMatchScore('Daniel Li', ['Daniel Li Jr'])).toBe(2);
  });

  it('returns 1 for last-name-only match', () => {
    expect(playerMatchScore('Daniel Li', ['Sophia Li'])).toBe(1);
  });

  it('returns 0 for no match', () => {
    expect(playerMatchScore('Daniel Li', ['John Smith'])).toBe(0);
  });

  it('returns best score across multiple team players', () => {
    expect(playerMatchScore('Alice Meng', ['Sophia Sun', 'Alice Meng'])).toBe(3);
  });
});

// ── normalizeMatch ───────────────────────────────────────────────────────────

describe('normalizeMatch', () => {
  it('keeps match unchanged when player A is on team1', () => {
    const match = makeH2HMatch({
      team1Players: ['Daniel Li'],
      team2Players: ['John Smith'],
      team1Won: true,
      team2Won: false,
      scores: [[21, 15], [21, 8]],
    });
    const result = normalizeMatch(match, 'Daniel Li');
    expect(result.team1Players).toEqual(['Daniel Li']);
    expect(result.team2Players).toEqual(['John Smith']);
    expect(result.team1Won).toBe(true);
  });

  it('swaps teams when player A is on team2', () => {
    const match = makeH2HMatch({
      team1Players: ['John Smith'],
      team2Players: ['Daniel Li'],
      team1Won: true,
      team2Won: false,
      scores: [[21, 15], [21, 8]],
    });
    const result = normalizeMatch(match, 'Daniel Li');
    expect(result.team1Players).toEqual(['Daniel Li']);
    expect(result.team2Players).toEqual(['John Smith']);
    expect(result.team1Won).toBe(false);
    expect(result.team2Won).toBe(true);
    expect(result.scores).toEqual([[15, 21], [8, 21]]);
  });
});

// ── findMatchesBetween ───────────────────────────────────────────────────────

describe('findMatchesBetween', () => {
  const emptyWL = { wins: 0, losses: 0, total: 0, winPct: 0 };
  const emptyCat = { career: emptyWL, thisYear: emptyWL };
  const statsA: TswPlayerStats = {
    tswProfileUrl: null,
    tswSearchUrl: '',
    total: emptyCat,
    singles: emptyCat,
    doubles: emptyCat,
    mixed: emptyCat,
    recentHistory: [],
    tournamentsByYear: {
      '2025': [
        {
          name: 'Test Tournament',
          url: '',
          dates: '2025',
          location: '',
          events: [],
          matches: [
            makeTswMatch({ opponent: 'Kennedy Y Wu', event: 'BS U13', date: 'Fri 3/21/2025', won: false }),
            makeTswMatch({ opponent: 'Derik S Li', event: 'BS U11', date: 'Sat 1/14/2023', won: true }),
            makeTswMatch({ opponent: 'Sophia Li', event: 'GS U13', date: 'Mon 2/19/2024', won: false }),
            makeTswMatch({ opponent: 'Kennedy Y Wu / Partner', event: 'BD U11', date: 'Sun 9/1/2024', category: 'doubles', won: false }),
          ],
        },
      ],
    },
  };

  it('finds exact matches against player B (singles and doubles)', () => {
    const matches = findMatchesBetween(statsA, 'Daniel Li', 'Kennedy Y Wu');
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.date)).toContain('Fri 3/21/2025');
    expect(matches.map((m) => m.date)).toContain('Sun 9/1/2024');
  });

  it('preserves correct win/loss from player perspective', () => {
    const matches = findMatchesBetween(statsA, 'Daniel Li', 'Kennedy Y Wu');
    const singles = matches.find((m) => m.date === 'Fri 3/21/2025')!;
    expect(singles.team1Players).toContain('Daniel Li');
    expect(singles.team1Won).toBe(false);
    expect(singles.team2Won).toBe(true);

    const doubles = matches.find((m) => m.date === 'Sun 9/1/2024')!;
    expect(doubles.team1Players).toContain('Daniel Li');
    expect(doubles.team1Won).toBe(false);
    expect(doubles.team2Won).toBe(true);
  });

  it('does not match similarly-named players', () => {
    const matches = findMatchesBetween(statsA, 'Daniel Li', 'Daniel Li');
    expect(matches).toHaveLength(0);
  });

  it('does not match different player with same last name', () => {
    const matches = findMatchesBetween(statsA, 'Daniel Li', 'Derik S Li');
    expect(matches).toHaveLength(1);
    expect(matches[0].date).toBe('Sat 1/14/2023');
  });

  it('returns empty for null stats', () => {
    expect(findMatchesBetween(null, 'Daniel Li', 'Kennedy Y Wu')).toEqual([]);
  });
});

