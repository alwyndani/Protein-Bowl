import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLANK_CUSTOMER_PROFILE } from '../data/blankProfile';
import { mapCustomerRequests } from '../utils/dietMapping';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('Chef recipe form has no invented data', () => {
  const chef = read('src/components/erp/ChefDashboard.tsx');
  it('no static recipe catalogue, stock photo default or placeholder rating', () => {
    expect(chef).not.toMatch(/ALL_RECIPES/);
    expect(chef).not.toMatch(/unsplash/i);
    expect(chef).not.toMatch(/rating:\s*4\.\d/);
  });
});

describe('health profile save is never reported as done before the server stored it', () => {
  it('the wizard continues only after the awaited save succeeded; the app reports a failed save', () => {
    const wizard = read('src/components/customer/HealthProfileWizard.tsx');
    const app = read('src/App.tsx');
    expect(wizard).toMatch(/const saved = await onSaveProfile\(updated\);\s*if \(!saved\) return;/);
    expect(wizard).not.toMatch(/Retain optimistic/);
    expect(app).toMatch(/profileSaveError/);
    expect(app).not.toMatch(/Retain optimistic UI state/);
  });
});

describe('sign-in protects the stored health profile (static wiring)', () => {
  it('AuthModal decides from the stored profile and App re-opens it prefilled', () => {
    const modal = read('src/components/customer/AuthModal.tsx');
    const app = read('src/App.tsx');
    expect(modal).toMatch(/isHealthProfileComplete\(fetched\.data\)/);
    expect(modal).not.toMatch(/Sign In & Capture Health Data/);
    expect(app).toMatch(/onProfileLoaded=\{/);
    expect(app).toMatch(/key=\{authModalKey\}/);
    const server = read('server/src/modules/customer/customer.service.ts');
    expect(server).not.toMatch(/data\.(primaryGoals|workoutTypes|medicalConditions|supplements|allergies|foodDislikes|digestiveHealth|addonSlots) \|\| \[\]/);
    expect(server).not.toMatch(/hasExercise: data\.hasExercise \?\? false/);
  });
});

describe('the customer menu is not the static seed list', () => {
  it('App and CustomerHome read published recipes from the API', () => {
    for (const f of ['src/App.tsx', 'src/components/customer/CustomerHome.tsx']) {
      const src = read(f);
      expect(src, f).not.toMatch(/ALL_RECIPES|data\/recipeDatabase/);
      expect(src, f).toContain('usePublishedRecipes');
    }
  });
});

describe('no static recipe or inventory catalogue is used anywhere in the web app', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      return e.isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
    });
  const STATIC_DATA = /data\/(recipeDatabase|inventoryDatabase|ingredientNutrition|recipes\/)|\bALL_RECIPES\b/;

  it('no source file imports a static recipe/inventory module or ALL_RECIPES', () => {
    const offenders = walk('src')
      .filter((f) => !/^src\/data\/(recipeDatabase|inventoryDatabase|ingredientNutrition)\.ts$|^src\/data\/recipes\//.test(f))
      .filter((f) => f !== 'src/test/noDemoData.test.ts' && f !== 'src/components/customer/CheckoutModal.test.tsx')
      .filter((f) => STATIC_DATA.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('the plan review and the nutritionist dish picker load recipes through the API hooks', () => {
    expect(read('src/components/customer/CustomerPlanReview.tsx')).toContain('usePublishedRecipes');
    expect(read('src/components/erp/NutritionistDashboard.tsx')).toContain('useStaffRecipes');
    expect(read('src/hooks/useStaffRecipes.ts')).toContain('getStaffRecipes');
  });
});

describe('the server never returns invented profile values', () => {
  it('formatProfileResponse has no fallback persona, measurements, conditions or lifestyle', () => {
    const svc = read('server/src/modules/customer/customer.service.ts');
    expect(svc).not.toMatch(/\|\| 165|\|\| 68\b|\|\| 58\b|'1995-04-18'|\['PCOS'\]|\|\| 'Professional'|\|\| 24\.5|\|\| 8500|\|\| 'Irregular'|\|\| 'Regular'|\|\| 'female'/);
  });
});

describe('health forms do not invent identity or measurements', () => {
  it('no persona or default body measurements in the wizards', () => {
    for (const file of ['src/components/customer/HealthProfileWizard.tsx', 'src/components/customer/AuthModal.tsx', 'src/components/customer/HealthProfileTab.tsx']) {
      const src = read(file).replace(/IS_DEV \? '[^']*'/g, ''); // development-only prefills are allowed
      expect(src, file).not.toMatch(/\|\| \['PCOS'\]|\|\| 'Metformin|\|\| \['Peanuts'\]|\|\| \['Mushroom'|\|\| 'Flexible Hours'|\|\| 'Non-Vegetarian'\}|\['Mushroom', 'Bitter Gourd'\]|fastingBloodSugar: 98|hbA1c: 5\.6|\|\| 24\.5|\|\| 8500|\|\| 'IT Professional'|\|\| 'Irregular'/);
      expect(src, file).not.toMatch(/useState(<[^>]*>)?\((initialProfile\?*|profile)\.gender \|\| 'female'\)/);
      expect(src, file).not.toMatch(/\|\| 'Anjali Ramesh'|\|\| 'anjali@example\.com'|\|\| 165\)|\|\| 68\)|\|\| 58\)|\|\| 29\)|'1995-04-18'|\(Initial\)/);
    }
  });
});

describe('no demo data reaches customers', () => {
  const FILES = [
    'src/App.tsx',
    'src/components/customer/CustomerHome.tsx',
    'src/components/customer/CustomerPlanReview.tsx',
    'src/components/customer/CustomerDashboard.tsx'
  ];

  it('customer-facing files import no mock data module and no INITIAL_* demo constants', () => {
    for (const f of FILES) {
      const s = read(f);
      expect(s, f).not.toMatch(/data\/mock\w*/);
      expect(s, f).not.toMatch(/\bINITIAL_(CUSTOMER_PROFILE|DIET_PLAN_REQUESTS|ORDERS|COMBO_OFFERS|RECIPES|WORKOUT_PLAN|PROGRESS_PHOTOS|VIDEO_SESSIONS)\b/);
    }
  });

  it('the app starts with an EMPTY profile (no person, measurement or condition is invented)', () => {
    expect(BLANK_CUSTOMER_PROFILE.id).toBe('');
    expect(BLANK_CUSTOMER_PROFILE.name).toBe('');
    expect(BLANK_CUSTOMER_PROFILE.email).toBe('');
    expect(BLANK_CUSTOMER_PROFILE.heightCm).toBe(0);
    expect(BLANK_CUSTOMER_PROFILE.medicalConditions).toEqual([]);
    expect(BLANK_CUSTOMER_PROFILE.allergies).toEqual([]);
  });

  it('App resets the profile, requests and orders when nobody is signed in', () => {
    const s = read('src/App.tsx');
    expect(s).toMatch(/setProfile\(BLANK_CUSTOMER_PROFILE\)/);
    expect(s).toMatch(/useState<DietPlanRequest\[\]>\(\[\]\)/);
    expect(s).not.toMatch(/useState<Order\[\]>/); // the legacy diet-plan orders state is gone
    expect(s).not.toMatch(/(?<![A-Za-z])CheckoutModal\b/); // and so is the diet-plan checkout
  });
});

describe('no fake verification or contact data in the sign-up path', () => {
  const auth = read('src/components/customer/AuthModal.tsx');
  const wizard = read('src/components/customer/HealthProfileWizard.tsx');

  it('there is no pretend phone-OTP step (no SMS service exists)', () => {
    for (const [name, s] of [['AuthModal', auth], ['HealthProfileWizard', wizard]] as const) {
      expect(s, name).not.toMatch(/Demo OTP|OTP Code dispatched|4821|Verify Mobile OTP|showOtpModal|setOtpCode|handleVerifyOtp/);
    }
    expect(auth).not.toMatch(/mode === 'otp'|setMode\('otp'\)/);
  });

  it('a made-up phone number is never saved into a customer profile', () => {
    expect(auth).not.toMatch(/phone:\s*formData\.phone \|\| '\+91/);
    expect(wizard).not.toMatch(/useState\(profile\.phone \|\| '\+91/);
  });

  it('there is no social sign-in at all (it was a development stand-in that registered accounts with a fixed shared password)', () => {
    expect(auth).not.toMatch(/handleSocialAuth|SocialAuthPassword|Google SSO|Apple ID/);
  });

  it('the client has no pricing engine', () => {
    if (fs.existsSync(path.join(process.cwd(), 'src/utils/costEngine.ts'))) expect(read('src/utils/costEngine.ts')).not.toMatch(/export (function|const)/); // deleted or an empty stub
    expect(wizard).not.toMatch(/costEngine/);
  });
});

describe('no hard-coded business values', () => {
  it('the home page shows no fixed Mess price, discount or refund promise (prices come from the server)', () => {
    const s = read('src/components/customer/CustomerHome.tsx');
    expect(s).not.toMatch(/₹\s?\d/);
    expect(s).not.toMatch(/instant refund|refund credits|free home-trip/i);
  });

  it('the footer shows no invented address or phone; contact details come from configuration and are hidden when unset', () => {
    const s = read('src/components/common/BrandFooter.tsx');
    expect(s).not.toMatch(/98765|2345678|Plot 42|Panampilly|care@proteinbowl/);
    expect(s).toMatch(/VITE_CONTACT_ADDRESS/);
  });

  it('there is no mock branch list or hard-coded kitchen option in the staff header', () => {
    expect(read('src/components/common/BrandHeader.tsx')).not.toMatch(/Trivandrum Kitchen|Kochi Central HQ|Kozhikode Hub/);
    expect(read('src/App.tsx')).not.toMatch(/cloudKitchensData|CLOUD_KITCHEN_BRANCHES|currentBranchId/);
  });

  it('a production web build never falls back to localhost for the API', () => {
    expect(read('src/services/apiClient.ts')).toMatch(/import\.meta\.env\.PROD \? '\/api\/v1'/);
  });
});

describe('mapCustomerRequests', () => {
  const profile = { ...BLANK_CUSTOMER_PROFILE, id: 'c1', name: 'Asha', email: 'a@test.com', phone: '999' };

  it('returns nothing for a non-array answer', () => {
    expect(mapCustomerRequests(null, profile)).toEqual([]);
    expect(mapCustomerRequests({ error: 'x' }, profile)).toEqual([]);
  });

  it('maps status and the published plan days/meals without inventing values', () => {
    const rows = [
      {
        id: 'r1', goal: 'weight_loss', status: 'PLAN_CREATED', durationDays: 7, createdAt: '2026-10-31T00:00:00.000Z',
        dietPlans: [{ customerVisibleNotes: 'Drink water', days: [{ dayNumber: 1, dayName: 'Monday', meals: [
          { mealType: 'breakfast', timingLabel: '08:00', recipeId: 'x', recipeName: 'Oats', portionGrams: 200, calories: 300, protein: 12, carbs: 40, fat: 6 },
          { mealType: 'breakfast', recipeName: 'Egg', calories: 100, protein: 8, carbs: 1, fat: 7 }
        ] }] }]
      },
      { id: 'r2', goal: 'maintenance', status: 'SUBMITTED', durationDays: 3, createdAt: '2026-10-30T00:00:00.000Z' }
    ];
    const [a, b] = mapCustomerRequests(rows, profile);
    expect(a.status).toBe('plan_ready');
    expect(a.customerName).toBe('Asha');
    expect(a.dieticianNotes).toBe('Drink water');
    expect(a.dayWisePlan).toHaveLength(1);
    const day = a.dayWisePlan![0];
    expect(day.totalCalories).toBe(400);
    expect(day.meals).toHaveLength(1); // two dishes grouped into one breakfast slot
    expect(day.meals[0].items).toHaveLength(2);
    expect(b.status).toBe('pending_review');
    expect(b.dayWisePlan).toBeUndefined();
    expect(b.allergiesExclusions).toBe('');
  });
});
