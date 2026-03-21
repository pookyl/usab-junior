import { readFile, writeFile, stat, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DISK_CACHE_DIR = join(process.cwd(), 'data');
const DISK_CACHE_FILE = join(DISK_CACHE_DIR, 'rankings-cache.json');

function isValidDateValue(value) {
  return typeof value === 'string' && DATE_RE.test(value);
}

export function diskCachePath(date) {
  return join(DISK_CACHE_DIR, `rankings-${date}.json`);
}

export async function listCachedDates() {
  try {
    if (!existsSync(DISK_CACHE_DIR)) return [];
    const files = await readdir(DISK_CACHE_DIR);
    const dates = [];
    for (const fileName of files) {
      const match = fileName.match(/^rankings-(\d{4}-\d{2}-\d{2})\.json$/);
      if (match) dates.push(match[1]);
    }
    return dates.sort().reverse();
  } catch {
    return [];
  }
}

export function rebuildRankingsFromPlayers(allPlayers) {
  const rankings = {};
  for (const player of allPlayers) {
    for (const entry of player.entries) {
      const key = `${entry.ageGroup}-${entry.eventType}`;
      if (!rankings[key]) rankings[key] = [];
      rankings[key].push({
        usabId: player.usabId,
        name: player.name,
        rank: entry.rank,
        rankingPoints: entry.rankingPoints,
        ageGroup: entry.ageGroup,
        eventType: entry.eventType,
      });
    }
  }
  for (const key of Object.keys(rankings)) {
    rankings[key].sort((a, b) => a.rank - b.rank);
  }
  return rankings;
}

export async function loadDiskCacheForDate(date) {
  if (!isValidDateValue(date)) return null;
  try {
    const raw = await readFile(diskCachePath(date), 'utf-8');
    const data = JSON.parse(raw);
    if (!data.rankings && data.allPlayers) {
      data.rankings = rebuildRankingsFromPlayers(data.allPlayers);
    }
    return data;
  } catch {
    return null;
  }
}

export async function loadDiskCache() {
  try {
    const raw = await readFile(DISK_CACHE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveDiskCache(date, rankings, allPlayers) {
  await mkdir(DISK_CACHE_DIR, { recursive: true });

  const perDateFile = diskCachePath(date);
  try {
    await stat(perDateFile);
  } catch {
    const lean = { date, allPlayers, savedAt: new Date().toISOString() };
    await writeFile(perDateFile, JSON.stringify(lean));
  }

  const full = { date, rankings, allPlayers, savedAt: new Date().toISOString() };
  await writeFile(DISK_CACHE_FILE, JSON.stringify(full, null, 2));
}

export async function getDiskCachedRankings(key, date) {
  const disk = date ? await loadDiskCacheForDate(date) : await loadDiskCache();
  return disk?.rankings?.[key] ?? null;
}

export async function getDiskCachedAllPlayers(date) {
  const disk = date ? await loadDiskCacheForDate(date) : await loadDiskCache();
  if (disk?.allPlayers) return { players: disk.allPlayers, date: disk.date };
  return null;
}

export async function getDiskCachedDate() {
  const disk = await loadDiskCache();
  return disk?.date ?? null;
}
