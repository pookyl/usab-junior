import { beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({
  USAB_BASE: 'https://usabjrrankings.org',
  BROWSER_HEADERS: {},
  TSW_BASE: 'https://www.tournamentsoftware.com',
  TSW_ORG_CODE: 'ORG',
  getCached: vi.fn(),
  setCache: vi.fn(),
  listCachedDates: vi.fn(),
  loadDiskCacheForDate: vi.fn(),
  fetchWithRetry: vi.fn(),
  parsePlayerDetailGrouped: vi.fn(),
  parsePlayerGender: vi.fn(),
  tswFetch: vi.fn(),
  tswUsabProfilePath: vi.fn(() => '/profile'),
  tswUsabTournamentsPath: vi.fn(() => '/tournaments'),
  tswUsabOverviewPath: vi.fn(() => '/overview'),
  emptyCat: vi.fn(() => ({ career: { wins: 0, losses: 0, total: 0, winPct: 0 }, thisYear: { wins: 0, losses: 0, total: 0, winPct: 0 } })),
  parseTswOverviewStats: vi.fn(),
  parseTswTournaments: vi.fn(),
  setCors: vi.fn(),
  isValidUsabId: vi.fn(),
  getDiskCachedDate: vi.fn(() => Promise.resolve('2026-03-01')),
}));

vi.mock('./_lib/shared.js', () => shared);

import handler from './player/[id]/[action].js';

function createRes() {
  return {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: null as unknown,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
    writeHead(code: number, headers?: Record<string, string>) {
      this.statusCode = code;
      if (headers) Object.assign(this.headers, headers);
      return this;
    },
    end(data?: string) {
      this.body = data ? JSON.parse(data) : null;
      return this;
    },
  };
}

describe('api/player/[id]/[action] contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shared.isValidUsabId.mockReturnValue(false);
  });

  it('returns validation error for invalid id on tsw-stats', async () => {
    const req = { method: 'GET', query: { id: 'bad-id', action: 'tsw-stats', name: 'Alice' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid player ID',
        details: { field: 'id' },
      },
    });
  });

  it('returns validation error for invalid id on ranking-trend', async () => {
    const req = { method: 'GET', query: { id: 'bad-id', action: 'ranking-trend' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid player ID',
        details: { field: 'id' },
      },
    });
  });

  it('returns validation error for invalid id on ranking-detail', async () => {
    const req = { method: 'GET', query: { id: 'bad-id', action: 'ranking-detail' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid player ID',
        details: { field: 'id' },
      },
    });
  });
});
