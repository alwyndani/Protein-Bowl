import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.RL_LOGIN_MAX = '3';
process.env.RL_REGISTER_MAX = '2';
process.env.RL_REFRESH_MAX = '2';

const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';

describe('P11A — mobile routes share the web auth rate limits', () => {
  let app: any;
  beforeAll(async () => {
    app = (await import('../app.js')).default;
  });

  it('web and mobile login draw from ONE budget (mobile cannot be used to bypass the web limit)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 2; i++) statuses.push((await request(app).post('/api/v1/auth/login').send({ email: 'n@n.test', password: 'x' })).status);
    statuses.push((await request(app).post('/api/v1/auth/mobile/login').set('X-PB-Client', CLIENT).send({ email: 'n@n.test', password: 'x' })).status);
    statuses.push((await request(app).post('/api/v1/auth/mobile/login').set('X-PB-Client', CLIENT).send({ email: 'n@n.test', password: 'x' })).status);
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses[3]).toBe(429);
  });

  it('mobile register and mobile refresh are rate limited', async () => {
    const reg: number[] = [];
    for (let i = 0; i < 3; i++) reg.push((await request(app).post('/api/v1/auth/mobile/register').set('X-PB-Client', CLIENT).send({})).status);
    expect(reg[2]).toBe(429);
    const ref: number[] = [];
    for (let i = 0; i < 3; i++) ref.push((await request(app).post('/api/v1/auth/mobile/refresh').set('X-PB-Client', CLIENT).send({ refreshToken: 'x' })).status);
    expect(ref[2]).toBe(429);
  });

  it('a 429 response still carries no cookie', async () => {
    const res = await request(app).post('/api/v1/auth/mobile/login').set('X-PB-Client', CLIENT).send({ email: 'n@n.test', password: 'x' });
    expect(res.status).toBe(429);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
