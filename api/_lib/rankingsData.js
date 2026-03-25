import { decodeHtmlEntities } from './core.js';

export function parseRankings(html, ageGroup, eventType) {
  const players = [];
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return players;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' '));
    }
    if (cells.length < 4) continue;
    const rank = parseInt(cells[0], 10);
    const usabId = cells[1].trim();
    const name = decodeHtmlEntities(cells[2].trim());
    const pts = parseInt(cells[3].replace(/,/g, ''), 10);
    if (rank > 0 && usabId && name) {
      players.push({ usabId, name, rank, rankingPoints: pts, ageGroup, eventType });
    }
  }
  return players;
}

export function parsePlayerGender(html) {
  const match = html.match(/<h4>\s*Gender\s*:\s*(\w+)\s*<\/h4>/i);
  return match ? match[1].trim() : null;
}

export function parsePlayerDetail(html) {
  const entries = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const linkMatch = rowHtml.match(
      /<td[^>]*class="[^"]*tournament-link[^"]*"[^>]*data-tournament-id="(\d+)"[^>]*data-tournament-name="([^"]+)"[^>]*data-tournament-location="([^"]*)"[^>]*>/i,
    );
    if (!linkMatch) continue;

    const tournamentId = linkMatch[1];
    const tournamentName = decodeHtmlEntities(linkMatch[2]);
    const location = decodeHtmlEntities(linkMatch[3]);

    const cells = [];
    const cellRegex = /<td(?![^>]*tournament-link)[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    const place = cells[0] ?? '';
    const pts = parseInt((cells[1] ?? '0').replace(/,/g, ''), 10);

    if (tournamentName && pts > 0) {
      entries.push({ tournamentName, location, tournamentId, place, points: pts });
    }
  }
  return entries;
}

export function parsePlayerDetailGrouped(html) {
  const sections = [];
  const sectionRegex = /<div class="category-section">([\s\S]*?)<\/div>/gi;
  let sectionMatch;

  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const sectionHtml = sectionMatch[1];

    const h4Regex = /<h4>([\s\S]*?)<\/h4>/gi;
    const h4s = [];
    let h4Match;
    while ((h4Match = h4Regex.exec(sectionHtml)) !== null) {
      h4s.push(h4Match[1].trim());
    }
    if (h4s.length < 2) continue;

    const categoryText = h4s[0].replace(/<[^>]*>/g, '').trim();
    const rankPointsText = h4s[1].replace(/<[^>]*>/g, '').trim();

    const catParts = categoryText.match(/^(BS|GS|BD|GD|XD)\s+(U\d+)$/i);
    if (!catParts) continue;

    const eventType = catParts[1].toUpperCase();
    const ageGroup = catParts[2];

    const rankPointsMatch = rankPointsText.match(/Ranking Points\s*\(Rank\)\s*:\s*([\d,]+)\s*\(\s*(\d+)\s*\)/i);
    const rankingPoints = rankPointsMatch ? parseInt(rankPointsMatch[1].replace(/,/g, ''), 10) : 0;
    const rank = rankPointsMatch ? parseInt(rankPointsMatch[2], 10) : 0;

    const tournaments = [];
    const rowRegex = /<tr[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(sectionHtml)) !== null) {
      const trClass = rowMatch[1];
      const rowHtml = rowMatch[2];

      const tdTagMatch = rowHtml.match(/<td[^>]*class="[^"]*tournament-link[^"]*"[^>]*>/i);
      if (!tdTagMatch) continue;
      const tag = tdTagMatch[0];

      const attr = (name) => {
        const match = tag.match(new RegExp(`data-${name}="([^"]*)"`));
        return match ? match[1] : '';
      };

      const tournamentId = attr('tournament-id');
      const tournamentName = decodeHtmlEntities(attr('tournament-name'));
      const location = decodeHtmlEntities(attr('tournament-location'));
      const startDate = attr('tournament-start-date') || undefined;
      const endDate = attr('tournament-end-date') || undefined;
      const tournamentType = attr('tournament-type') || undefined;

      const cells = [];
      const cellRegex = /<td(?![^>]*tournament-link)[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
      }

      const place = cells[0] ?? '';
      const pts = parseInt((cells[1] ?? '0').replace(/,/g, ''), 10);
      const contributing = !trClass.includes('white-row');

      if (tournamentName && pts > 0) {
        tournaments.push({
          tournamentName,
          location,
          tournamentId,
          place,
          points: pts,
          startDate,
          endDate,
          tournamentType,
          contributing,
        });
      }
    }

    if (tournaments.length > 0 || rank > 0) {
      sections.push({ ageGroup, eventType, rank, rankingPoints, tournaments });
    }
  }

  return sections;
}
