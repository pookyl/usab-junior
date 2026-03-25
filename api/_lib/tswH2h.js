import { decodeHtmlEntities } from './core.js';

export function parseH2HContent(html, headers) {
  const team1wins = parseInt(headers.get('team1wins') ?? '0', 10);
  const team2wins = parseInt(headers.get('team2wins') ?? '0', 10);

  const careerMatch = html.match(
    /<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>\s*<th[^>]*>[^<]*Career W-L[^<]*<\/th>\s*<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>/s,
  );
  const yearMatch = html.match(
    /<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>\s*<th[^>]*>[^<]*This year W-L[^<]*<\/th>\s*<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>/s,
  );

  const matches = [];
  const matchBlocks = html.split(/<div class="match">/g).slice(1);
  for (const block of matchBlocks) {
    const headerItems = [];
    const headerRegex = /<li class="match__header-title-item">[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/g;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(block)) !== null) {
      headerItems.push(headerMatch[1].trim().replace(/&amp;/g, '&'));
    }
    const tournament = headerItems[0] ?? '';
    const event = headerItems[1] ?? '';
    const round = headerItems[2] ?? '';

    const tournamentIdMatch = block.match(/(?:[?&]|&amp;)id=([0-9A-Fa-f-]+)/i)
      || block.match(/\/tournament\/([0-9A-Fa-f-]+)/i);
    const tournamentId = tournamentIdMatch?.[1] ?? '';
    const tournamentUrl = tournamentIdMatch ? `/tournament/${tournamentId}` : '';

    const durationMatch = block.match(/<time[^>]*>([\dhmHM\s]+)<\/time>/);
    const duration = durationMatch ? durationMatch[1].trim() : '';

    const bodyMatch = block.match(/<div class="match__body">([\s\S]*?)<div class="match__result">/);
    const bodyHtml = bodyMatch ? bodyMatch[1] : '';
    const rowBlocks = bodyHtml.split(/<div class="match__row[\s"]/g).slice(1);
    const team1Won = (rowBlocks[0] ?? '').includes('has-won');
    const team2Won = (rowBlocks[1] ?? '').includes('has-won');

    function extractPlayers(rowHtml) {
      const players = [];
      const contentBlocks = rowHtml.split(/match__row-title-value-content/).slice(1);
      for (const contentBlock of contentBlocks) {
        const nameMatch = contentBlock.match(/nav-link__value">([^<]+)<\/span>/);
        if (!nameMatch) continue;
        const parsedName = decodeHtmlEntities(nameMatch[1].trim());
        if (!parsedName || parsedName === 'Bye') continue;
        const idMatch = contentBlock.match(/data-player-id="(\d+)"/)
          || contentBlock.match(/(?:[?&]|&amp;)player=(\d+)/i)
          || contentBlock.match(/\/player\/(\d+)(?:[/"?]|$)/i);
        players.push({
          name: parsedName,
          playerId: idMatch ? parseInt(idMatch[1], 10) : null,
        });
      }
      if (players.length === 0) {
        const fallbackRegex = /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>[\s\S]*?<\/a>/gi;
        let fallbackMatch;
        while ((fallbackMatch = fallbackRegex.exec(rowHtml)) !== null) {
          const href = fallbackMatch[1];
          const parsedName = decodeHtmlEntities(fallbackMatch[2].trim());
          if (!parsedName || parsedName === 'Bye') continue;
          const idMatch = href.match(/(?:[?&]|&amp;)player=(\d+)/i)
            || href.match(/\/player\/(\d+)(?:[/"?]|$)/i);
          players.push({
            name: parsedName,
            playerId: idMatch ? parseInt(idMatch[1], 10) : null,
          });
        }
      }
      return players;
    }

    const team1 = extractPlayers(rowBlocks[0] ?? '');
    const team2 = extractPlayers(rowBlocks[1] ?? '');
    const team1Players = team1.map((player) => player.name);
    const team2Players = team2.map((player) => player.name);
    const team1Ids = team1.map((player) => player.playerId);
    const team2Ids = team2.map((player) => player.playerId);

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
      if (points.length === 2) scores.push(points);
    }

    const isWalkover = block.includes('>Walkover<');
    const isRetired = /match__message">\s*Retired?\s*</i.test(block)
      || />\s*Retired?\s*</i.test(block)
      || />\s*Ret\.?\s*</i.test(block);

    const dateMatch = block.match(/icon-clock[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/);
    const venueMatch = block.match(/icon-marker[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/);

    matches.push({
      tournament,
      tournamentId: tournamentId || undefined,
      tournamentUrl,
      event,
      round,
      duration,
      team1Players,
      team2Players,
      team1Won,
      team2Won,
      scores,
      team1Ids: team1Ids.some((id) => id !== null) ? team1Ids : undefined,
      team2Ids: team2Ids.some((id) => id !== null) ? team2Ids : undefined,
      date: dateMatch ? dateMatch[1].trim() : '',
      venue: venueMatch ? venueMatch[1].trim() : '',
      walkover: isWalkover || undefined,
      retired: isRetired || undefined,
    });
  }

  return {
    team1wins,
    team2wins,
    careerWL: {
      team1: careerMatch ? careerMatch[1].trim() : '',
      team2: careerMatch ? careerMatch[2].trim() : '',
    },
    yearWL: {
      team1: yearMatch ? yearMatch[1].trim() : '',
      team2: yearMatch ? yearMatch[2].trim() : '',
    },
    matches,
  };
}
