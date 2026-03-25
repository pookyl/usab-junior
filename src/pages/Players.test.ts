import { describe, expect, it } from 'vitest';
import type { UniquePlayer } from '../types/junior';
import { buildCategoryRankings } from './Players';

const players: UniquePlayer[] = [
  {
    usabId: '200',
    name: 'Beta Player',
    entries: [
      { ageGroup: 'U13', eventType: 'BS', rank: 2, rankingPoints: 9200 },
      { ageGroup: 'U13', eventType: 'BD', rank: 7, rankingPoints: 6100 },
    ],
  },
  {
    usabId: '100',
    name: 'Alpha Player',
    entries: [
      { ageGroup: 'U13', eventType: 'BS', rank: 1, rankingPoints: 9800 },
      { ageGroup: 'U15', eventType: 'BS', rank: 4, rankingPoints: 7000 },
    ],
  },
];

describe('buildCategoryRankings', () => {
  it('filters to the selected category and sorts by rank', () => {
    expect(buildCategoryRankings(players, 'U13', 'BS')).toEqual([
      { usabId: '100', name: 'Alpha Player', rank: 1, rankingPoints: 9800 },
      { usabId: '200', name: 'Beta Player', rank: 2, rankingPoints: 9200 },
    ]);
  });

  it('ignores entries from other categories', () => {
    expect(buildCategoryRankings(players, 'U13', 'GD')).toEqual([]);
  });
});
