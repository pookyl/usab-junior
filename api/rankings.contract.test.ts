import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  getCached: vi.fn(),
  setCache: vi.fn(),
  setCors: vi.fn(),
}));

const diskCache = vi.hoisted(() => ({
  getDiskCachedRankings: vi.fn(),
  getDiskCachedDate: vi.fn(),
}));

const validation = vi.hoisted(() => ({
  isValidDate: vi.fn(),
  isValidAgeGroup: vi.fn(),
  isValidEventType: vi.fn(),
}));

vi.mock('./_lib/runtime.js', () => runtime);
vi.mock('./_lib/rankingsDiskCache.js', () => diskCache);
vi.mock('./_lib/validation.js', () => validation);

import handler from './rankings.js';

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

describe('api/rankings contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    diskCache.getDiskCachedDate.mockResolvedValue('2026-03-01');
    runtime.getCached.mockReturnValue(null);
    diskCache.getDiskCachedRankings.mockResolvedValue(null);
    validation.isValidAgeGroup.mockReturnValue(true);
    validation.isValidEventType.mockReturnValue(true);
    validation.isValidDate.mockReturnValue(true);
  });

  it('returns validation error shape on invalid query', async () => {
    validation.isValidAgeGroup.mockReturnValue(false);
    const req = { method: 'GET', query: { age_group: 'BAD', category: 'BS', date: '2026-03-01' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid age_group',
        details: { field: 'age_group' },
      },
    });
  });

  it('returns unavailable error when no cached data exists', async () => {
    const req = { method: 'GET', query: { age_group: 'U11', category: 'BS', date: '2026-03-01' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: {
        code: 'DATA_UNAVAILABLE',
        message: 'No data available',
      },
    });
  });
});
