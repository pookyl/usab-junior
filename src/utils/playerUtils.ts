import type { PlayerEntry } from '../types/junior';

export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

const BOY_EVENTS = new Set(['BS', 'BD']);
const GIRL_EVENTS = new Set(['GS', 'GD']);

export function inferGender(entries: PlayerEntry[]): 'Boy' | 'Girl' | null {
  for (const e of entries) {
    if (BOY_EVENTS.has(e.eventType)) return 'Boy';
    if (GIRL_EVENTS.has(e.eventType)) return 'Girl';
  }
  return null;
}

export function parseScoreString(score: string): number[][] {
  if (!score || score.toLowerCase() === 'walkover') return [];
  return score
    .split(/[,;]\s*/)
    .map((s) => {
      const parts = s.trim().split('-').map(Number);
      return parts.length === 2 && parts.every((n) => !isNaN(n)) ? parts : null;
    })
    .filter((s): s is number[] => s !== null);
}
