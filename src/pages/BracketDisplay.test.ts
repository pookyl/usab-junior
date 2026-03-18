import { describe, it, expect } from 'vitest';
import { buildDisplayRounds } from './TournamentDetail';
import type { BracketSection, BracketMatch, BracketEntry } from '../types/junior';

// ── Helpers ──────────────────────────────────────────────────────────────────

function M(
  roundLevel: number,
  matchNum: number,
  winner: BracketMatch['winner'],
  score: string[] = [],
  walkover = false,
  retired = false,
): BracketMatch {
  return {
    matchId: `${roundLevel}${String(matchNum).padStart(3, '0')}`,
    roundLevel,
    matchNum,
    winner,
    score,
    retired,
    walkover,
  };
}

function E(position: number, name: string, seed = '', playerId: number | null = null, bye = false): BracketEntry {
  return { position, name, seed, club: '', playerId, bye, partner: '', partnerPlayerId: null };
}

function W(name: string, playerId: number | null = null, seed = '', partner = '', partnerPlayerId: number | null = null): BracketMatch['winner'] {
  return { name, playerId, seed, club: '', partner, partnerPlayerId };
}

function section(name: string, rounds: string[], entries: BracketEntry[], matches: BracketMatch[]): BracketSection {
  return { name, rounds, entries, matches };
}

function roundNames(result: ReturnType<typeof buildDisplayRounds>): string[] {
  return result.rounds.map(r => r.name);
}

function roundMatchCounts(result: ReturnType<typeof buildDisplayRounds>): number[] {
  return result.rounds.map(r => r.matches.length);
}

// ── Regular Main Draw ────────────────────────────────────────────────────────

describe('buildDisplayRounds — regular main draw', () => {
  const mainDraw16 = section(
    'MD',
    ['Round 1', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner'],
    [
      E(1, 'Jeffrey Chang', '1', 3), E(2, 'Bye', '', null, true),
      E(3, 'Neel Auro Chandra', '', 2), E(4, 'Bye', '', null, true),
      E(5, 'Andre Chim', '', 8), E(6, 'Bye', '', null, true),
      E(7, 'Adam Tay', '', 30), E(8, 'Anderson Lin', '', 18),
      E(9, 'Weslie Chen', '', 5), E(10, 'Arthur Heng Lee', '', 16),
      E(11, 'Bye', '', null, true), E(12, 'Aaron Brijesh', '', 1),
      E(13, 'Bye', '', null, true), E(14, 'Kevin Shi', '', 28),
      E(15, 'Bye', '', null, true), E(16, 'Kelvin Chong', '2', 9),
    ],
    [
      // R1 (L4): 8 matches — 2 scored, 6 byes/walkovers
      M(4, 1, W('Jeffrey Chang', 3, '1'), []),
      M(4, 2, W('Neel Auro Chandra', 2), []),
      M(4, 3, W('Andre Chim', 8), []),
      M(4, 4, W('Adam Tay', 30), ['21-19', '22-24', '21-8']),
      M(4, 5, W('Arthur Heng Lee', 16), ['16-21', '21-16', '21-17']),
      M(4, 6, W('Aaron Brijesh', 1), []),
      M(4, 7, W('Kevin Shi', 28), []),
      M(4, 8, W('Kelvin Chong', 9, '2'), []),
      // QF (L3): 4 matches — 3 scored, 1 walkover
      M(3, 1, W('Jeffrey Chang', 3, '1'), ['24-22', '21-17']),
      M(3, 2, W('Andre Chim', 8), ['21-13', '21-13']),
      M(3, 3, W('Arthur Heng Lee', 16), [], true),
      M(3, 4, W('Kevin Shi', 28), ['21-13', '21-10']),
      // SF (L2): 2 matches
      M(2, 1, W('Andre Chim', 8), ['21-12', '21-17']),
      M(2, 2, W('Arthur Heng Lee', 16), ['21-18', '21-18']),
      // F (L1): 1 match
      M(1, 1, W('Arthur Heng Lee', 16), ['21-12', '17-21', '22-20']),
    ],
  );

  it('should not detect feed-in', () => {
    const result = buildDisplayRounds(mainDraw16);
    expect(result.hasFeedIn).toBe(false);
  });

  it('should produce correct round structure', () => {
    const result = buildDisplayRounds(mainDraw16);
    expect(roundNames(result)).toEqual([
      'Round of 16', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner',
    ]);
    expect(roundMatchCounts(result)).toEqual([8, 4, 2, 1, 1]);
  });

  it('should map entries to first round players', () => {
    const result = buildDisplayRounds(mainDraw16);
    const r1 = result.rounds[0];
    expect(r1.matches[0].player1?.name).toBe('Jeffrey Chang');
    expect(r1.matches[0].player1?.seed).toBe('1');
    expect(r1.matches[0].player1?.position).toBe(1);
    expect(r1.matches[0].player2?.name).toBe('Bye');
    expect(r1.matches[0].player2?.bye).toBe(true);
  });

  it('should set won flag on winning players', () => {
    const result = buildDisplayRounds(mainDraw16);
    const qf = result.rounds[1];
    // QF match 1: Jeffrey Chang beat Neel Auro Chandra → Jeffrey won
    expect(qf.matches[0].player1?.name).toBe('Jeffrey Chang');
    expect(qf.matches[0].player1?.won).toBe(true);
  });

  it('should generate Winner column from finals result', () => {
    const result = buildDisplayRounds(mainDraw16);
    const winner = result.rounds[result.rounds.length - 1];
    expect(winner.name).toBe('Winner');
    expect(winner.matches[0].player1?.name).toBe('Arthur Heng Lee');
    expect(winner.matches[0].player1?.won).toBe(true);
  });

  it('should not produce feedInPlayer on any match', () => {
    const result = buildDisplayRounds(mainDraw16);
    for (const round of result.rounds) {
      for (const match of round.matches) {
        expect(match.feedInPlayer).toBeUndefined();
      }
    }
  });

  it('should handle byes without false feed-in detection', () => {
    const result = buildDisplayRounds(mainDraw16);
    // R1 has 6 unscored + 2 scored, but count == expected → no feed-in
    expect(result.hasFeedIn).toBe(false);
    expect(result.rounds[0].matches.length).toBe(8);
  });

  it('should carry walkover flag', () => {
    const result = buildDisplayRounds(mainDraw16);
    const qf = result.rounds[1];
    expect(qf.matches[2].walkover).toBe(true);
  });
});

// ── Regular Main Draw — 128 entries (draw/1 BS U11) ──────────────────────────

describe('buildDisplayRounds — 128-entry main draw (draw/1)', () => {
  function build128Draw(): BracketSection {
    // 128 entries: positions 1-128, alternating real players and byes
    const entries: BracketEntry[] = [];
    for (let i = 1; i <= 128; i++) {
      const isBye = i % 2 === 0 && i <= 64 || i % 2 === 1 && i > 64;
      if (isBye) {
        entries.push(E(i, 'Bye', '', null, true));
      } else {
        const seed = i === 1 ? '1' : i === 128 ? '2' : '';
        entries.push(E(i, `Player${i}`, seed, i));
      }
    }

    const matches: BracketMatch[] = [];
    // L7: 64 matches (R1) — mostly byes, first two scored
    for (let i = 1; i <= 64; i++) {
      if (i <= 2) {
        matches.push(M(7, i, W(`Player${i * 2 - 1}`, i * 2 - 1, i === 1 ? '1' : ''), ['21-8', '21-5']));
      } else {
        matches.push(M(7, i, W(`Player${i}`, i)));
      }
    }
    // L6: 32 matches — winners are the odd-numbered L7 winners
    for (let i = 1; i <= 32; i++) {
      const winnerId = i * 2 - 1; // Player from L7 match i*2-1
      matches.push(M(6, i, W(`Player${winnerId}`, winnerId), ['21-10', '21-8']));
    }
    // L5: 16 matches — winners are L6 odd winners
    for (let i = 1; i <= 16; i++) {
      const winnerId = (i * 2 - 1) * 2 - 1;
      matches.push(M(5, i, W(`Player${winnerId}`, winnerId), ['21-6', '21-5']));
    }
    // L4: 8 matches
    for (let i = 1; i <= 8; i++) {
      matches.push(M(4, i, W(`QF${i}`, 400 + i), ['21-17', '21-15']));
    }
    // L3: 4 matches
    for (let i = 1; i <= 4; i++) {
      matches.push(M(3, i, W(`SF${i}`, 400 + i * 2 - 1), ['21-18', '21-18']));
    }
    // L2: 2 matches — winner of SF1 vs SF2, SF3 vs SF4
    matches.push(M(2, 1, W('SF1', 401), ['21-19', '21-19']));
    matches.push(M(2, 2, W('SF4', 407), ['21-15', '21-10']));
    // L1: Finals — SF1 (id=401) wins
    matches.push(M(1, 1, W('SF1', 401), ['21-11', '21-14']));

    return section(
      'BS U11',
      ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner'],
      entries,
      matches,
    );
  }

  it('should not detect feed-in', () => {
    expect(build128Draw().matches.length).toBe(127);
    expect(buildDisplayRounds(build128Draw()).hasFeedIn).toBe(false);
  });

  it('should produce 8 rounds (7 playing + winner)', () => {
    const result = buildDisplayRounds(build128Draw());
    expect(result.rounds.length).toBe(8);
    expect(result.rounds[result.rounds.length - 1].name).toBe('Winner');
  });

  it('should have correct round names for 128 draw', () => {
    const result = buildDisplayRounds(build128Draw());
    expect(roundNames(result)).toEqual([
      'Round of 128', 'Round of 64', 'Round of 32', 'Round of 16',
      'Quarter Finals', 'Semi Finals', 'Finals', 'Winner',
    ]);
  });

  it('should have correct match counts halving each round', () => {
    const result = buildDisplayRounds(build128Draw());
    expect(roundMatchCounts(result)).toEqual([64, 32, 16, 8, 4, 2, 1, 1]);
  });

  it('should map 128 entries to first round players', () => {
    const result = buildDisplayRounds(build128Draw());
    const r1 = result.rounds[0];
    expect(r1.matches.length).toBe(64);
    expect(r1.matches[0].player1?.name).toBe('Player1');
    expect(r1.matches[0].player1?.seed).toBe('1');
    expect(r1.matches[0].player2?.bye).toBe(true);
  });

  it('should generate Winner column from finals winner', () => {
    const result = buildDisplayRounds(build128Draw());
    const winner = result.rounds[result.rounds.length - 1];
    expect(winner.matches[0].player1?.name).toBe('SF1');
    expect(winner.matches[0].player1?.won).toBe(true);
  });

  it('should handle mixed scored/unscored R1 without false feed-in', () => {
    const result = buildDisplayRounds(build128Draw());
    // R1 has 2 scored + 62 unscored, count == expected (64) → no feed-in
    expect(result.hasFeedIn).toBe(false);
    expect(result.rounds[0].matches.length).toBe(64);
  });
});

// ── Regular Main Draw — 64-entry BD (doubles) ───────────────────────────────

describe('buildDisplayRounds — 64-entry BD doubles main draw', () => {
  function build64DoublesMainDraw(): BracketSection {
    const entries: BracketEntry[] = [];
    for (let i = 1; i <= 64; i++) {
      const isBye = i % 2 === 0 && i <= 32 || i % 2 === 1 && i > 32;
      if (isBye) {
        entries.push({ position: i, name: 'Bye', seed: '', club: '', playerId: null, bye: true, partner: '', partnerPlayerId: null });
      } else {
        const seed = i === 1 ? '1' : i === 64 ? '2' : '';
        entries.push({
          position: i, name: `Player${i}`, seed, club: '', playerId: i, bye: false,
          partner: `Partner${i}`, partnerPlayerId: i + 1000,
        });
      }
    }

    const matches: BracketMatch[] = [];
    // L6: 32 matches (R1) — winners match odd-position entry playerIds
    for (let i = 1; i <= 32; i++) {
      const winnerId = i * 2 - 1;
      if (i <= 4) {
        matches.push(M(6, i, W(`Player${winnerId}`, winnerId, '', `Partner${winnerId}`, winnerId + 1000), ['21-10', '21-8']));
      } else {
        matches.push(M(6, i, W(`Player${winnerId}`, winnerId, '', `Partner${winnerId}`, winnerId + 1000)));
      }
    }
    // L5: 16 matches (R2) — winners from L6 odds
    for (let i = 1; i <= 16; i++) {
      const winnerId = (i * 2 - 1) * 2 - 1;
      matches.push(M(5, i, W(`Player${winnerId}`, winnerId, '', `Partner${winnerId}`, winnerId + 1000), ['21-12', '21-9']));
    }
    // L4: 8 matches (R3)
    for (let i = 1; i <= 8; i++) {
      const winnerId = ((i * 2 - 1) * 2 - 1) * 2 - 1;
      matches.push(M(4, i, W(`Player${winnerId}`, winnerId, '', `Partner${winnerId}`, winnerId + 1000), ['21-15', '21-10']));
    }
    // L3: 4 matches (QF)
    for (let i = 1; i <= 4; i++) {
      matches.push(M(3, i, W(`QF${i}`, 300 + i, '', `QFP${i}`, 1300 + i), ['21-18', '21-16']));
    }
    // L2: 2 matches (SF) — QF1 and QF3 advance
    matches.push(M(2, 1, W('QF1', 301, '', 'QFP1', 1301), ['21-19', '21-17']));
    matches.push(M(2, 2, W('QF4', 304, '', 'QFP4', 1304), ['21-15', '21-12']));
    // L1: 1 match (Finals) — QF1 wins
    matches.push(M(1, 1, W('QF1', 301, '', 'QFP1', 1301), ['21-14', '21-16']));

    return section(
      'BD U11',
      ['Round 1', 'Round 2', 'Round 3', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner'],
      entries,
      matches,
    );
  }

  it('should not detect feed-in', () => {
    expect(buildDisplayRounds(build64DoublesMainDraw()).hasFeedIn).toBe(false);
  });

  it('should produce correct round structure for 64-entry draw', () => {
    const result = buildDisplayRounds(build64DoublesMainDraw());
    expect(roundNames(result)).toEqual([
      'Round of 64', 'Round of 32', 'Round of 16', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner',
    ]);
    expect(roundMatchCounts(result)).toEqual([32, 16, 8, 4, 2, 1, 1]);
  });

  it('should carry partner names through entries to first round', () => {
    const result = buildDisplayRounds(build64DoublesMainDraw());
    const r1 = result.rounds[0];
    expect(r1.matches[0].player1?.name).toBe('Player1');
    expect(r1.matches[0].player1?.partner).toBe('Partner1');
    expect(r1.matches[0].player1?.partnerPlayerId).toBe(1001);
  });

  it('should carry partner names on winner propagation', () => {
    const result = buildDisplayRounds(build64DoublesMainDraw());
    const r2 = result.rounds[1];
    expect(r2.matches[0].player1?.partner).toBeTruthy();
  });

  it('should generate Winner column with partner', () => {
    const result = buildDisplayRounds(build64DoublesMainDraw());
    const winner = result.rounds[result.rounds.length - 1];
    expect(winner.matches[0].player1?.name).toBe('QF1');
    expect(winner.matches[0].player1?.partner).toBe('QFP1');
    expect(winner.matches[0].player1?.won).toBe(true);
  });

  it('should handle bye entries without partners', () => {
    const result = buildDisplayRounds(build64DoublesMainDraw());
    const r1 = result.rounds[0];
    expect(r1.matches[0].player2?.bye).toBe(true);
    expect(r1.matches[0].player2?.partner).toBe('');
  });

  it('should set won flag correctly on doubles players', () => {
    const result = buildDisplayRounds(build64DoublesMainDraw());
    // R2 (L5) winners come from L6 — L5#1 winner is Player1 (id=1)
    // In R2 display, player1 comes from L6#1 winner (Player1,id=1), player2 from L6#2 (Player3,id=3)
    // L5#1 winner id=1 → player1 won=true
    const r2 = result.rounds[1];
    expect(r2.matches[0].player1?.won).toBe(true);
    expect(r2.matches[0].player2?.won).toBe(false);
  });
});

// ── Small Feed-in Consolation (16-entry, draw/14) ────────────────────────────

describe('buildDisplayRounds — small feed-in consolation (draw/14)', () => {
  const consolation14 = section(
    'MD - Consolation',
    ['Round 1', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner'],
    [],
    [
      // L5: 8 entry-level matches (promoted to entries)
      M(5, 1, null), M(5, 2, null), M(5, 3, null),
      M(5, 4, W('Anderson Lin', 18)),
      M(5, 5, W('Weslie Chen', 5)),
      M(5, 6, null), M(5, 7, null), M(5, 8, null),
      // L4: 8 matches — feed-in level, all unscored
      M(4, 1, null),                                    // ODD: continuation (empty)
      M(4, 2, W('Kelvin Chong', 9, '2')),               // EVEN: feed-in
      M(4, 3, W('Anderson Lin', 18)),                    // ODD: continuation
      M(4, 4, null),                                     // EVEN: feed-in (empty)
      M(4, 5, W('Weslie Chen', 5)),                      // ODD: continuation
      M(4, 6, W('Adam Tay', 30)),                        // EVEN: feed-in
      M(4, 7, null),                                     // ODD: continuation (empty)
      M(4, 8, W('Neel Auro Chandra', 2)),                // EVEN: feed-in
      // L3: 4 matches — normal round
      M(3, 1, W('Kelvin Chong', 9, '2')),
      M(3, 2, W('Anderson Lin', 18)),
      M(3, 3, W('Adam Tay', 30), [], true),
      M(3, 4, W('Neel Auro Chandra', 2)),
      // L2: 2 matches
      M(2, 1, W('Anderson Lin', 18), [], true),
      M(2, 2, W('Neel Auro Chandra', 2), ['21-19', '23-21']),
      // L1: 1 match
      M(1, 1, W('Neel Auro Chandra', 2), ['2-1']),
    ],
  );

  it('should detect feed-in', () => {
    expect(buildDisplayRounds(consolation14).hasFeedIn).toBe(true);
  });

  it('should NOT merge feed-in level (no subsequent feed-in)', () => {
    const result = buildDisplayRounds(consolation14);
    // L4 should remain as a displayed round with 4 continuation matches
    expect(result.rounds[0].matches.length).toBe(4);
  });

  it('should attach feedInPlayer from even-numbered matches', () => {
    const result = buildDisplayRounds(consolation14);
    const r1 = result.rounds[0];
    expect(r1.matches[0].feedInPlayer?.name).toBe('Kelvin Chong');
    expect(r1.matches[0].feedInPlayer?.seed).toBe('2');
    expect(r1.matches[1].feedInPlayer).toBeNull(); // L4#4 winner is null
    expect(r1.matches[2].feedInPlayer?.name).toBe('Adam Tay');
    expect(r1.matches[3].feedInPlayer?.name).toBe('Neel Auro Chandra');
  });

  it('should use entries from L5 promotion for first round players', () => {
    const result = buildDisplayRounds(consolation14);
    const r1 = result.rounds[0];
    // Continuation match 0 pairs entries 0+1 (both null/bye)
    expect(r1.matches[0].player1?.bye).toBe(true);
    expect(r1.matches[0].player2?.bye).toBe(true);
    // Continuation match 1 pairs entries 2+3 (null + Anderson Lin)
    expect(r1.matches[1].player2?.name).toBe('Anderson Lin');
  });

  it('should have correct round count (4 playing + winner)', () => {
    const result = buildDisplayRounds(consolation14);
    const names = roundNames(result);
    expect(names.length).toBe(5);
    expect(names[names.length - 1]).toBe('Winner');
  });

  it('should have normal rounds after feed-in level', () => {
    const result = buildDisplayRounds(consolation14);
    // L3 (index 1): 4 normal matches, no feedInPlayer
    expect(result.rounds[1].matches.length).toBe(4);
    for (const m of result.rounds[1].matches) {
      expect(m.feedInPlayer).toBeUndefined();
    }
  });
});

// ── Small Feed-in Consolation — XD doubles (draw/18) ─────────────────────────

describe('buildDisplayRounds — doubles feed-in consolation (draw/18)', () => {
  const consolation18 = section(
    'XD - Consolation',
    ['Round 1', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner'],
    [],
    [
      // L5: entries
      M(5, 1, null),
      M(5, 2, W('Michael Xu', 36, '', 'Angie Huang', 13)),
      M(5, 3, W('Linden Wang', 33, '', 'Yaorui Shan', 26)),
      M(5, 4, W('Ronith A Manikonda', 21, '', 'Hannah George', 11)),
      M(5, 5, W('Jerry Yuan', 41, '', 'Amanda Ng', 22)),
      M(5, 6, W('Patrick Chi', 7, '', 'Natalie Chi', 6)),
      M(5, 7, W('Kyle Wang', 32, '', 'Emma J. Wei', 34)),
      M(5, 8, null),
      // L4: feed-in level (2 scored + 6 unscored, but parity-based detection)
      M(4, 1, W('Michael Xu', 36, '', 'Angie Huang', 13)),
      M(4, 2, W('Andrew Yuan', 40, '', 'Kalea Sheung', 27)),
      M(4, 3, W('Ronith A Manikonda', 21, '', 'Hannah George', 11), [], true),
      M(4, 4, W('Jeffrey Chang', 3, '', 'Taylor Chao', 4)),
      M(4, 5, W('Jerry Yuan', 41, '', 'Amanda Ng', 22), ['21-13', '21-16']),
      M(4, 6, W('Jun Jie Lai', 15, '', 'Xin Huang', 14)),
      M(4, 7, W('Kyle Wang', 32, '', 'Emma J. Wei', 34)),
      M(4, 8, W('Andre Chim', 8, '', 'Chloe Ho', 12)),
      // L3
      M(3, 1, W('Michael Xu', 36, '', 'Angie Huang', 13), [], true),
      M(3, 2, W('Jeffrey Chang', 3, '', 'Taylor Chao', 4), ['21-16', '21-16']),
      M(3, 3, W('Jerry Yuan', 41, '', 'Amanda Ng', 22), ['12-21', '21-9', '21-9']),
      M(3, 4, W('Andre Chim', 8, '', 'Chloe Ho', 12), [], true),
      // L2
      M(2, 1, W('Jeffrey Chang', 3, '', 'Taylor Chao', 4), ['19-21', '21-17', '21-19']),
      M(2, 2, W('Jerry Yuan', 41, '', 'Amanda Ng', 22), [], true),
      // L1
      M(1, 1, W('Jeffrey Chang', 3, '', 'Taylor Chao', 4), ['16-21', '21-17', '21-15']),
    ],
  );

  it('should detect feed-in even with mixed scored/unscored continuation matches', () => {
    expect(buildDisplayRounds(consolation18).hasFeedIn).toBe(true);
  });

  it('should carry partner names through to feedInPlayer', () => {
    const result = buildDisplayRounds(consolation18);
    const r1 = result.rounds[0];
    // Feed-in entry from L4#2: Andrew Yuan / Kalea Sheung
    expect(r1.matches[0].feedInPlayer?.name).toBe('Andrew Yuan');
    expect(r1.matches[0].feedInPlayer?.partner).toBe('Kalea Sheung');
    // Feed-in entry from L4#4: Jeffrey Chang / Taylor Chao
    expect(r1.matches[1].feedInPlayer?.name).toBe('Jeffrey Chang');
    expect(r1.matches[1].feedInPlayer?.partner).toBe('Taylor Chao');
  });

  it('should carry partner names on entry-level continuation matches', () => {
    const result = buildDisplayRounds(consolation18);
    const r1 = result.rounds[0];
    // Continuation match 2 pairs entries 4+5 → Jerry Yuan/Amanda Ng + Patrick Chi/Natalie Chi
    expect(r1.matches[2].player1?.partner).toBe('Amanda Ng');
    expect(r1.matches[2].player2?.partner).toBe('Natalie Chi');
  });

  it('should classify by matchNum parity, not scored/unscored', () => {
    const result = buildDisplayRounds(consolation18);
    const r1 = result.rounds[0];
    // 4 continuation matches (odd: 1,3,5,7), 4 feed-in entries (even: 2,4,6,8)
    expect(r1.matches.length).toBe(4);
    // Match at index 1 corresponds to continuation #3 (Ronith, walkover)
    // which IS scored (walkover=true) but still a continuation match
    expect(r1.matches[1].walkover).toBe(true);
  });
});

// ── Large Feed-in Consolation (128-entry, draw/1) ────────────────────────────

describe('buildDisplayRounds — large feed-in consolation (128-player, draw/1)', () => {
  // Build a representative 128-player consolation with L11-L1.
  // L11: 64 all-null entries; L10: 64 feed-in (all unscored); 
  // L9: 32 (mostly unscored); L8: 32 (16 scored + 16 unscored feed-in)
  // Simplified: use 8 matches per key level instead of 64 to keep test compact,
  // but maintain the structural ratios.

  function buildLargeConsolation(): BracketSection {
    const matches: BracketMatch[] = [];
    // L11: 64 entry matches (all null winners)
    for (let i = 1; i <= 64; i++) matches.push(M(11, i, null));
    // L10: 64 feed-in matches (all unscored, odd=null, even=named)
    for (let i = 1; i <= 64; i++) {
      const isEven = i % 2 === 0;
      matches.push(M(10, i, isEven ? W(`Player${i}`, i) : null));
    }
    // L9: 32 matches (normal, all unscored, winners from L10 pairs)
    for (let i = 1; i <= 32; i++) {
      matches.push(M(9, i, W(`Player${i * 2}`, i * 2)));
    }
    // L8: 32 matches — feed-in level (odd=scored continuation, even=unscored feed-in)
    for (let i = 1; i <= 32; i++) {
      const isOdd = i % 2 === 1;
      if (isOdd) {
        matches.push(M(8, i, W(`Winner8_${i}`, 800 + i), ['21-15', '21-10']));
      } else {
        matches.push(M(8, i, W(`FeedIn8_${i}`, 900 + i)));
      }
    }
    // L7: 16 normal matches
    for (let i = 1; i <= 16; i++) {
      matches.push(M(7, i, W(`Winner7_${i}`, 700 + i), ['21-10', '21-8']));
    }
    // L6: 16 feed-in matches (odd=scored, even=unscored)
    for (let i = 1; i <= 16; i++) {
      const isOdd = i % 2 === 1;
      if (isOdd) {
        matches.push(M(6, i, W(`Winner6_${i}`, 600 + i), ['21-5', '21-3']));
      } else {
        matches.push(M(6, i, W(`FeedIn6_${i}`, 650 + i)));
      }
    }
    // L5: 8 normal
    for (let i = 1; i <= 8; i++) {
      matches.push(M(5, i, W(`Winner5_${i}`, 500 + i), ['21-12', '21-9']));
    }
    // L4: 8 feed-in (odd=scored, even=unscored)
    for (let i = 1; i <= 8; i++) {
      const isOdd = i % 2 === 1;
      if (isOdd) {
        matches.push(M(4, i, W(`Winner4_${i}`, 400 + i), ['21-8', '21-6']));
      } else {
        matches.push(M(4, i, W(`FeedIn4_${i}`, 450 + i)));
      }
    }
    // L3: 4 normal
    for (let i = 1; i <= 4; i++) {
      matches.push(M(3, i, W(`Winner3_${i}`, 300 + i), ['21-10', '21-7']));
    }
    // L2: 2
    for (let i = 1; i <= 2; i++) {
      matches.push(M(2, i, W(`Winner2_${i}`, 200 + i), ['21-15', '21-12']));
    }
    // L1: 1
    matches.push(M(1, 1, W('Champion', 100), ['21-18', '21-16']));

    return section(
      'BS U11 - Consolation',
      ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Round 7', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner'],
      [],
      matches,
    );
  }

  it('should detect feed-in', () => {
    expect(buildDisplayRounds(buildLargeConsolation()).hasFeedIn).toBe(true);
  });

  it('should merge L10 feed-in level (subsequent feed-in at L8 exists)', () => {
    const result = buildDisplayRounds(buildLargeConsolation());
    // After L11 promotion (64 entries) and L10 merge (64→64 entries),
    // first displayed round is L9 with 32 matches
    expect(result.rounds[0].matches.length).toBe(32);
  });

  it('should detect feed-in at L8, L6, L4', () => {
    const result = buildDisplayRounds(buildLargeConsolation());
    // L9: 32 normal → L8: 32 feed-in (16 cont) → L7: 16 normal →
    // L6: 16 feed-in (8 cont) → L5: 8 normal → L4: 8 feed-in (4 cont)
    // Check L8 (index 1): should have 16 display matches with feedInPlayer
    const l8Round = result.rounds[1];
    expect(l8Round.matches.length).toBe(16);
    expect(l8Round.matches[0].feedInPlayer).not.toBeNull();

    // Check L6 (index 3): 8 display matches with feedInPlayer
    const l6Round = result.rounds[3];
    expect(l6Round.matches.length).toBe(8);
    expect(l6Round.matches[0].feedInPlayer).not.toBeNull();

    // Check L4 (index 5): 4 display matches with feedInPlayer
    const l4Round = result.rounds[5];
    expect(l4Round.matches.length).toBe(4);
    expect(l4Round.matches[0].feedInPlayer).not.toBeNull();
  });

  it('should have normal rounds between feed-in levels', () => {
    const result = buildDisplayRounds(buildLargeConsolation());
    // L9 (index 0): normal, no feedInPlayer
    for (const m of result.rounds[0].matches) {
      expect(m.feedInPlayer).toBeUndefined();
    }
    // L7 (index 2): normal
    for (const m of result.rounds[2].matches) {
      expect(m.feedInPlayer).toBeUndefined();
    }
  });
});

// ── Medium Feed-in Consolation (32-entry, draw/4) ────────────────────────────

describe('buildDisplayRounds — medium feed-in consolation (32-player, draw/4)', () => {
  function buildMediumConsolation(): BracketSection {
    const matches: BracketMatch[] = [];
    // L7: 16 entry matches (all unscored, promoted to entries)
    for (let i = 1; i <= 16; i++) {
      matches.push(M(7, i, i <= 8 ? W(`Entry${i}`, i) : null));
    }
    // L6: 16 feed-in (odd=scored continuation, even=unscored feed-in)
    for (let i = 1; i <= 16; i++) {
      const isOdd = i % 2 === 1;
      if (isOdd) {
        matches.push(M(6, i, W(`ContL6_${i}`, 60 + i), ['21-8', '21-7']));
      } else {
        matches.push(M(6, i, W(`FeedL6_${i}`, 70 + i)));
      }
    }
    // L5: 8 normal
    for (let i = 1; i <= 8; i++) {
      matches.push(M(5, i, W(`WinL5_${i}`, 50 + i), ['21-10', '21-9']));
    }
    // L4: 8 feed-in
    for (let i = 1; i <= 8; i++) {
      const isOdd = i % 2 === 1;
      if (isOdd) {
        matches.push(M(4, i, W(`ContL4_${i}`, 40 + i), ['21-6', '21-4']));
      } else {
        matches.push(M(4, i, W(`FeedL4_${i}`, 45 + i)));
      }
    }
    // L3: 4 normal
    for (let i = 1; i <= 4; i++) {
      matches.push(M(3, i, W(`WinL3_${i}`, 30 + i), ['21-10', '21-7']));
    }
    // L2: 2
    matches.push(M(2, 1, W('SF1', 201), ['21-15', '21-12']));
    matches.push(M(2, 2, W('SF2', 202), ['21-18', '21-14']));
    // L1: 1
    matches.push(M(1, 1, W('Champion', 100), ['21-16', '21-13']));

    return section(
      'BD U11 - Consolation',
      ['Round 1', 'Round 2', 'Round 3', 'Quarter Finals', 'Semi Finals', 'Finals', 'Winner'],
      [],
      matches,
    );
  }

  it('should detect feed-in', () => {
    expect(buildDisplayRounds(buildMediumConsolation()).hasFeedIn).toBe(true);
  });

  it('should NOT merge L6 (subsequent feed-in at L4 but not enough remaining feed-in after merge)', () => {
    const result = buildDisplayRounds(buildMediumConsolation());
    // L6 is feed-in with 8 continuation matches → first round has 8 display matches
    expect(result.rounds[0].matches.length).toBe(8);
    expect(result.rounds[0].matches[0].feedInPlayer).not.toBeNull();
  });

  it('should detect feed-in at both L6 and L4', () => {
    const result = buildDisplayRounds(buildMediumConsolation());
    // L6 (index 0): 8 cont + 8 fi → 8 display with feedInPlayer
    expect(result.rounds[0].matches[0].feedInPlayer).not.toBeNull();
    // L4 (index 2): 4 cont + 4 fi → 4 display with feedInPlayer
    expect(result.rounds[2].matches.length).toBe(4);
    expect(result.rounds[2].matches[0].feedInPlayer).not.toBeNull();
  });

  it('should have normal rounds between feed-in levels', () => {
    const result = buildDisplayRounds(buildMediumConsolation());
    // L5 (index 1): 8 normal matches
    expect(result.rounds[1].matches.length).toBe(8);
    for (const m of result.rounds[1].matches) {
      expect(m.feedInPlayer).toBeUndefined();
    }
  });
});

// ── Feed-in Detection: matchNum Parity ───────────────────────────────────────

describe('buildDisplayRounds — feed-in parity detection', () => {
  it('should use matchNum parity even when all matches are unscored', () => {
    // Small consolation where the feed-in level has ALL unscored matches
    const s = section('Test - Consolation', ['Round 1', 'Semi Finals', 'Finals', 'Winner'], [], [
      // L4: 4 entries
      M(4, 1, null), M(4, 2, W('A', 1)), M(4, 3, W('B', 2)), M(4, 4, null),
      // L3: 4 matches — feed-in, ALL unscored
      M(3, 1, W('A', 1)),   // ODD: continuation
      M(3, 2, W('C', 3)),   // EVEN: feed-in
      M(3, 3, W('B', 2)),   // ODD: continuation
      M(3, 4, W('D', 4)),   // EVEN: feed-in
      // L2: 2 matches
      M(2, 1, W('C', 3), ['21-10', '21-8']),
      M(2, 2, W('D', 4), ['21-15', '21-12']),
      // L1: 1
      M(1, 1, W('D', 4), ['21-18', '21-16']),
    ]);
    const result = buildDisplayRounds(s);
    expect(result.hasFeedIn).toBe(true);
    // L3 should show 2 continuation + 2 feed-in labels
    expect(result.rounds[0].matches.length).toBe(2);
    expect(result.rounds[0].matches[0].feedInPlayer?.name).toBe('C');
    expect(result.rounds[0].matches[1].feedInPlayer?.name).toBe('D');
  });

  it('should use matchNum parity when continuation has mixed scored/walkover', () => {
    const s = section('XD - Consolation', ['Round 1', 'Semi Finals', 'Finals', 'Winner'], [], [
      M(4, 1, null), M(4, 2, W('A', 1)), M(4, 3, W('B', 2)), M(4, 4, null),
      // L3: feed-in — odd#1 is walkover, odd#3 is scored
      M(3, 1, W('A', 1), [], true),          // ODD: continuation (walkover)
      M(3, 2, W('C', 3)),                     // EVEN: feed-in
      M(3, 3, W('B', 2), ['21-10', '21-8']), // ODD: continuation (scored)
      M(3, 4, W('D', 4)),                     // EVEN: feed-in
      M(2, 1, W('C', 3), ['21-10', '21-8']),
      M(2, 2, W('D', 4), ['21-15', '21-12']),
      M(1, 1, W('D', 4), ['21-18', '21-16']),
    ]);
    const result = buildDisplayRounds(s);
    expect(result.hasFeedIn).toBe(true);
    const r = result.rounds[0];
    expect(r.matches.length).toBe(2);
    // Continuation match 0 carries walkover flag
    expect(r.matches[0].walkover).toBe(true);
    expect(r.matches[0].feedInPlayer?.name).toBe('C');
    // Continuation match 1 carries score
    expect(r.matches[1].score).toEqual(['21-10', '21-8']);
    expect(r.matches[1].feedInPlayer?.name).toBe('D');
  });
});

// ── Play-off Section ─────────────────────────────────────────────────────────

describe('buildDisplayRounds — play-off section', () => {
  const playoff = section(
    'MD - Play-off 3/4',
    ['', ''],
    [],
    [
      M(2, 1, W('Jeffrey Chang', 3), ['27-25', '21-19']),
      M(2, 2, W('Kevin Shi', 28)),
      M(1, 1, W('Kevin Shi', 28)),
    ],
  );

  it('should promote top level to entries', () => {
    const result = buildDisplayRounds(playoff);
    expect(result.rounds.length).toBeGreaterThanOrEqual(1);
    // After L2 promotion, L1 is the only playing level with 1 match
    expect(result.rounds[0].matches.length).toBe(1);
  });

  it('should not detect feed-in', () => {
    expect(buildDisplayRounds(playoff).hasFeedIn).toBe(false);
  });
});

// ── Empty Section ────────────────────────────────────────────────────────────

describe('buildDisplayRounds — empty section', () => {
  it('should return empty rounds for section with no matches', () => {
    const s = section('Empty', [], [], []);
    const result = buildDisplayRounds(s);
    expect(result.rounds).toEqual([]);
    expect(result.hasFeedIn).toBe(false);
  });
});

// ── Display Name Logic ───────────────────────────────────────────────────────

describe('display name logic', () => {
  function getDisplayName(s: BracketSection): string {
    const { hasFeedIn } = buildDisplayRounds(s);
    if (hasFeedIn && /consolation/i.test(s.name) && !/feed.in/i.test(s.name)) {
      return s.name.replace(/consolation/i, 'Feed-in Consolation');
    }
    return s.name;
  }

  it('should rename consolation to Feed-in Consolation when hasFeedIn', () => {
    const s = section('MD - Consolation', ['Round 1', 'Semi Finals', 'Finals', 'Winner'], [], [
      M(4, 1, null), M(4, 2, W('A', 1)), M(4, 3, W('B', 2)), M(4, 4, null),
      M(3, 1, W('A', 1)), M(3, 2, W('C', 3)), M(3, 3, W('B', 2)), M(3, 4, W('D', 4)),
      M(2, 1, W('C', 3), ['21-10', '21-8']), M(2, 2, W('D', 4), ['21-15', '21-12']),
      M(1, 1, W('D', 4), ['21-18', '21-16']),
    ]);
    expect(getDisplayName(s)).toBe('MD - Feed-in Consolation');
  });

  it('should keep name for consolation without feed-in', () => {
    // A regular 4-entry consolation: L2=2 matches, L1=1 match — no feed-in
    const s = section('XD - Consolation', ['Semi Finals', 'Finals', 'Winner'],
      [E(1, 'A', '', 1), E(2, 'B', '', 2), E(3, 'C', '', 3), E(4, 'D', '', 4)],
      [
        M(2, 1, W('A', 1), ['21-10', '21-8']),
        M(2, 2, W('D', 4), ['21-15', '21-12']),
        M(1, 1, W('A', 1), ['21-18', '21-16']),
      ],
    );
    expect(getDisplayName(s)).toBe('XD - Consolation');
  });

  it('should not double-rename if name already contains Feed-in', () => {
    const s = section('BS - Feed-in Consolation', ['Round 1', 'Semi Finals', 'Finals', 'Winner'], [], [
      M(4, 1, null), M(4, 2, W('A', 1)), M(4, 3, W('B', 2)), M(4, 4, null),
      M(3, 1, W('A', 1)), M(3, 2, W('C', 3)), M(3, 3, W('B', 2)), M(3, 4, W('D', 4)),
      M(2, 1, W('C', 3), ['21-10', '21-8']), M(2, 2, W('D', 4), ['21-15', '21-12']),
      M(1, 1, W('D', 4), ['21-18', '21-16']),
    ]);
    expect(getDisplayName(s)).toBe('BS - Feed-in Consolation');
  });

  it('should keep non-consolation names even with hasFeedIn', () => {
    // A hypothetical section named "Main Draw" that has feed-in structure
    const s = section('Main Draw', ['Round 1', 'Semi Finals', 'Finals', 'Winner'], [], [
      M(4, 1, null), M(4, 2, W('A', 1)), M(4, 3, W('B', 2)), M(4, 4, null),
      M(3, 1, W('A', 1)), M(3, 2, W('C', 3)), M(3, 3, W('B', 2)), M(3, 4, W('D', 4)),
      M(2, 1, W('C', 3), ['21-10', '21-8']), M(2, 2, W('D', 4), ['21-15', '21-12']),
      M(1, 1, W('D', 4), ['21-18', '21-16']),
    ]);
    expect(getDisplayName(s)).toBe('Main Draw');
  });
});
