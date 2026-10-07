import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.RL_GENERAL_MAX = '5';

describe('Phase 4C — general API rate limit', () => {
  let app: any;

  beforeAll(async () => {
    app = (await import('../app.js')).default;
  });

  it('general API limit applies, while the health check stays exempt', async () => {
    for (let i = 0; i < 8; i++) {
      const health = await request(app).get('/api/v1/health');
      expect(health.status).toBe(200);
    }
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app).get('/api/v1/products');
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
  });
});
