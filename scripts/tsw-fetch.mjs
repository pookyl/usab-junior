#!/usr/bin/env node
// Usage: node scripts/tsw-fetch.mjs <url>
// Fetches a TournamentSoftware URL with proper cookie handling and prints the HTML.

import { tswFetch, TSW_BASE } from '../api/_lib/shared.js';

const url = process.argv[2];
if (!url) {
  console.error(`Usage: node scripts/tsw-fetch.mjs <tsw-url>

Fetches a TournamentSoftware URL with proper cookie handling and prints the HTML.

Examples:
  # Print raw HTML
  node scripts/tsw-fetch.mjs https://www.tournamentsoftware.com/tournament/5779DD58-5F08-4D64-A092-B41478B07A0A/player/156

  # Save to file
  node scripts/tsw-fetch.mjs <url> > output.html

  # Search for something
  node scripts/tsw-fetch.mjs <url> | grep "Daniel Li"

  # View a section around a keyword
  node scripts/tsw-fetch.mjs <url> | python3 -c "import sys; html=sys.stdin.read(); i=html.find('467298'); print(html[max(0,i-200):i+500])"
`);
  process.exit(1);
}

const path = url.startsWith(TSW_BASE) ? url.slice(TSW_BASE.length) : url;

try {
  const resp = await tswFetch(path);
  if (!resp.ok) {
    console.error(`HTTP ${resp.status} ${resp.statusText}`);
    process.exit(1);
  }
  const html = await resp.text();
  process.stdout.write(html);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
