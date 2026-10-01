import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { seedRecipes } from '../../prisma/seedRecipes.js';
import { ALL_RECIPES } from '../../../src/data/recipeDatabase.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

function generateTestToken(userId: string, email: string, roles: RoleEnum[]) {
  const secret = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_1234567890_super_secret';
  return jwt.sign({ userId, email, roles }, secret, { expiresIn: '15m' });
}

describe('Phase 4A — Recipe & Nutrition Catalog Domain Tests', () => {
  const ts = Date.now();

  let userCustomer: any;
  let tokenCustomer: string;

  let userNutritionist: any;
  let tokenNutritionist: string;

  let userChef: any;
  let tokenChef: string;

  let userSuperAdmin: any;
  let tokenSuperAdmin: string;

  let userMD: any;
  let tokenMD: string;

  let createdDraftRecipeId: string;

  beforeAll(async () => {
    const pwdHash = await bcrypt.hash('Password123!', 10);

    // Setup Customer User
    userCustomer = await prisma.user.create({
      data: {
        email: `recipe_cust_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: {
          create: {
            fullName: 'Recipe Test Customer',
            referralCode: `PB-RCUST${ts}`,
          },
        },
      },
    });
    tokenCustomer = generateTestToken(userCustomer.id, userCustomer.email, [RoleEnum.CUSTOMER]);

    // Setup Nutritionist User
    userNutritionist = await prisma.user.create({
      data: {
        email: `recipe_nut_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.NUTRITIONIST } },
        employeeProfile: {
          create: {
            employeeCode: `EMP-NUT-${ts}`,
            fullName: 'Recipe Test Nutritionist',
            designation: 'Clinical Nutritionist',
          },
        },
      },
    });
    tokenNutritionist = generateTestToken(userNutritionist.id, userNutritionist.email, [RoleEnum.NUTRITIONIST]);

    // Setup Chef User
    userChef = await prisma.user.create({
      data: {
        email: `recipe_chef_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.CHEF } },
        employeeProfile: {
          create: {
            employeeCode: `EMP-CHEF-${ts}`,
            fullName: 'Recipe Test Chef',
            designation: 'Head Chef',
          },
        },
      },
    });
    tokenChef = generateTestToken(userChef.id, userChef.email, [RoleEnum.CHEF]);

    // Setup Super Admin User
    userSuperAdmin = await prisma.user.create({
      data: {
        email: `recipe_admin_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.SUPER_ADMIN } },
      },
    });
    tokenSuperAdmin = generateTestToken(userSuperAdmin.id, userSuperAdmin.email, [RoleEnum.SUPER_ADMIN]);

    // Setup MD User
    userMD = await prisma.user.create({
      data: {
        email: `recipe_md_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.MD } },
      },
    });
    tokenMD = generateTestToken(userMD.id, userMD.email, [RoleEnum.MD]);

    // Seed 120 recipes into test database
    await seedRecipes();
  });

  // 1. Exactly 120 source recipes can be imported
  it('1. Exactly 120 source recipes can be imported', async () => {
    const count = await prisma.recipe.count();
    expect(ALL_RECIPES.length).toBe(120);
    expect(count).toBeGreaterThanOrEqual(120);
  });

  // 2. Import is idempotent
  it('2. Import is idempotent on re-run', async () => {
    const seedStats = await seedRecipes();
    expect(seedStats.sourceCount).toBe(120);
    expect(seedStats.dbCount).toBe(120);
    expect(seedStats.recipesWithIngredients).toBe(120);
  });

  // 3. Recipe listing returns published recipes
  it('3. Recipe listing returns published recipes', async () => {
    const res = await request(app).get('/api/v1/recipes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.every((r: any) => r.isPublished === true)).toBe(true);
  });

  // 4. Pagination works
  it('4. Server-side pagination works', async () => {
    const res = await request(app).get('/api/v1/recipes?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(120);
  });

  // 5. Category filter works
  it('5. Category filter works', async () => {
    const category = ALL_RECIPES[0].category;
    const res = await request(app).get(`/api/v1/recipes?category=${encodeURIComponent(category)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r: any) => r.category.toLowerCase() === category.toLowerCase())).toBe(true);
  });

  // 6. Dietary filter works
  it('6. Dietary filter works', async () => {
    const res = await request(app).get('/api/v1/recipes?dietaryTag=non-veg');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r: any) => r.dietaryTag === 'non-veg')).toBe(true);
  });

  // 7. Cuisine/spice filters work where data supports them
  it('7. Cuisine/spice filters work', async () => {
    const sampleCuisine = ALL_RECIPES.find((r) => Boolean(r.cuisine))?.cuisine || 'Kerala';
    const res = await request(app).get(`/api/v1/recipes?cuisine=${encodeURIComponent(sampleCuisine)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r: any) => r.cuisine.toLowerCase().includes(sampleCuisine.toLowerCase()))).toBe(true);
  });

  // 8. Search works
  it('8. Text search works across title, description, category', async () => {
    const res = await request(app).get('/api/v1/recipes?search=Chicken');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  // 9. Nutrition filters work
  it('9. Nutrition filters work (min/max calories & protein)', async () => {
    const res = await request(app).get('/api/v1/recipes?minCalories=200&maxCalories=600&minProtein=20');
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: any) => r.calories >= 200 && r.calories <= 600 && r.protein >= 20)).toBe(true);
  });

  // 10. Unpublished recipe does not appear publicly
  it('10. Unpublished draft recipe does not appear in public catalog', async () => {
    // Create draft recipe directly in DB
    const draft = await prisma.recipe.create({
      data: {
        code: `REC-SECRET-DRAFT-${ts}`,
        title: 'Secret Unreleased Gourmet Dish',
        category: 'Chef Special',
        calories: 500,
        proteinGrams: 40,
        carbsGrams: 30,
        fatGrams: 10,
        isPublished: false,
      },
    });

    const res = await request(app).get('/api/v1/recipes?search=Secret%20Unreleased');
    expect(res.status).toBe(200);
    expect(res.body.data.some((r: any) => r.id === draft.id)).toBe(false);
  });

  // 11. Direct public lookup cannot expose unpublished recipe
  it('11. Direct public lookup HTTP 404s for unpublished recipe', async () => {
    const draft = await prisma.recipe.create({
      data: {
        code: `REC-HIDDEN-${ts}`,
        title: 'Hidden Recipe Item',
        category: 'Chef Special',
        calories: 400,
        proteinGrams: 30,
        carbsGrams: 20,
        fatGrams: 10,
        isPublished: false,
      },
    });

    const res = await request(app).get(`/api/v1/recipes/${draft.id}`);
    expect(res.status).toBe(404);
  });

  // 12. Public/customer response excludes internal costing
  it('12. Public/customer response excludes internal costing field (costPerPortion)', async () => {
    const res = await request(app).get('/api/v1/recipes');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty('costPerPortion');
  });

  // 13. Public/customer response excludes internal chef instructions
  it('13. Public/customer response excludes internal chef preparation instructions', async () => {
    const res = await request(app).get('/api/v1/recipes');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty('chefInstructions');
  });

  // 14. Customer cannot create/edit/publish recipe
  it('14. Customer cannot create/edit/publish recipe (HTTP 403 Forbidden)', async () => {
    const createRes = await request(app)
      .post('/api/v1/recipes')
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({ title: 'Customer Recipe', category: 'Test', calories: 100, proteinGrams: 10, carbsGrams: 10, fatGrams: 2 });
    expect(createRes.status).toBe(403);
  });

  // 15. Nutritionist cannot create/edit/publish recipe
  it('15. Nutritionist cannot create/edit/publish recipe (HTTP 403 Forbidden)', async () => {
    const createRes = await request(app)
      .post('/api/v1/recipes')
      .set('Authorization', `Bearer ${tokenNutritionist}`)
      .send({ title: 'Nutritionist Recipe', category: 'Test', calories: 100, proteinGrams: 10, carbsGrams: 10, fatGrams: 2 });
    expect(createRes.status).toBe(403);
  });

  // 16. Nutritionist can browse published recipe catalog
  it('16. Nutritionist can browse published recipe catalog via staff API', async () => {
    const res = await request(app)
      .get('/api/v1/recipes/staff/all')
      .set('Authorization', `Bearer ${tokenNutritionist}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  // 17. Chef can create a draft recipe
  it('17. Chef can create a draft recipe (auto-assigned isPublished = false)', async () => {
    const res = await request(app)
      .post('/api/v1/recipes')
      .set('Authorization', `Bearer ${tokenChef}`)
      .send({
        code: `REC-CHEF-DRAFT-${ts}`,
        title: 'Chef Custom Protein Bowl Draft',
        category: 'Choice of Chicken – Air Fried',
        servingSize: '1 Portion',
        servingGrams: 250,
        calories: 450,
        proteinGrams: 42,
        carbsGrams: 25,
        fatGrams: 12,
        isPublished: true, // Chef attempts to publish, but service overrides to false
        ingredientsList: [
          { name: 'Boneless Chicken Breast', quantity: 200, unit: 'grams' },
          { name: 'Olive Oil', quantity: 10, unit: 'ml' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.isPublished).toBe(false); // MUST remain draft
    createdDraftRecipeId = res.body.data.id;
  });

  // 18. Chef can edit permitted recipe
  it('18. Chef can edit permitted recipe', async () => {
    const res = await request(app)
      .put(`/api/v1/recipes/${createdDraftRecipeId}`)
      .set('Authorization', `Bearer ${tokenChef}`)
      .send({
        title: 'Chef Custom Protein Bowl Draft (Updated Title)',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Chef Custom Protein Bowl Draft (Updated Title)');
  });

  // 19. Chef cannot publish recipe
  it('19. Chef cannot publish recipe (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .patch(`/api/v1/recipes/${createdDraftRecipeId}/publish`)
      .set('Authorization', `Bearer ${tokenChef}`)
      .send({ isPublished: true });

    expect(res.status).toBe(403);
  });

  // 20. Super Admin can publish/unpublish recipe
  it('20. Super Admin can publish and unpublish recipe', async () => {
    // Publish
    const pubRes = await request(app)
      .patch(`/api/v1/recipes/${createdDraftRecipeId}/publish`)
      .set('Authorization', `Bearer ${tokenSuperAdmin}`)
      .send({ isPublished: true });

    expect(pubRes.status).toBe(200);
    expect(pubRes.body.data.isPublished).toBe(true);

    // Verify it now appears publicly
    const publicLookup = await request(app).get(`/api/v1/recipes/${createdDraftRecipeId}`);
    expect(publicLookup.status).toBe(200);
    expect(publicLookup.body.data.title).toBe('Chef Custom Protein Bowl Draft (Updated Title)');

    // Unpublish
    const unpubRes = await request(app)
      .patch(`/api/v1/recipes/${createdDraftRecipeId}/publish`)
      .set('Authorization', `Bearer ${tokenSuperAdmin}`)
      .send({ isPublished: false });

    expect(unpubRes.status).toBe(200);
    expect(unpubRes.body.data.isPublished).toBe(false);
  });

  // 21. Recipe detail preserves relational ingredient quantity/unit
  it('21. Recipe detail preserves relational ingredient quantity and unit', async () => {
    const recipe = await prisma.recipe.findFirst({
      where: { isPublished: true },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    expect(recipe).toBeDefined();
    expect(recipe!.ingredients.length).toBeGreaterThan(0);
    const ingLink = recipe!.ingredients[0];
    expect(ingLink.quantity).toBeGreaterThan(0);
    expect(ingLink.unit).toBeDefined();
    expect(ingLink.ingredient.name).toBeDefined();
  });

  // 22. DietPlanMeal snapshot remains unchanged after Recipe update
  it('22. DietPlanMeal snapshot remains unchanged after original Recipe is updated', async () => {
    const recipe = await prisma.recipe.findFirst({ where: { isPublished: true } });
    expect(recipe).toBeDefined();

    const originalCalories = recipe!.calories;

    // Create a diet plan meal taking snapshot of original recipe
    const dietPlan = await prisma.dietPlan.create({
      data: {
        customerProfileId: userCustomer.customerProfileId || (await prisma.customerProfile.findFirst({ where: { userId: userCustomer.id } }))!.id,
        name: 'Snapshot Compatibility Plan',
        targetCalories: 2000,
        proteinGrams: 150,
        carbsGrams: 200,
        fatGrams: 60,
        days: {
          create: {
            dayNumber: 1,
            dayName: 'Monday',
            meals: {
              create: {
                mealType: 'BREAKFAST',
                recipeId: recipe!.id,
                recipeName: recipe!.title,
                calories: originalCalories,
                protein: Math.round(recipe!.proteinGrams),
                carbs: Math.round(recipe!.carbsGrams),
                fat: Math.round(recipe!.fatGrams),
              },
            },
          },
        },
      },
      include: {
        days: {
          include: {
            meals: true,
          },
        },
      },
    });

    const mealSnapshot = dietPlan.days[0].meals[0];

    // Update original recipe calories in DB
    await prisma.recipe.update({
      where: { id: recipe!.id },
      data: { calories: originalCalories + 300 },
    });

    // Query diet plan meal snapshot
    const fetchedMeal = await prisma.dietPlanMeal.findUnique({ where: { id: mealSnapshot.id } });
    expect(fetchedMeal!.calories).toBe(originalCalories); // Snapshot preserved!
  });

  // 23. Existing Phase 3 diet workflow continues working
  it('23. Existing Phase 3 diet workflow endpoints continue functioning', async () => {
    const res = await request(app)
      .get('/api/v1/diets/my-requests')
      .set('Authorization', `Bearer ${tokenCustomer}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
