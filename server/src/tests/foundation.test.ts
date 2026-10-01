import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('Foundation Stabilization Test Suite', () => {
  const timestamp = Date.now();
  const testUserA = {
    email: `testuser_a_${timestamp}@example.com`,
    password: 'Password123!',
    phone: `+9190000${Math.floor(10005 + Math.random() * 89999)}`,
    fullName: 'Test User A'
  };

  const testUserB = {
    email: `testuser_b_${timestamp}@example.com`,
    password: 'Password123!',
    phone: `+9190000${Math.floor(10005 + Math.random() * 89999)}`,
    fullName: 'Test User B'
  };

  let tokenUserA: string = '';
  let refreshTokenUserA: string = '';
  let tokenUserB: string = '';

  describe('1. Health Endpoint', () => {
    it('should return 200 OK and healthy status', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    });
  });

  describe('2. Authentication & Authorization Flow', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: testUserA.email,
          password: testUserA.password,
          phone: testUserA.phone,
          fullName: testUserA.fullName
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUserA.email);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should login user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUserA.email,
          password: testUserA.password
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();

      tokenUserA = res.body.data.accessToken;

      // Extract pb_refresh_token from cookies
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      if (Array.isArray(cookies)) {
        const refreshCookie = cookies.find((c: string) => c.startsWith('pb_refresh_token='));
        if (refreshCookie) {
          refreshTokenUserA = refreshCookie.split(';')[0].split('=')[1];
        }
      }
    });

    it('should reject login with invalid password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUserA.email,
          password: 'WrongPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should refresh access token using valid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`pb_refresh_token=${refreshTokenUserA}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should return authenticated user profile on /auth/me', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUserA.email);
    });

    it('should reject unauthorized request when token is missing', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject customer access to RBAC privileged route (/auth/rbac-test)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/rbac-test')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should logout user and clear refresh cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('3. Customer Profile & Biometrics Persistence', () => {
    it('should retrieve customer profile for logged in user', async () => {
      const res = await request(app)
        .get('/api/v1/customers/me/profile')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testUserA.email);
    });

    it('should update health profile and persist biometrics', async () => {
      const profileUpdate = {
        fullName: 'Test User A Updated',
        heightCm: 175,
        weightKg: 72,
        goal: 'muscle_gain',
        activityLevel: 'high',
        hasExercise: true,
        dietaryPreference: 'Non-Vegetarian'
      };

      const res = await request(app)
        .put('/api/v1/customers/me/profile')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send(profileUpdate);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test User A Updated');
      expect(res.body.data.heightCm).toBe(175);
      expect(res.body.data.weightKg).toBe(72);
      expect(res.body.data.goal).toBe('muscle_gain');
      expect(res.body.data.bmi).toBeGreaterThan(0);
      expect(res.body.data.tdee).toBeGreaterThan(0);
    });
  });

  describe('4. Customer Ownership Isolation', () => {
    it('should maintain strict ownership isolation between distinct customer accounts', async () => {
      // 1. Register User B
      const regB = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: testUserB.email,
          password: testUserB.password,
          phone: testUserB.phone,
          fullName: testUserB.fullName
        });

      tokenUserB = regB.body.data.accessToken;

      // 2. Update User B profile
      await request(app)
        .put('/api/v1/customers/me/profile')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({
          fullName: 'Unique User B Name',
          heightCm: 185,
          weightKg: 85,
          goal: 'weight_loss',
          activityLevel: 'moderate'
        });

      // 3. User A gets profile -> must NOT see User B data
      const profileA = await request(app)
        .get('/api/v1/customers/me/profile')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(profileA.body.data.email).toBe(testUserA.email);
      expect(profileA.body.data.name).toBe('Test User A Updated');
      expect(profileA.body.data.heightCm).toBe(175);

      // 4. User B gets profile -> must see User B data
      const profileB = await request(app)
        .get('/api/v1/customers/me/profile')
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(profileB.body.data.email).toBe(testUserB.email);
      expect(profileB.body.data.name).toBe('Unique User B Name');
      expect(profileB.body.data.heightCm).toBe(185);
    });
  });
});
