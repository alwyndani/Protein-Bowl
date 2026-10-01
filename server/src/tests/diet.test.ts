import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import { CustomerService } from '../modules/customer/customer.service.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

function generateTestToken(userId: string, email: string, roles: RoleEnum[]) {
  const secret = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_1234567890_super_secret';
  return jwt.sign({ userId, email, roles }, secret, { expiresIn: '15m' });
}

describe('Phase 3 — Diet & Nutrition Workflow Integration Tests', () => {
  const ts = Date.now();

  let userCustomerA: any;
  let tokenCustomerA: string;

  let userCustomerB: any;
  let tokenCustomerB: string;

  let userNutritionistA: any;
  let tokenNutritionistA: string;

  let userNutritionistB: any;
  let tokenNutritionistB: string;

  let userMD: any;
  let tokenMD: string;

  let userSuperAdmin: any;
  let tokenSuperAdmin: string;

  let createdRequestId: string;
  let createdPlanIdV1: string;
  let createdPlanIdV2: string;

  beforeAll(async () => {
    const pwdHash = await bcrypt.hash('Password123!', 10);

    // 1. Setup Customer A
    userCustomerA = await prisma.user.create({
      data: {
        email: `cust_a_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: {
          create: {
            fullName: 'Customer Alice',
            referralCode: `PB-ALICE${ts}`
          }
        }
      },
      include: { customerProfile: true }
    });
    tokenCustomerA = generateTestToken(userCustomerA.id, userCustomerA.email, [RoleEnum.CUSTOMER]);
    const custService = new CustomerService();
    await custService.updateCustomerProfile(userCustomerA.id, {
      fullName: 'Customer Alice',
      heightCm: 168,
      weightKg: 62,
      goal: 'weight_loss',
      activityLevel: 'moderate',
      medicalConditions: ['PCOS'],
      allergies: ['Peanuts']
    });

    // 2. Setup Customer B
    userCustomerB = await prisma.user.create({
      data: {
        email: `cust_b_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: {
          create: {
            fullName: 'Customer Bob',
            referralCode: `PB-BOB${ts}`
          }
        }
      },
      include: { customerProfile: true }
    });
    tokenCustomerB = generateTestToken(userCustomerB.id, userCustomerB.email, [RoleEnum.CUSTOMER]);
    await custService.updateCustomerProfile(userCustomerB.id, {
      fullName: 'Customer Bob',
      heightCm: 180,
      weightKg: 85,
      goal: 'muscle_gain',
      activityLevel: 'high'
    });

    // 3. Setup Nutritionist A
    userNutritionistA = await prisma.user.create({
      data: {
        email: `nut_a_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.NUTRITIONIST } }
      }
    });
    tokenNutritionistA = generateTestToken(userNutritionistA.id, userNutritionistA.email, [RoleEnum.NUTRITIONIST]);

    // 4. Setup Nutritionist B
    userNutritionistB = await prisma.user.create({
      data: {
        email: `nut_b_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.NUTRITIONIST } }
      }
    });
    tokenNutritionistB = generateTestToken(userNutritionistB.id, userNutritionistB.email, [RoleEnum.NUTRITIONIST]);

    // 5. Setup MD Executive
    userMD = await prisma.user.create({
      data: {
        email: `md_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.MD } }
      }
    });
    tokenMD = generateTestToken(userMD.id, userMD.email, [RoleEnum.MD]);

    // 6. Setup SuperAdmin
    userSuperAdmin = await prisma.user.create({
      data: {
        email: `admin_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.SUPER_ADMIN } }
      }
    });
    tokenSuperAdmin = generateTestToken(userSuperAdmin.id, userSuperAdmin.email, [RoleEnum.SUPER_ADMIN]);
  });

  // Test 1
  it('1. Customer creates own diet request successfully', async () => {
    const res = await request(app)
      .post('/api/v1/diets/requests')
      .set('Authorization', `Bearer ${tokenCustomerA}`)
      .send({
        goal: 'Weight Loss & PCOS Management',
        notes: 'Strict peanut allergy',
        planType: 'complete',
        durationDays: 30,
        dietaryPreference: 'non-veg',
        grainPreference: 'Kerala Matta Rice',
        spiceLevel: 'Medium'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(res.body.data.customerProfileId).toBe(userCustomerA.customerProfile.id);

    createdRequestId = res.body.data.id;
  });

  // Test 2
  it('2. Customer cannot submit or view data using arbitrary identity', async () => {
    const res = await request(app)
      .get('/api/v1/diets/my-requests')
      .set('Authorization', `Bearer ${tokenCustomerB}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const bReqs = res.body.data;
    const containsAReq = bReqs.some((r: any) => r.id === createdRequestId);
    expect(containsAReq).toBe(false);
  });

  // Test 3
  it('3. Nutritionist sees eligible request queue in unassigned pool', async () => {
    const res = await request(app)
      .get('/api/v1/diets/nutritionist/unassigned-queue')
      .set('Authorization', `Bearer ${tokenNutritionistA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const queue = res.body.data;
    const foundReq = queue.find((r: any) => r.id === createdRequestId);
    expect(foundReq).toBeDefined();
    expect(foundReq.status).toBe('SUBMITTED');
  });

  // Test 4
  it('4. Customer cannot access nutritionist queue (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/v1/diets/nutritionist/unassigned-queue')
      .set('Authorization', `Bearer ${tokenCustomerA}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // Test 5
  it('5. Nutritionist A successfully claims unassigned request', async () => {
    const res = await request(app)
      .post(`/api/v1/diets/requests/${createdRequestId}/claim`)
      .set('Authorization', `Bearer ${tokenNutritionistA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nutritionistId).toBe(userNutritionistA.id);
    expect(res.body.data.status).toBe('ASSIGNED');
  });

  // Test 6
  it('6. Concurrent/second nutritionist B cannot claim already claimed request (409 Conflict)', async () => {
    const res = await request(app)
      .post(`/api/v1/diets/requests/${createdRequestId}/claim`)
      .set('Authorization', `Bearer ${tokenNutritionistB}`);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  // Test 7
  it('7. Unrelated nutritionist B cannot access detailed health profile for claimed request (403 Forbidden)', async () => {
    const res = await request(app)
      .get(`/api/v1/diets/requests/${createdRequestId}/health-profile`)
      .set('Authorization', `Bearer ${tokenNutritionistB}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // Test 8
  it('8. Assigned nutritionist A can access required patient health information', async () => {
    const res = await request(app)
      .get(`/api/v1/diets/requests/${createdRequestId}/health-profile`)
      .set('Authorization', `Bearer ${tokenNutritionistA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(userCustomerA.customerProfile.id);
    expect(res.body.data.healthBiometrics.medicalConditions).toContain('PCOS');
  });

  // Test 9
  it('9. MD Executive cannot access detailed customer health profile (Least Privilege Correction - 403 Forbidden)', async () => {
    const res = await request(app)
      .get(`/api/v1/diets/requests/${createdRequestId}/health-profile`)
      .set('Authorization', `Bearer ${tokenMD}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // Test 10
  it('10. Assigned nutritionist A creates and publishes Version 1 diet plan', async () => {
    const payload = {
      requestId: createdRequestId,
      name: 'PCOS Weight Loss Plan v1',
      targetCalories: 1650,
      proteinGrams: 110,
      carbsGrams: 150,
      fatGrams: 45,
      internalClinicalNotes: 'INTERNAL CLINICAL SECRET: High insulin resistance noted, limit raw salt.',
      customerVisibleNotes: 'Drink 1 glass warm lemon chia water before breakfast.',
      days: [
        {
          dayNumber: 1,
          dayName: 'Monday',
          meals: [
            {
              mealType: 'breakfast',
              timingLabel: '08:00 AM - Breakfast',
              recipeName: 'Spinach & Egg White Omelette',
              portionGrams: 220,
              calories: 250,
              protein: 24,
              carbs: 8,
              fat: 10,
              customizationNote: 'No salt added',
              slotRemarks: 'Drink warm water 15m before meal'
            }
          ]
        }
      ]
    };

    const res = await request(app)
      .post('/api/v1/diets/plans')
      .set('Authorization', `Bearer ${tokenNutritionistA}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.versionNumber).toBe(1);
    expect(res.body.data.isLatestVersion).toBe(true);
    expect(res.body.data.status).toBe('SUBMITTED');

    createdPlanIdV1 = res.body.data.id;
  });

  // Test 11
  it('11. Unrelated nutritionist B cannot modify or publish plan for Customer A request (403 Forbidden)', async () => {
    const payload = {
      requestId: createdRequestId,
      name: 'Unauthorized Overwrite',
      targetCalories: 2000,
      proteinGrams: 100,
      carbsGrams: 200,
      fatGrams: 50,
      days: [{ dayNumber: 1, dayName: 'Monday', meals: [{ mealType: 'breakfast', recipeName: 'Oats', calories: 200, protein: 10, carbs: 30, fat: 5 }] }]
    };

    const res = await request(app)
      .post('/api/v1/diets/plans')
      .set('Authorization', `Bearer ${tokenNutritionistB}`)
      .send(payload);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // Test 12
  it('12. Published plan is visible to correct customer (Customer A)', async () => {
    const res = await request(app)
      .get('/api/v1/diets/my-plans')
      .set('Authorization', `Bearer ${tokenCustomerA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const plans = res.body.data;
    const foundPlan = plans.find((p: any) => p.id === createdPlanIdV1);
    expect(foundPlan).toBeDefined();
    expect(foundPlan.customerVisibleNotes).toContain('Drink 1 glass warm lemon chia water');
  });

  // Test 13
  it('13. Another customer (Customer B) cannot view Customer A diet plan', async () => {
    const res = await request(app)
      .get('/api/v1/diets/my-plans')
      .set('Authorization', `Bearer ${tokenCustomerB}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const plans = res.body.data;
    const foundPlan = plans.find((p: any) => p.id === createdPlanIdV1);
    expect(foundPlan).toBeUndefined();
  });

  // Test 14
  it('14. Customer A requests revision on published plan V1', async () => {
    const res = await request(app)
      .post(`/api/v1/diets/plans/${createdPlanIdV1}/request-revision`)
      .set('Authorization', `Bearer ${tokenCustomerA}`)
      .send({
        revisionNotes: 'Please swap Monday breakfast to Oats instead of Omelette.'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('REVISED');
  });

  // Test 15 & 16
  it('15 & 16. Nutritionist A publishes Version 2 plan -> preserves V1 as historical record and marks V2 as latest version', async () => {
    const payload = {
      requestId: createdRequestId,
      name: 'PCOS Weight Loss Plan v2',
      targetCalories: 1650,
      proteinGrams: 110,
      carbsGrams: 150,
      fatGrams: 45,
      customerVisibleNotes: 'Updated with Oats breakfast as requested.',
      days: [
        {
          dayNumber: 1,
          dayName: 'Monday',
          meals: [
            {
              mealType: 'breakfast',
              recipeName: 'High Protein Oats & Berries',
              portionGrams: 250,
              calories: 300,
              protein: 20,
              carbs: 45,
              fat: 6
            }
          ]
        }
      ]
    };

    const res = await request(app)
      .post('/api/v1/diets/plans')
      .set('Authorization', `Bearer ${tokenNutritionistA}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.versionNumber).toBe(2);
    expect(res.body.data.isLatestVersion).toBe(true);
    expect(res.body.data.parentPlanId).toBe(createdPlanIdV1);

    createdPlanIdV2 = res.body.data.id;

    // Verify Version 1 in DB is preserved with isLatestVersion = false
    const v1Db = await prisma.dietPlan.findUnique({ where: { id: createdPlanIdV1 } });
    expect(v1Db).toBeDefined();
    expect(v1Db?.versionNumber).toBe(1);
    expect(v1Db?.isLatestVersion).toBe(false);
  });

  // Test 17
  it('17. Customer A can approve latest published Version 2 plan', async () => {
    const res = await request(app)
      .post(`/api/v1/diets/plans/${createdPlanIdV2}/approve`)
      .set('Authorization', `Bearer ${tokenCustomerA}`)
      .send({ customerFeedback: 'Perfect, approved!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');

    // Verify request status transitions to COMPLETED
    const reqDb = await prisma.dietPlanRequest.findUnique({ where: { id: createdRequestId } });
    expect(reqDb?.status).toBe('COMPLETED');
  });

  // Test 18
  it('18. Invalid status transitions are rejected (cannot re-approve already approved plan)', async () => {
    const res = await request(app)
      .post(`/api/v1/diets/plans/${createdPlanIdV2}/approve`)
      .set('Authorization', `Bearer ${tokenCustomerA}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 19
  it('19. Internal clinical notes are strictly absent from customer API responses', async () => {
    const res = await request(app)
      .get('/api/v1/diets/my-plans')
      .set('Authorization', `Bearer ${tokenCustomerA}`);

    expect(res.status).toBe(200);
    const plans = res.body.data;
    plans.forEach((plan: any) => {
      expect(plan.internalClinicalNotes).toBeUndefined();
    });
  });

  // Test 20
  it('20. Phase 1/2 foundation health check endpoint remains 100% operational', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
  });
});
