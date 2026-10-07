import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_LOGIN_MAX = '3';
process.env.RL_REGISTER_MAX = '2';
process.env.RL_REFRESH_MAX = '2';

describe('Phase 4C — authentication rate limits', () => {
  let app: any;

  beforeAll(async () => {
    app = (await import('../app.js')).default;
  });

  it('login is rate limited (429 after the configured max)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@nowhere.test', password: 'wrong-password' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3).every((s) => s === 401)).toBe(true);
    expect(statuses[3]).toBe(429);
  });

  it('register is rate limited (429 after the configured max)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/v1/auth/register').send({});
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 2).every((s) => s !== 429)).toBe(true);
    expect(statuses[2]).toBe(429);
  });

  it('refresh is rate limited (429 after the configured max)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/v1/auth/refresh').send({});
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 2).every((s) => s !== 429)).toBe(true);
    expect(statuses[2]).toBe(429);
  });

  it('limits are keyed per endpoint: other routes remain available', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
  });
});
