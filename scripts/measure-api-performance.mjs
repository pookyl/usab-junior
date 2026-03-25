#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3001';
const sampleCount = Math.max(1, Number(process.env.SAMPLES || 5));

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(1));
}

async function measureEndpoint(url) {
  const startedAt = performance.now();
  const response = await fetch(url);
  const body = await response.text();
  return {
    status: response.status,
    elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    bytes: Buffer.byteLength(body),
    cache: response.headers.get('x-cache') || response.headers.get('x-source') || 'none',
    payloadBytes: Number(response.headers.get('x-payload-bytes') || Buffer.byteLength(body)),
    serverTiming: response.headers.get('server-timing') || '',
  };
}

async function main() {
  const datesResponse = await fetch(`${baseUrl}/api/cached-dates`);
  if (!datesResponse.ok) {
    throw new Error(`Could not load cached dates from ${baseUrl}: HTTP ${datesResponse.status}`);
  }
  const { dates } = await datesResponse.json();
  const date = dates?.[0];
  if (!date) throw new Error('No cached dates available to benchmark');

  const allPlayersResponse = await fetch(`${baseUrl}/api/all-players?date=${date}`);
  if (!allPlayersResponse.ok) {
    throw new Error(`Could not load all players for benchmark date ${date}`);
  }
  const allPlayers = await allPlayersResponse.json();
  const sampleId = allPlayers?.[0]?.usabId;

  const endpoints = [
    { id: 'cached-dates', url: `${baseUrl}/api/cached-dates` },
    { id: 'rankings-u13-bs', url: `${baseUrl}/api/rankings?age_group=U13&category=BS&date=${date}` },
    { id: 'all-players', url: `${baseUrl}/api/all-players?date=${date}` },
    { id: 'player-directory', url: `${baseUrl}/api/player-directory` },
    sampleId ? { id: 'ranking-trend', url: `${baseUrl}/api/player/${sampleId}/ranking-trend` } : null,
    { id: 'spotlight', url: `${baseUrl}/api/tournaments?spotlight=true` },
  ].filter(Boolean);

  const results = [];
  for (const endpoint of endpoints) {
    const samples = [];
    for (let i = 0; i < sampleCount; i += 1) {
      samples.push(await measureEndpoint(endpoint.url));
    }
    const durations = samples.map((sample) => sample.elapsedMs);
    const latest = samples[samples.length - 1];
    results.push({
      id: endpoint.id,
      url: endpoint.url,
      status: latest.status,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      payloadBytes: latest.payloadBytes,
      cache: latest.cache,
      serverTiming: latest.serverTiming,
    });
  }

  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    baseUrl,
    sampleCount,
    benchmarkDate: date,
    samplePlayerId: sampleId || null,
    results,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
