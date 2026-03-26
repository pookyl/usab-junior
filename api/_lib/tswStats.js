import { decodeHtmlEntities } from './core.js';

export function emptyWL() {
  return { wins: 0, losses: 0, total: 0, winPct: 0 };
}

export function emptyCat() {
  return { career: emptyWL(), thisYear: emptyWL() };
}

function parseWLString(str) {
  const match = str.match(/(\d+)\s*\/\s*(\d+)\s*\((\d+)\)/);
  if (!match) return emptyWL();
  const wins = parseInt(match[1], 10);
  const losses = parseInt(match[2], 10);
  const total = parseInt(match[3], 10);
  return { wins, losses, total, winPct: total > 0 ? Math.round((wins / total) * 100) : 0 };
}

export function parseTswOverviewStats(html) {
  const stats = {
    total: emptyCat(),
    singles: emptyCat(),
    doubles: emptyCat(),
    mixed: emptyCat(),
    recentHistory: [],
  };

  const tabMap = {
    tabStatsTotal: 'total',
    tabStatsSingles: 'singles',
    tabStatsDoubles: 'doubles',
    tabStatsMixed: 'mixed',
  };

  const tabIds = Object.keys(tabMap);
  for (let i = 0; i < tabIds.length; i += 1) {
    const tabId = tabIds[i];
    const catKey = tabMap[tabId];
    const tabStart = html.indexOf(`id="${tabId}"`);
    if (tabStart === -1) continue;

    let tabEnd = html.length;
    for (let j = i + 1; j < tabIds.length; j += 1) {
      const nextIndex = html.indexOf(`id="${tabIds[j]}"`, tabStart + 1);
      if (nextIndex > -1) {
        tabEnd = nextIndex;
        break;
      }
    }
    const tabHtml = html.substring(tabStart, tabEnd);

    const wlRegex = /list__label">\s*([^<]+)[\s\S]*?list__value-start">\s*([\d]+\s*\/\s*[\d]+\s*\(\d+\))/g;
    let wlMatch;
    while ((wlMatch = wlRegex.exec(tabHtml)) !== null) {
      const label = wlMatch[1].trim().toLowerCase();
      const record = parseWLString(wlMatch[2]);
      if (label === 'career') stats[catKey].career = record;
      else if (label.includes('year')) stats[catKey].thisYear = record;
    }
  }

  const totalStart = html.indexOf('id="tabStatsTotal"');
  if (totalStart > -1) {
    const historyIndex = html.indexOf('History', totalStart);
    if (historyIndex > -1) {
      const historyEnd = html.indexOf('</ul>', historyIndex);
      const historyHtml = html.substring(
        historyIndex,
        historyEnd > -1 ? historyEnd : historyIndex + 2000,
      );
      const tagRegex = /tag--(success|danger)[^"]*"[^>]*title="([^"]*)"/g;
      let historyMatch;
      while ((historyMatch = tagRegex.exec(historyHtml)) !== null) {
        stats.recentHistory.push({ won: historyMatch[1] === 'success', date: historyMatch[2] });
      }
    }
  }

  return stats;
}

export function deriveCategoryFromEvent(eventName) {
  const eventNameLower = eventName.toLowerCase();
  if (eventNameLower.includes('xd') || eventNameLower.includes('mixed')) return 'mixed';
  if (eventNameLower.includes('bd') || eventNameLower.includes('gd') || eventNameLower.includes('doubles')) return 'doubles';
  return 'singles';
}

const PLACE_ORDER = { gold: 1, silver: 2, bronze: 3, fourth: 4 };

/**
 * Single shared medal deduction algorithm.
 * @param {Array<{event: string, round: string, won: boolean}>} matches
 * @returns {Array<{place: string, event: string, category: string}>}
 */
export function deduceMedalsFromRounds(matches) {
  const medals = [];
  const seen = new Set();

  const eventsWithThirdFourth = new Set();
  for (const m of matches) {
    if (/3rd.*4th/i.test(m.round)) eventsWithThirdFourth.add(m.event);
  }

  const medalledEvents = new Set();

  for (const m of matches) {
    if (/consolation/i.test(m.round) || !m.round) continue;

    let place = null;
    if (m.round === 'Final') {
      place = m.won ? 'gold' : 'silver';
    } else if (/3rd.*4th/i.test(m.round)) {
      place = m.won ? 'bronze' : 'fourth';
    }

    if (!place) continue;
    const key = `${m.event}:${place}`;
    if (seen.has(key)) continue;
    seen.add(key);
    medalledEvents.add(m.event);
    medals.push({ place, event: m.event, category: deriveCategoryFromEvent(m.event) });
  }

  for (const m of matches) {
    if (/consolation/i.test(m.round) || !m.round || !/semi/i.test(m.round)) continue;
    if (m.won || medalledEvents.has(m.event)) continue;

    const place = eventsWithThirdFourth.has(m.event) ? 'fourth' : 'bronze';
    const key = `${m.event}:${place}`;
    if (seen.has(key)) continue;
    seen.add(key);
    medals.push({ place, event: m.event, category: deriveCategoryFromEvent(m.event) });
  }

  medals.sort((a, b) => PLACE_ORDER[a.place] - PLACE_ORDER[b.place]);
  return medals;
}

export function parseTswTournaments(html, playerName) {
  const tournaments = [];
  const tournamentBlocks = html.split(/<div class="media">/g).slice(1);

  for (const tournamentBlock of tournamentBlocks) {
    const nameMatch = tournamentBlock.match(/media__link[^>]*>\s*<span class="nav-link__value">([^<]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim().replace(/&amp;/g, '&');

    const urlMatch = tournamentBlock.match(/href="((?:\/sport\/tournament\?id=[^"]+)|(?:\/tournament\/[0-9A-Fa-f-]+[^"]*))"/i);
    const url = urlMatch ? `https://www.tournamentsoftware.com${urlMatch[1].replace(/&amp;/g, '&')}` : '';
    const tournamentIdMatch = url.match(/(?:[?&]|&amp;)id=([0-9A-Fa-f-]+)/i)
      || url.match(/\/tournament\/([0-9A-Fa-f-]+)/i)
      || tournamentBlock.match(/\/tournament\/([0-9A-Fa-f-]+)\/player\/\d+/i);
    const tournamentId = tournamentIdMatch ? tournamentIdMatch[1] : '';

    let selfPlayerId;

    const dateMatch = tournamentBlock.match(/<time[^>]*>([^<]+)<\/time>\s*(?:to\s*<time[^>]*>([^<]+)<\/time>)?/);
    const dates = dateMatch
      ? (dateMatch[2] ? `${dateMatch[1].trim()} - ${dateMatch[2].trim()}` : dateMatch[1].trim())
      : '';
    const startDateAttr = tournamentBlock.match(/<time[^>]*datetime="([^"]*)"[^>]*>/);
    const startDate = startDateAttr ? startDateAttr[1].trim() : '';

    const locMatch = tournamentBlock.match(/icon-lang[^>]*\/>\s*([^<]+)/);
    const location = locMatch ? locMatch[1].trim().replace(/^\|\s*/, '') : '';

    const eventMap = new Map();
    const tournamentMatches = [];
    let currentEvent = '';

    const innerRegex = /module-divider__body[^>]*>\s*(?:Event:\s*)?([^<]+)|<div class="match">([\s\S]*?)(?=<div class="match">|<h[45] class="module-divider|<\/li>\s*<li class="module|$)/g;
    let innerMatch;
    while ((innerMatch = innerRegex.exec(tournamentBlock)) !== null) {
      if (innerMatch[1]) {
        const eventName = innerMatch[1].trim();
        if (eventName) currentEvent = eventName;
        continue;
      }
      if (innerMatch[2] === undefined) continue;

      const block = innerMatch[2];
      if (block.includes('>Bye<')) continue;

      const rowBlocks = block.split(/<div class="match__row[\s"]/g).slice(1);
      if (rowBlocks.length < 2) continue;

      const status1 = rowBlocks[0].match(/match__status">([WL])</);
      const status2 = rowBlocks[1].match(/match__status">([WL])</);
      const isWalkover = block.includes('>Walkover<');
      const isRetired = /match__message">\s*Retired?\s*</i.test(block)
        || />\s*Retired?\s*</i.test(block)
        || />\s*Ret\.?\s*</i.test(block);
      if (!status1 && !status2 && !isWalkover) continue;

      function extractTeam(rowHtml) {
        const players = [];
        const contentBlocks = rowHtml.split(/match__row-title-value-content/).slice(1);
        for (const contentBlock of contentBlocks) {
          const playerNameMatch = contentBlock.match(/nav-link__value">([^<]+)<\/span>/);
          if (!playerNameMatch) continue;
          const parsedName = decodeHtmlEntities(playerNameMatch[1].trim());
          if (!parsedName || parsedName === 'Bye') continue;
          const idMatch = contentBlock.match(/data-player-id="(\d+)"/)
            || contentBlock.match(/\/player\/(\d+)(?:[/"?]|$)/i)
            || contentBlock.match(/(?:[?&]|&amp;)player=(\d+)/i);
          players.push({
            name: parsedName,
            playerId: idMatch ? parseInt(idMatch[1], 10) : null,
          });
        }
        if (players.length === 0) {
          const fallbackRegex = /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*nav-link__value[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<\/a>/gi;
          let fallbackMatch;
          while ((fallbackMatch = fallbackRegex.exec(rowHtml)) !== null) {
            const href = fallbackMatch[1];
            const parsedName = decodeHtmlEntities(fallbackMatch[2].trim());
            if (!parsedName || parsedName === 'Bye') continue;
            const idMatch = href.match(/\/player\/(\d+)(?:[/"?]|$)/i)
              || href.match(/(?:[?&]|&amp;)player=(\d+)/i);
            players.push({
              name: parsedName,
              playerId: idMatch ? parseInt(idMatch[1], 10) : null,
            });
          }
        }
        return players;
      }

      const row1Team = extractTeam(rowBlocks[0]);
      const row2Team = extractTeam(rowBlocks[1]);

      let row1IsPlayer;
      let playerWon;
      if (status1 || status2) {
        row1IsPlayer = !!status1;
        playerWon = status1 ? status1[1] === 'W' : status2[1] === 'W';
      } else {
        const playerNameLower = playerName.toLowerCase();
        const row1HasPlayer = row1Team.some(({ name: rowName }) => {
          const rowNameLower = rowName.toLowerCase();
          return rowNameLower.includes(playerNameLower)
            || playerNameLower.includes(rowNameLower)
            || playerNameLower.split(/\s+/).every((part) => rowNameLower.includes(part));
        });
        row1IsPlayer = row1HasPlayer;
        const row1Won = rowBlocks[0].includes('has-won');
        playerWon = row1IsPlayer ? row1Won : !row1Won;
      }

      if (currentEvent) {
        if (!eventMap.has(currentEvent)) eventMap.set(currentEvent, { wins: 0, losses: 0 });
        const record = eventMap.get(currentEvent);
        if (playerWon) record.wins += 1;
        else record.losses += 1;
      }

      const opponentTeam = row1IsPlayer ? row2Team : row1Team;
      const playerTeam = row1IsPlayer ? row1Team : row2Team;
      const opponentNames = opponentTeam.map((player) => player.name);
      const teamNames = playerTeam.map((player) => player.name);
      const nameParts = playerName.toLowerCase().split(/\s+/);
      const partnerNames = teamNames.filter((teamName) =>
        !nameParts.every((part) => new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(teamName)),
      );

      if (!selfPlayerId) {
        const selfMember = playerTeam.find((p) => {
          if (p.playerId == null) return false;
          const pLower = p.name.toLowerCase();
          return pLower.includes(playerName.toLowerCase())
            || playerName.toLowerCase().includes(pLower)
            || nameParts.every((part) => pLower.includes(part));
        });
        if (selfMember) selfPlayerId = selfMember.playerId;
      }

      const category = deriveCategoryFromEvent(currentEvent);
      const roundMatch = block.match(/match__header-title-item[\s\S]*?nav-link__value">([^<]+)/);
      const round = roundMatch ? roundMatch[1].trim() : '';

      const scores = [];
      const setRegex = /<ul class="points">([\s\S]*?)<\/ul>/g;
      let setMatch;
      while ((setMatch = setRegex.exec(block)) !== null) {
        const points = [];
        const pointRegex = /<li class="points__cell[^"]*">\s*(\d+)/g;
        let pointMatch;
        while ((pointMatch = pointRegex.exec(setMatch[1])) !== null) {
          points.push(parseInt(pointMatch[1], 10));
        }
        if (points.length === 2) {
          scores.push(row1IsPlayer ? points : [points[1], points[0]]);
        }
      }

      const dateLabelMatch = block.match(/icon-clock[\s\S]*?nav-link__value">([^<]+)/);

      tournamentMatches.push({
        tournament: name,
        tournamentId: tournamentId || undefined,
        tournamentUrl: url,
        event: currentEvent,
        round,
        opponent: opponentNames.join(' / ') || 'Unknown',
        partner: partnerNames.join(' / '),
        playerTeam,
        opponentTeam,
        category,
        score: isWalkover
          ? 'Walkover'
          : isRetired
            ? `${scores.map((score) => score.join('-')).join(', ')} Ret.`
            : scores.map((score) => score.join('-')).join(', '),
        won: playerWon,
        date: dateLabelMatch ? dateLabelMatch[1].trim() : '',
        walkover: isWalkover || undefined,
        retired: isRetired || undefined,
      });
    }

    const events = [...eventMap.entries()]
      .filter(([eventName]) => eventName.length > 0)
      .map(([eventName, record]) => ({ name: eventName, category: deriveCategoryFromEvent(eventName), ...record }));

    if (events.length > 0) {
      tournaments.push({
        name,
        tswId: tournamentId || undefined,
        selfPlayerId,
        url,
        dates,
        startDate: startDate || undefined,
        location,
        events,
        matches: tournamentMatches,
      });
    }
  }

  return { tournaments };
}
