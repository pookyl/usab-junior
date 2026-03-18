import { describe, it, expect } from 'vitest';
import {
  parseTswDrawType,
  parseTswRoundRobinGroups,
  parseTswRoundRobinGroupName,
  parseTswRoundRobinStandings,
  parseTswRoundRobinMatches,
} from './shared.js';

// ── Draw Type Detection ──────────────────────────────────────────────────────

describe('parseTswDrawType', () => {
  it('should detect round-robin draw', () => {
    expect(parseTswDrawType('<span>Round Robin</span>')).toBe('round-robin');
    expect(parseTswDrawType('some html > Round Robin < more')).toBe('round-robin');
  });

  it('should detect elimination draw', () => {
    expect(parseTswDrawType('<span>Elimination</span>')).toBe('elimination');
    expect(parseTswDrawType('> Elimination <')).toBe('elimination');
  });

  it('should detect group draw', () => {
    expect(parseTswDrawType('> Group <')).toBe('group');
  });

  it('should fallback to elimination for draw table HTML', () => {
    expect(parseTswDrawType('<div class="draw"><table>...</table></div>')).toBe('elimination');
  });

  it('should return unknown for unrecognized HTML', () => {
    expect(parseTswDrawType('<div>nothing here</div>')).toBe('unknown');
  });
});

// ── Group Name Parser ────────────────────────────────────────────────────────

describe('parseTswRoundRobinGroupName', () => {
  it('should extract group name from draw page HTML', () => {
    const html = `<h4 class="media__title media__title--large">
      <a href="/some/link" class="nav-link"><span class="nav-link__value">XD U9 - Group A</span></a>
    </h4>`;
    expect(parseTswRoundRobinGroupName(html)).toBe('XD U9 - Group A');
  });

  it('should return empty string when no group name found', () => {
    expect(parseTswRoundRobinGroupName('<div>no title</div>')).toBe('');
  });
});

// ── Group Navigation Parser ──────────────────────────────────────────────────

describe('parseTswRoundRobinGroups', () => {
  const groupsHtml = `<div class="media__subheading-wrapper"><small class="media__subheading">
    <span class="nav-link"><span class="nav-link__value">Group A</span></span>
  </small><small class="media__subheading">
    <a href="/tournament/abc/Draw/40" class="nav-link"><span class="nav-link__value">Group B</span></a>
  </small><small class="media__subheading">
    <a href="/tournament/abc/Draw/41" class="nav-link"><span class="nav-link__value">XD U9</span></a>
  </small></div>`;

  it('should parse group tabs', () => {
    const groups = parseTswRoundRobinGroups(groupsHtml);
    expect(groups.length).toBe(3);
  });

  it('should detect active group (no link)', () => {
    const groups = parseTswRoundRobinGroups(groupsHtml);
    expect(groups[0]).toEqual({ name: 'Group A', drawId: 0, active: true });
  });

  it('should parse inactive groups with drawIds', () => {
    const groups = parseTswRoundRobinGroups(groupsHtml);
    expect(groups[1]).toEqual({ name: 'Group B', drawId: 40, active: false });
    expect(groups[2]).toEqual({ name: 'XD U9', drawId: 41, active: false });
  });

  it('should return empty array when no wrapper found', () => {
    expect(parseTswRoundRobinGroups('<div>nothing</div>')).toEqual([]);
  });
});

// ── Standings Parser ─────────────────────────────────────────────────────────

describe('parseTswRoundRobinStandings', () => {
  // Real HTML from XD U9 Group A standings (draw/39)
  const standingsHtml = `<table><tbody>
<tr >
<td >
    <span class="standing-table-name__info">
    <span class="entrant-info">
      <label for="entrant-info-toggle">
        <span class="standing-status">1</span>
      </label>
      <span class="entrant-info__content">
<span class="flex-item--grow flex-container">
    <span class="text--truncate entrant-info-club" title="Bintang">Bintang</span>
    </span>
<span class="flex-item--grow flex-container">
    <span class="text--truncate entrant-info-club" title="Bintang">Bintang</span>
    </span>
      </span>
    </span>
  </span>
</td>
<td class="sticky-col-2 text--left sticky-border">
  <div><a href="/tournament/abc/Player/427" class="nav-link"><span class="nav-link__value">Nick Ghandi</span></a></div>
  <div><a href="/tournament/abc/Player/439" class="nav-link"><span class="nav-link__value">Sofia Wang</span></a></div>
</td>
<td class="cell-points">2</td>
<td class="cell-points">2</td>
<td class="cell-points">0</td>
<td class="cell-points">0</td>
<td class="cell-points">2-0</td>
<td class="cell-points">4-1</td>
<td class="cell-points">103-81</td>
<td class="cell-points text--bold">4</td>
<td class="standing-form">
    <ul class="list--inline list">
        <li class="list__item"><span class="tag tag--success tag--round match__status">W</span></li>
        <li class="list__item"><span class="tag tag--success tag--round match__status">W</span></li>
    </ul>
</td>
</tr>

<tr >
<td >
    <span class="standing-table-name__info">
    <span class="entrant-info">
      <label for="entrant-info-toggle">
        <span class="standing-status">2</span>
      </label>
      <span class="entrant-info__content">
<span class="flex-item--grow flex-container">
    <span class="text--truncate entrant-info-club" title="Bintang">Bintang</span>
    </span>
<span class="flex-item--grow flex-container">
    <span class="text--truncate entrant-info-club" title="Bintang">Bintang</span>
    </span>
      </span>
    </span>
  </span>
</td>
<td class="sticky-col-2 text--left sticky-border">
  <div><a href="/tournament/abc/Player/429" class="nav-link"><span class="nav-link__value">Hiro Khuu</span></a></div>
  <div><a href="/tournament/abc/Player/440" class="nav-link"><span class="nav-link__value">Jenna Xia</span></a></div>
</td>
<td class="cell-points">2</td>
<td class="cell-points">1</td>
<td class="cell-points">0</td>
<td class="cell-points">1</td>
<td class="cell-points">1-1</td>
<td class="cell-points">3-3</td>
<td class="cell-points">112-112</td>
<td class="cell-points text--bold">2</td>
<td class="standing-form">
    <ul class="list--inline list">
        <li class="list__item"><span class="tag tag--danger tag--round match__status">L</span></li>
        <li class="list__item"><span class="tag tag--success tag--round match__status">W</span></li>
    </ul>
</td>
</tr>

<tr >
<td >
    <span class="standing-table-name__info">
    <span class="entrant-info">
      <label for="entrant-info-toggle">
        <span class="standing-status">3</span>
      </label>
      <span class="entrant-info__content">
<span class="flex-item--grow flex-container">
    <span class="text--truncate entrant-info-club" title="Bintang">Bintang</span>
    </span>
<span class="flex-item--grow flex-container">
    <span class="text--truncate entrant-info-club" title="Bintang">Bintang</span>
    </span>
      </span>
    </span>
  </span>
</td>
<td class="sticky-col-2 text--left sticky-border">
  <div><a href="/tournament/abc/Player/441" class="nav-link"><span class="nav-link__value">Max YiFan Luo</span></a></div>
  <div><a href="/tournament/abc/Player/437" class="nav-link"><span class="nav-link__value">Rithanya Rajesh</span></a></div>
</td>
<td class="cell-points">2</td>
<td class="cell-points">0</td>
<td class="cell-points">0</td>
<td class="cell-points">2</td>
<td class="cell-points">0-2</td>
<td class="cell-points">1-4</td>
<td class="cell-points">83-105</td>
<td class="cell-points text--bold">0</td>
<td class="standing-form">
    <ul class="list--inline list">
        <li class="list__item"><span class="tag tag--danger tag--round match__status">L</span></li>
        <li class="list__item"><span class="tag tag--danger tag--round match__status">L</span></li>
    </ul>
</td>
</tr>
</tbody></table>`;

  it('should parse all standings entries', () => {
    const standings = parseTswRoundRobinStandings(standingsHtml);
    expect(standings.length).toBe(3);
  });

  it('should parse position correctly', () => {
    const standings = parseTswRoundRobinStandings(standingsHtml);
    expect(standings[0].position).toBe(1);
    expect(standings[1].position).toBe(2);
    expect(standings[2].position).toBe(3);
  });

  it('should parse doubles player names and IDs', () => {
    const standings = parseTswRoundRobinStandings(standingsHtml);
    expect(standings[0].players.length).toBe(2);
    expect(standings[0].players[0]).toEqual({ name: 'Nick Ghandi', playerId: 427, club: 'Bintang' });
    expect(standings[0].players[1]).toEqual({ name: 'Sofia Wang', playerId: 439, club: 'Bintang' });
  });

  it('should parse W/D/L statistics', () => {
    const standings = parseTswRoundRobinStandings(standingsHtml);
    expect(standings[0]).toMatchObject({ played: 2, won: 2, drawn: 0, lost: 0, points: 4 });
    expect(standings[1]).toMatchObject({ played: 2, won: 1, drawn: 0, lost: 1, points: 2 });
    expect(standings[2]).toMatchObject({ played: 2, won: 0, drawn: 0, lost: 2, points: 0 });
  });

  it('should parse match and game records', () => {
    const standings = parseTswRoundRobinStandings(standingsHtml);
    expect(standings[0].matchRecord).toBe('2-0');
    expect(standings[0].gameRecord).toBe('4-1');
    expect(standings[1].matchRecord).toBe('1-1');
    expect(standings[1].gameRecord).toBe('3-3');
  });

  it('should parse history tags', () => {
    const standings = parseTswRoundRobinStandings(standingsHtml);
    expect(standings[0].history).toEqual(['W', 'W']);
    expect(standings[1].history).toEqual(['L', 'W']);
    expect(standings[2].history).toEqual(['L', 'L']);
  });

  it('should return empty array for HTML with no standings rows', () => {
    expect(parseTswRoundRobinStandings('<table></table>')).toEqual([]);
  });
});

// ── Matches Parser ───────────────────────────────────────────────────────────

describe('parseTswRoundRobinMatches', () => {
  // Real HTML from XD U9 Group A matches (draw/39)
  const matchesHtml = `
<li class="match-group__item" id="match_2083">
<div class="match">
    <div class="match__header">
          <ul class="match__header-title">
              <li class="match__header-title-item">
                <span title="Round 1" class="nav-link"><span class="nav-link__value">Round 1</span></span>
              </li>
          </ul>
    </div>
  <div class="match__body">
    <div class="match__row-wrapper">
<div class="match__row ">
<div class="match__row-title">
        <div class="match__row-title-value">
              <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=441" data-player-id="441" data-club-id="81" class="nav-link"><span class="nav-link__value">Max YiFan Luo</span></a>
                  </span>
    </div>
      <div class="match__row-title-value">
      <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=437" data-player-id="437" data-club-id="81" class="nav-link"><span class="nav-link__value">Rithanya Rajesh</span></a>
              </span>
    </div>
  </div>
</div>
<div class="match__row has-won">
<div class="match__row-title">
        <div class="match__row-title-value">
              <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=429" data-player-id="429" data-club-id="83" class="nav-link"><span class="nav-link__value">Hiro Khuu</span></a>
                  </span>
    </div>
      <div class="match__row-title-value">
      <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=440" data-player-id="440" data-club-id="83" class="nav-link"><span class="nav-link__value">Jenna Xia</span></a>
              </span>
    </div>
  </div>
<span class="tag--round tag--success tag tag--small match__status">W</span></div>    </div>
      <div class="match__result">
              <ul class="points">
          <li class="points__cell points__cell--won"> 21</li>
          <li class="points__cell "> 18</li>
      </ul>
      <ul class="points">
          <li class="points__cell "> 16</li>
          <li class="points__cell points__cell--won"> 21</li>
      </ul>
      <ul class="points">
          <li class="points__cell "> 14</li>
          <li class="points__cell points__cell--won"> 21</li>
      </ul>
      </div>
    <div class="match__footer">
        <ul class="match__footer-list">
            <li class="match__footer-list-item">
      <span class="nav-link">  <svg class="icon-clock nav-link__prefix" width="20" height="20"></svg>
<span class="nav-link__value">Fri 3/13/2026 7:20 PM</span></span>
            </li>
        </ul>
    </div>
</div>
</div>
</li>

<li class="match-group__item" id="match_2079">
<div class="match">
    <div class="match__header">
          <ul class="match__header-title">
              <li class="match__header-title-item">
                <span title="Round 2" class="nav-link"><span class="nav-link__value">Round 2</span></span>
              </li>
          </ul>
    </div>
  <div class="match__body">
    <div class="match__row-wrapper">
<div class="match__row has-won">
<div class="match__row-title">
        <div class="match__row-title-value">
              <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=427" data-player-id="427" data-club-id="83" class="nav-link"><span class="nav-link__value">Nick Ghandi</span></a>
                  </span>
    </div>
      <div class="match__row-title-value">
      <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=439" data-player-id="439" data-club-id="83" class="nav-link"><span class="nav-link__value">Sofia Wang</span></a>
              </span>
    </div>
  </div>
<span class="tag--round tag--success tag tag--small match__status">W</span></div>
<div class="match__row ">
<div class="match__row-title">
        <div class="match__row-title-value">
              <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=441" data-player-id="441" data-club-id="81" class="nav-link"><span class="nav-link__value">Max YiFan Luo</span></a>
                  </span>
    </div>
      <div class="match__row-title-value">
      <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=437" data-player-id="437" data-club-id="81" class="nav-link"><span class="nav-link__value">Rithanya Rajesh</span></a>
              </span>
    </div>
  </div>
</div>    </div>
      <div class="match__result">
              <ul class="points">
          <li class="points__cell points__cell--won"> 21</li>
          <li class="points__cell "> 14</li>
      </ul>
      <ul class="points">
          <li class="points__cell points__cell--won"> 21</li>
          <li class="points__cell "> 15</li>
      </ul>
      </div>
    <div class="match__footer">
        <ul class="match__footer-list">
            <li class="match__footer-list-item">
      <span class="nav-link">  <svg class="icon-clock nav-link__prefix" width="20" height="20"></svg>
<span class="nav-link__value">Sat 3/14/2026 9:35 AM</span></span>
            </li>
        </ul>
    </div>
</div>
</div>
</li>

<li class="match-group__item" id="match_2082">
<div class="match">
    <div class="match__header">
          <ul class="match__header-title">
              <li class="match__header-title-item">
                <span title="Round 3" class="nav-link"><span class="nav-link__value">Round 3</span></span>
              </li>
          </ul>
    </div>
  <div class="match__body">
    <div class="match__row-wrapper">
<div class="match__row has-won">
<div class="match__row-title">
        <div class="match__row-title-value">
              <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=427" data-player-id="427" data-club-id="83" class="nav-link"><span class="nav-link__value">Nick Ghandi</span></a>
                  </span>
    </div>
      <div class="match__row-title-value">
      <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=439" data-player-id="439" data-club-id="83" class="nav-link"><span class="nav-link__value">Sofia Wang</span></a>
              </span>
    </div>
  </div>
<span class="tag--round tag--success tag tag--small match__status">W</span></div>
<div class="match__row ">
<div class="match__row-title">
        <div class="match__row-title-value">
              <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=429" data-player-id="429" data-club-id="83" class="nav-link"><span class="nav-link__value">Hiro Khuu</span></a>
                  </span>
    </div>
      <div class="match__row-title-value">
      <span class="match__row-title-value-content">
      <a href="/sport/player.aspx?id=abc&amp;player=440" data-player-id="440" data-club-id="83" class="nav-link"><span class="nav-link__value">Jenna Xia</span></a>
              </span>
    </div>
  </div>
</div>    </div>
      <div class="match__result">
              <ul class="points">
          <li class="points__cell "> 19</li>
          <li class="points__cell points__cell--won"> 21</li>
      </ul>
      <ul class="points">
          <li class="points__cell points__cell--won"> 21</li>
          <li class="points__cell "> 19</li>
      </ul>
      <ul class="points">
          <li class="points__cell points__cell--won"> 21</li>
          <li class="points__cell "> 12</li>
      </ul>
      </div>
    <div class="match__footer">
        <ul class="match__footer-list">
            <li class="match__footer-list-item">
      <span class="nav-link">  <svg class="icon-clock nav-link__prefix" width="20" height="20"></svg>
<span class="nav-link__value">Sat 3/14/2026 5:25 PM</span></span>
            </li>
        </ul>
    </div>
</div>
</div>
</li>`;

  it('should parse all 3 matches', () => {
    const matches = parseTswRoundRobinMatches(matchesHtml);
    expect(matches.length).toBe(3);
  });

  it('should extract match IDs', () => {
    const matches = parseTswRoundRobinMatches(matchesHtml);
    expect(matches.map(m => m.matchId)).toEqual(['2083', '2079', '2082']);
  });

  it('should extract round names', () => {
    const matches = parseTswRoundRobinMatches(matchesHtml);
    expect(matches[0].round).toBe('Round 1');
    expect(matches[1].round).toBe('Round 2');
    expect(matches[2].round).toBe('Round 3');
  });

  it('should parse doubles teams (2 players per team)', () => {
    const matches = parseTswRoundRobinMatches(matchesHtml);
    const m1 = matches[0];
    expect(m1.team1.length).toBe(2);
    expect(m1.team1[0]).toEqual({ name: 'Max YiFan Luo', playerId: 441, club: '' });
    expect(m1.team1[1]).toEqual({ name: 'Rithanya Rajesh', playerId: 437, club: '' });
    expect(m1.team2.length).toBe(2);
    expect(m1.team2[0]).toEqual({ name: 'Hiro Khuu', playerId: 429, club: '' });
    expect(m1.team2[1]).toEqual({ name: 'Jenna Xia', playerId: 440, club: '' });
  });

  it('should detect winner correctly', () => {
    const matches = parseTswRoundRobinMatches(matchesHtml);
    expect(matches[0].winner).toBe(2); // Team 2 (Hiro/Jenna) has-won
    expect(matches[1].winner).toBe(1); // Team 1 (Nick/Sofia) has-won
    expect(matches[2].winner).toBe(1); // Team 1 (Nick/Sofia) has-won
  });

  it('should parse game scores correctly', () => {
    const matches = parseTswRoundRobinMatches(matchesHtml);
    // Match 1: 21-18, 16-21, 14-21
    expect(matches[0].scores).toEqual([[21, 18], [16, 21], [14, 21]]);
    // Match 2: 21-14, 21-15
    expect(matches[1].scores).toEqual([[21, 14], [21, 15]]);
    // Match 3: 19-21, 21-19, 21-12
    expect(matches[2].scores).toEqual([[19, 21], [21, 19], [21, 12]]);
  });

  it('should extract date/time', () => {
    const matches = parseTswRoundRobinMatches(matchesHtml);
    expect(matches[0].dateTime).toBe('Fri 3/13/2026 7:20 PM');
    expect(matches[1].dateTime).toBe('Sat 3/14/2026 9:35 AM');
  });

  it('should set retired and walkover to false for normal matches', () => {
    const matches = parseTswRoundRobinMatches(matchesHtml);
    for (const m of matches) {
      expect(m.retired).toBe(false);
      expect(m.walkover).toBe(false);
    }
  });

  it('should return empty array for HTML with no matches', () => {
    expect(parseTswRoundRobinMatches('<div>nothing</div>')).toEqual([]);
  });
});
