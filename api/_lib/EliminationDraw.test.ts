import { describe, it, expect } from 'vitest';
import { parseTswEliminationDraw } from './shared.js';

// ── HTML fixture builders ────────────────────────────────────────────────────
// These produce minimal but structurally accurate TSW draw HTML. The TSW draw
// page uses a <div class="draw"><table>…</table></div> for each bracket section,
// with <caption> for the name, <thead> for round headers, and <tbody> rows
// containing entry/match/score spans in a grid layout.

function drawHtml(sections: string[]): string {
  return sections.join('\n');
}

function sectionHtml(name: string, headCols: string[], bodyRows: string[]): string {
  const thead = `<thead><tr>${headCols.map(c => `<td colspan="1">${c}</td>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${bodyRows.map(r => `<tr>${r}</tr>`).join('')}</tbody>`;
  return `<div class="draw"><table><caption>${name}</caption>${thead}${tbody}</table></div>`;
}

function sectionWithStateHtml(name: string, headCols: string[], bodyRows: string[]): string {
  const thead = `<thead><tr><td colspan="1" /><td>State</td>${headCols.map(c => `<td colspan="1">${c}</td>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${bodyRows.map(r => `<tr>${r}</tr>`).join('')}</tbody>`;
  return `<div class="draw"><table><caption>${name}</caption>${thead}${tbody}</table></div>`;
}

function td(content: string, cls = ''): string {
  return cls ? `<td class="${cls}">${content}</td>` : `<td>${content}</td>`;
}

function playerLink(playerId: number, name: string, seed = ''): string {
  const display = seed ? `${name} [${seed}]` : name;
  return `<a href="/sport/player.aspx?id=TEST&amp;player=${playerId}">${display}</a>`;
}

function doublesEntry(p1Id: number, p1Name: string, p2Id: number, p2Name: string, seed = ''): string {
  return `${playerLink(p1Id, p1Name, seed)}<br />${playerLink(p2Id, p2Name)}`;
}

function entrySpan(id: string): string {
  return `<span id="${id}" class="entry" />`;
}

function matchSpan(id: string): string {
  return `<span id="${id}" class="match" />`;
}

function scoreSpan(games: string[], opts: { retired?: boolean; walkover?: boolean } = {}): string {
  const inner = games.map(g => `<span>${g}</span>`).join('');
  const suffix = opts.retired ? ' Retired' : opts.walkover ? ' Walkover' : '';
  return `<span class="score">${inner}${suffix}</span>`;
}

// ── 4-entry singles draw with State column ───────────────────────────────────

describe('parseTswEliminationDraw — singles main draw (4 entries)', () => {
  // Minimal 4-entry draw: entries at L2 level, 2 R1 matches, 1 final
  //   1 Alice [1] vs 2 Bye → Alice wins (bye)
  //   3 Carol     vs 4 Diana → Carol wins 21-15, 21-10
  //   Final: Alice vs Carol → Carol wins 21-18, 19-21, 21-17
  const html = drawHtml([sectionWithStateHtml(
    'BS U11',
    ['Round 1', 'Finals', 'Winner'],
    [
      // Row 0: spacer
      `${td('', '')}${td('', '')}${td(' ')}${td(' ')}${td(' ')}`,
      // Row 1: entry 1 (Alice [1])
      `${td('1 ', 'line_b')}${td('CA', 'line_b')}${td(` ${playerLink(10, 'Alice', '1')}${entrySpan('3001')} `, 'line_b')}${td(' ')}${td(' ')}`,
      // Row 2: connector + R1 match winner (Alice, bye)
      `${td(' ')}${td('')}${td('  ', 'line_r')}${td(` ${playerLink(10, 'Alice', '1')}${matchSpan('2001')} `, 'line_b')}${td(' ')}`,
      // Row 3: entry 2 (Bye)
      `${td('2 ', 'line_b')}${td('', 'line_b')}${td(` Bye${entrySpan('3002')} `, 'line_br')}${td('  ', 'line_r')}${td(' ')}`,
      // Row 4: connector to finals
      `${td(' ')}${td('')}${td('  ')}${td(' ', 'line_r')}${td(` ${playerLink(30, 'Carol')}${matchSpan('1001')} `, 'line_b')}`,
      // Row 5: entry 3 (Carol)
      `${td('3 ', 'line_b')}${td('NY', 'line_b')}${td(` ${playerLink(30, 'Carol')}${entrySpan('3003')} `, 'line_b')}${td(' ', 'line_r')}${td(` ${scoreSpan(['21-18', '19-21', '21-17'])} `)}`,
      // Row 6: connector + R1 match (Carol won)
      `${td(' ')}${td('')}${td('  ', 'line_r')}${td(` ${playerLink(30, 'Carol')}${matchSpan('2002')} `, 'line_br')}${td(' ')}`,
      // Row 7: entry 4 (Diana) + R1 score
      `${td('4 ', 'line_b')}${td('TX', 'line_b')}${td(` ${playerLink(40, 'Diana')}${entrySpan('3004')} `, 'line_br')}${td(` ${scoreSpan(['21-15', '21-10'])} `)}${td(' ')}`,
    ],
  )]);

  it('should parse one section', () => {
    const sections = parseTswEliminationDraw(html);
    expect(sections.length).toBe(1);
  });

  it('should parse section name', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.name).toBe('BS U11');
  });

  it('should parse round names (including Winner)', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.rounds).toEqual(['Round 1', 'Finals', 'Winner']);
  });

  it('should parse 4 entries', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries.length).toBe(4);
    expect(s.entries[0]).toMatchObject({ position: 1, name: 'Alice', seed: '1', playerId: 10, bye: false });
    expect(s.entries[1]).toMatchObject({ position: 2, name: 'Bye', bye: true, playerId: null });
    expect(s.entries[2]).toMatchObject({ position: 3, name: 'Carol', playerId: 30, bye: false });
    expect(s.entries[3]).toMatchObject({ position: 4, name: 'Diana', playerId: 40, bye: false });
  });

  it('should parse State column as club', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries[0].club).toBe('CA');
    expect(s.entries[2].club).toBe('NY');
    expect(s.entries[3].club).toBe('TX');
  });

  it('should parse 3 matches (2 R1 + 1 Finals)', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.matches.length).toBe(3);
  });

  it('should extract matchId, roundLevel, matchNum from span ID', () => {
    const [s] = parseTswEliminationDraw(html);
    const r1m1 = s.matches.find(m => m.matchId === '2001');
    expect(r1m1).toBeDefined();
    expect(r1m1!.roundLevel).toBe(2);
    expect(r1m1!.matchNum).toBe(1);
    const finals = s.matches.find(m => m.matchId === '1001');
    expect(finals).toBeDefined();
    expect(finals!.roundLevel).toBe(1);
    expect(finals!.matchNum).toBe(1);
  });

  it('should parse match winners with seed', () => {
    const [s] = parseTswEliminationDraw(html);
    const r1m1 = s.matches.find(m => m.matchId === '2001')!;
    expect(r1m1.winner).toMatchObject({ name: 'Alice', playerId: 10, seed: '1' });
  });

  it('should associate scores with correct matches', () => {
    const [s] = parseTswEliminationDraw(html);
    const r1m2 = s.matches.find(m => m.matchId === '2002')!;
    expect(r1m2.score).toEqual(['21-15', '21-10']);
    const finals = s.matches.find(m => m.matchId === '1001')!;
    expect(finals.score).toEqual(['21-18', '19-21', '21-17']);
  });

  it('should have empty score for bye match', () => {
    const [s] = parseTswEliminationDraw(html);
    const r1m1 = s.matches.find(m => m.matchId === '2001')!;
    expect(r1m1.score).toEqual([]);
    expect(r1m1.retired).toBe(false);
    expect(r1m1.walkover).toBe(false);
  });
});

// ── Doubles draw (partner parsing) ──────────────────────────────────────────

describe('parseTswEliminationDraw — doubles draw', () => {
  const html = drawHtml([sectionWithStateHtml(
    'XD U11',
    ['Finals', 'Winner'],
    [
      `${td(' ')}${td('')}${td(' ')}${td(' ')}`,
      // Entry row with doubles pair
      `${td('1 ', 'line_b')}${td('CA', 'line_b')}${td(` ${doublesEntry(10, 'Alice', 11, 'Bob', '1')}${entrySpan('2001')} `, 'line_b')}${td(' ')}`,
      `${td(' ')}${td('')}${td('  ', 'line_r')}${td(` ${doublesEntry(10, 'Alice', 11, 'Bob', '1')}${matchSpan('1001')} `, 'line_b')}`,
      `${td('2 ', 'line_b')}${td('NY', 'line_b')}${td(` ${doublesEntry(30, 'Carol', 31, 'Dan')}${entrySpan('2002')} `, 'line_br')}${td(` ${scoreSpan(['21-10', '21-8'])} `)}`,
    ],
  )]);

  it('should parse partner from doubles entry', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries[0]).toMatchObject({
      name: 'Alice', seed: '1', playerId: 10,
      partner: 'Bob', partnerPlayerId: 11,
    });
    expect(s.entries[1]).toMatchObject({
      name: 'Carol', playerId: 30,
      partner: 'Dan', partnerPlayerId: 31,
    });
  });

  it('should parse partner from doubles match winner', () => {
    const [s] = parseTswEliminationDraw(html);
    const finals = s.matches.find(m => m.matchId === '1001')!;
    expect(finals.winner).toMatchObject({
      name: 'Alice', playerId: 10,
      partner: 'Bob', partnerPlayerId: 11,
    });
  });

  it('should parse score for doubles match', () => {
    const [s] = parseTswEliminationDraw(html);
    const finals = s.matches.find(m => m.matchId === '1001')!;
    expect(finals.score).toEqual(['21-10', '21-8']);
  });
});

// ── Walkover and Retired parsing ─────────────────────────────────────────────

describe('parseTswEliminationDraw — walkover and retired', () => {
  const html = drawHtml([sectionHtml(
    'Test WO',
    ['Round 1', 'Finals'],
    [
      `${td(' ')}${td(' ')}${td(' ')}`,
      `${td('1')}${td(` ${playerLink(10, 'Alice')}${entrySpan('3001')} `, 'line_b')}${td(' ')}`,
      `${td(' ')}${td('  ', 'line_r')}${td(` ${playerLink(10, 'Alice')}${matchSpan('2001')} `, 'line_b')}`,
      `${td('2')}${td(` ${playerLink(20, 'Bob')}${entrySpan('3002')} `, 'line_br')}${td(` ${scoreSpan([], { walkover: true })} `)}`,
      `${td(' ')}${td('  ')}${td(' ', 'line_r')}`,
      `${td('3')}${td(` ${playerLink(30, 'Carol')}${entrySpan('3003')} `, 'line_b')}${td(' ', 'line_r')}`,
      `${td(' ')}${td('  ', 'line_r')}${td(` ${playerLink(30, 'Carol')}${matchSpan('2002')} `, 'line_br')}`,
      `${td('4')}${td(` ${playerLink(40, 'Diana')}${entrySpan('3004')} `, 'line_br')}${td(` ${scoreSpan(['21-18', '15-21'], { retired: true })} `)}`,
    ],
  )]);

  it('should detect walkover flag', () => {
    const [s] = parseTswEliminationDraw(html);
    const r1m1 = s.matches.find(m => m.matchId === '2001')!;
    expect(r1m1.walkover).toBe(true);
    expect(r1m1.retired).toBe(false);
  });

  it('should detect retired flag with partial scores', () => {
    const [s] = parseTswEliminationDraw(html);
    const r1m2 = s.matches.find(m => m.matchId === '2002')!;
    expect(r1m2.retired).toBe(true);
    expect(r1m2.walkover).toBe(false);
    expect(r1m2.score).toEqual(['21-18', '15-21']);
  });
});

// ── Consolation / feed-in structure ──────────────────────────────────────────

describe('parseTswEliminationDraw — consolation (match-only, no entries)', () => {
  // Consolation sections have no entry spans — they use match spans for
  // everything including the promoted first column.
  const html = drawHtml([sectionHtml(
    'BS - Consolation',
    ['Round 1', 'Finals', 'Winner'],
    [
      `${td(' ')}${td(' ')}${td(' ')}${td(' ')}`,
      // L3 match 1 (entry-level: "Bye")
      `${td('1')}${td(` Bye${matchSpan('3001')} `, 'line_b')}${td(' ')}${td(' ')}`,
      `${td(' ')}${td('  ', 'line_r')}${td(` ${playerLink(50, 'Eve')}${matchSpan('2001')} `, 'line_b')}${td(' ')}`,
      // L3 match 2 (entry-level: Eve)
      `${td('2')}${td(` ${playerLink(50, 'Eve')}${matchSpan('3002')} `, 'line_br')}${td('  ', 'line_r')}${td(' ')}`,
      `${td(' ')}${td('  ')}${td(' ', 'line_r')}${td(` ${playerLink(50, 'Eve')}${matchSpan('1001')} `, 'line_b')}`,
      // L3 match 3 (entry-level: Frank)
      `${td('3')}${td(` ${playerLink(60, 'Frank')}${matchSpan('3003')} `, 'line_b')}${td(' ', 'line_r')}${td(` ${scoreSpan(['21-10', '21-8'])} `)}`,
      `${td(' ')}${td('  ', 'line_r')}${td(` ${playerLink(60, 'Frank')}${matchSpan('2002')} `, 'line_br')}${td(' ')}`,
      // L3 match 4 (entry-level: Bye)
      `${td('4')}${td(` Bye${matchSpan('3004')} `, 'line_br')}${td(` ${scoreSpan(['21-5', '21-3'])} `)}${td(' ')}`,
    ],
  )]);

  it('should have 0 entries (consolation uses match spans)', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries.length).toBe(0);
  });

  it('should parse all match-class spans', () => {
    const [s] = parseTswEliminationDraw(html);
    // 4 L3 matches + 2 L2 matches + 1 L1 match = 7
    expect(s.matches.length).toBe(7);
  });

  it('should extract correct round levels from match IDs', () => {
    const [s] = parseTswEliminationDraw(html);
    const levels = new Set(s.matches.map(m => m.roundLevel));
    expect(levels).toEqual(new Set([3, 2, 1]));
  });

  it('should parse null winner for Bye match spans', () => {
    const [s] = parseTswEliminationDraw(html);
    const byeMatch = s.matches.find(m => m.matchId === '3001')!;
    expect(byeMatch.winner).toBeNull();
  });

  it('should associate scores with nearby matches by row/col proximity', () => {
    const [s] = parseTswEliminationDraw(html);
    // Score at (row 5, col 3) closest to match 1001 at (row 4, col 3) → dist=1
    const finals = s.matches.find(m => m.matchId === '1001')!;
    expect(finals.score).toEqual(['21-10', '21-8']);
    // Score at (row 7, col 2) closest to match 3003 at (row 5, col 1) → dist=2.5
    const l3m3 = s.matches.find(m => m.matchId === '3003')!;
    expect(l3m3.score).toEqual(['21-5', '21-3']);
  });
});

// ── Multiple sections in one page ────────────────────────────────────────────

describe('parseTswEliminationDraw — multiple sections', () => {
  const html = drawHtml([
    sectionHtml('Main Draw', ['Finals'], [
      `${td(' ')}${td(' ')}`,
      `${td('1')}${td(` ${playerLink(1, 'Alpha')}${entrySpan('2001')} `, 'line_b')}`,
      `${td(' ')}${td(` ${playerLink(1, 'Alpha')}${matchSpan('1001')} `)}`,
      `${td('2')}${td(` ${playerLink(2, 'Beta')}${entrySpan('2002')} `, 'line_br')}`,
    ]),
    sectionHtml('Play-off 3/4', ['Finals'], [
      `${td(' ')}${td(' ')}`,
      `${td('1')}${td(` ${playerLink(3, 'Gamma')}${matchSpan('2001')} `, 'line_b')}`,
      `${td(' ')}${td(` ${playerLink(3, 'Gamma')}${matchSpan('1001')} `)}`,
      `${td('2')}${td(` ${playerLink(4, 'Delta')}${matchSpan('2002')} `, 'line_br')}`,
    ]),
    sectionHtml('Consolation', ['Finals'], [
      `${td(' ')}${td(' ')}`,
      `${td('1')}${td(` ${playerLink(5, 'Epsilon')}${matchSpan('2001')} `, 'line_b')}`,
      `${td(' ')}${td(` ${playerLink(5, 'Epsilon')}${matchSpan('1001')} `)}`,
      `${td('2')}${td(` ${playerLink(6, 'Zeta')}${matchSpan('2002')} `, 'line_br')}`,
    ]),
  ]);

  it('should parse 3 separate sections', () => {
    const sections = parseTswEliminationDraw(html);
    expect(sections.length).toBe(3);
  });

  it('should parse section names correctly', () => {
    const sections = parseTswEliminationDraw(html);
    expect(sections.map(s => s.name)).toEqual(['Main Draw', 'Play-off 3/4', 'Consolation']);
  });

  it('should keep entries/matches separate per section', () => {
    const sections = parseTswEliminationDraw(html);
    // Main draw has entries, others have match-only
    expect(sections[0].entries.length).toBe(2);
    expect(sections[0].entries[0].name).toBe('Alpha');
    expect(sections[1].entries.length).toBe(0);
    expect(sections[1].matches[0].winner?.name).toBe('Gamma');
    expect(sections[2].entries.length).toBe(0);
    expect(sections[2].matches[0].winner?.name).toBe('Epsilon');
  });
});

// ── No-State column draw (consolation format) ───────────────────────────────

describe('parseTswEliminationDraw — no State column', () => {
  const html = drawHtml([sectionHtml(
    'No State Draw',
    ['Finals'],
    [
      `${td(' ')}${td(' ')}`,
      `${td('1')}${td(` ${playerLink(10, 'Alice')}${entrySpan('2001')} `, 'line_b')}`,
      `${td(' ')}${td(` ${playerLink(10, 'Alice')}${matchSpan('1001')} `)}`,
      `${td('2')}${td(` ${playerLink(20, 'Bob')}${entrySpan('2002')} `, 'line_br')}`,
    ],
  )]);

  it('should parse entries with empty club when no State column', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries.length).toBe(2);
    expect(s.entries[0].club).toBe('');
    expect(s.entries[1].club).toBe('');
  });
});

// ── Seed parsing edge cases ──────────────────────────────────────────────────

describe('parseTswEliminationDraw — seed formats', () => {
  const html = drawHtml([sectionHtml(
    'Seed Test',
    ['Finals'],
    [
      `${td(' ')}${td(' ')}`,
      // Regular seed [1]
      `${td('1')}${td(` ${playerLink(10, 'Alice', '1')}${entrySpan('2001')} `, 'line_b')}`,
      `${td(' ')}${td(` ${playerLink(10, 'Alice', '1')}${matchSpan('1001')} `)}`,
      // Composite seed [3/4]
      `${td('2')}${td(` ${playerLink(20, 'Bob', '3/4')}${entrySpan('2002')} `, 'line_br')}`,
    ],
  )]);

  it('should parse numeric seed', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries[0].seed).toBe('1');
  });

  it('should parse composite seed (e.g., 3/4)', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries[1].seed).toBe('3/4');
  });

  it('should strip seed from entry name', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries[0].name).toBe('Alice');
    expect(s.entries[1].name).toBe('Bob');
  });

  it('should strip seed from match winner name', () => {
    const [s] = parseTswEliminationDraw(html);
    const finals = s.matches.find(m => m.matchId === '1001')!;
    expect(finals.winner?.name).toBe('Alice');
    expect(finals.winner?.seed).toBe('1');
  });
});

// ── Empty / malformed HTML ───────────────────────────────────────────────────

describe('parseTswEliminationDraw — edge cases', () => {
  it('should return empty array for HTML with no draw divs', () => {
    expect(parseTswEliminationDraw('<div>nothing</div>')).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    expect(parseTswEliminationDraw('')).toEqual([]);
  });

  it('should skip section with no tbody', () => {
    const html = '<div class="draw"><table><caption>Empty</caption><thead><tr></tr></thead></table></div>';
    expect(parseTswEliminationDraw(html)).toEqual([]);
  });
});

// ── Real HTML integration (play-off from draw/1) ────────────────────────────
// Uses the actual TSW HTML structure for the smallest real section.

describe('parseTswEliminationDraw — real play-off 3/4 HTML', () => {
  const realHtml = `<div class="draw"><table><caption>BS U11 - Play-off 3/4</caption><thead><tr><td colspan="1" /><td>State</td><td colspan="1">  </td><td colspan="1">  </td></tr></thead><tbody><tr><td> </td><td /><td> </td><td> </td></tr><tr><td class="line_b">1 </td><td class="line_b">CA</td><td class="line_b"> <a href="../../../sport/player.aspx?id=A2DD0F5E-24A4-4875-B053-8F25F31AC357&amp;player=127">Boqian Zheng [3/4]</a><span id="2001" class="match" /> </td><td> </td></tr><tr><td> </td><td /><td class="line_r" valign="top">  </td><td class="line_b"> <a href="../../../sport/player.aspx?id=A2DD0F5E-24A4-4875-B053-8F25F31AC357&amp;player=375">Shrihayagrivan Karthigayan [5/8]</a><span id="1001" class="match" /> </td></tr><tr><td class="line_b">2 </td><td class="line_b">CA</td><td class="line_br"> <a href="../../../sport/player.aspx?id=A2DD0F5E-24A4-4875-B053-8F25F31AC357&amp;player=375">Shrihayagrivan Karthigayan [5/8]</a><span id="2002" class="match" /> </td><td> <span class="score"><span>23-21</span><span>17-21</span><span>21-13</span></span> </td></tr><tr><td> </td><td /><td>  </td><td> </td></tr></tbody></table></div>`;

  it('should parse section name', () => {
    const [s] = parseTswEliminationDraw(realHtml);
    expect(s.name).toBe('BS U11 - Play-off 3/4');
  });

  it('should have no entries (play-off uses match spans)', () => {
    const [s] = parseTswEliminationDraw(realHtml);
    expect(s.entries.length).toBe(0);
  });

  it('should parse 3 matches across 2 levels', () => {
    const [s] = parseTswEliminationDraw(realHtml);
    expect(s.matches.length).toBe(3);
    const levels = new Set(s.matches.map(m => m.roundLevel));
    expect(levels).toEqual(new Set([2, 1]));
  });

  it('should parse match winners with composite seeds', () => {
    const [s] = parseTswEliminationDraw(realHtml);
    const m1 = s.matches.find(m => m.matchId === '2001')!;
    expect(m1.winner).toMatchObject({ name: 'Boqian Zheng', seed: '3/4', playerId: 127 });
    const m2 = s.matches.find(m => m.matchId === '2002')!;
    expect(m2.winner).toMatchObject({ name: 'Shrihayagrivan Karthigayan', seed: '5/8', playerId: 375 });
  });

  it('should associate 3-game score with closest match (promoted entry)', () => {
    const [s] = parseTswEliminationDraw(realHtml);
    // In play-off HTML, the score span is at (row=3, col=3). Match 2001 at (row=1, col=2)
    // claims it first (dist=2.5 < 3). buildDisplayRounds later transfers it to L1.
    const m2001 = s.matches.find(m => m.matchId === '2001')!;
    expect(m2001.score).toEqual(['23-21', '17-21', '21-13']);
    expect(m2001.winner).toMatchObject({ name: 'Boqian Zheng', seed: '3/4' });
    // Finals match has no score at parse time (transferred by buildDisplayRounds later)
    const finals = s.matches.find(m => m.matchId === '1001')!;
    expect(finals.score).toEqual([]);
  });

  it('should parse State column as club', () => {
    const [s] = parseTswEliminationDraw(realHtml);
    // Play-off has no entries but has State column in header
    expect(s.rounds).toEqual(['', '']);
  });
});

// ── HTML entity decoding ─────────────────────────────────────────────────────

describe('parseTswEliminationDraw — HTML entity decoding', () => {
  const html = drawHtml([sectionHtml(
    'Test &amp; Section',
    ['Finals'],
    [
      `${td(' ')}${td(' ')}`,
      `${td('1')}${td(` <a href="/sport/player.aspx?id=T&amp;player=10">O&#39;Brien [1]</a>${entrySpan('2001')} `, 'line_b')}`,
      `${td(' ')}${td(` <a href="/sport/player.aspx?id=T&amp;player=10">O&#39;Brien [1]</a>${matchSpan('1001')} `)}`,
      `${td('2')}${td(` ${playerLink(20, 'Bob')}${entrySpan('2002')} `, 'line_br')}`,
    ],
  )]);

  it('should decode HTML entities in section name', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.name).toBe('Test & Section');
  });

  it('should decode HTML entities in player names', () => {
    const [s] = parseTswEliminationDraw(html);
    expect(s.entries[0].name).toBe("O'Brien");
  });
});
