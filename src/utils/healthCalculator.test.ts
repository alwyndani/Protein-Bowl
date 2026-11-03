import { describe, expect, it } from 'vitest';
import { calculateHealthMetrics, NOT_CALCULATED } from './healthCalculator';
import { pruneUnentered } from './healthProfile';

const base = { gender: 'female' as const, activityLevel: 'moderate' as const, goal: 'maintenance' };

describe('healthCalculator never assumes a person', () => {
  it('returns "not calculated" (all zeros) when weight, height or age is missing', () => {
    expect(calculateHealthMetrics({ ...base, weightKg: 0, heightCm: 170, age: 30 })).toEqual(NOT_CALCULATED);
    expect(calculateHealthMetrics({ ...base, weightKg: 70, heightCm: 0, age: 30 })).toEqual(NOT_CALCULATED);
    expect(calculateHealthMetrics({ ...base, weightKg: 70, heightCm: 170, age: 0 })).toEqual(NOT_CALCULATED);
  });

  it('calculates from real inputs', () => {
    const m = calculateHealthMetrics({ ...base, weightKg: 70, heightCm: 170, age: 30 });
    expect(m.bmi).toBeGreaterThan(0);
    expect(m.tdee).toBeGreaterThan(m.bmr);
  });
});

describe('pruneUnentered', () => {
  it('drops values the customer left empty and keeps real ones', () => {
    const out = pruneUnentered({
      heightCm: 170, weightKg: 70, gender: undefined, occupation: '', sleepDuration: 0, stressLevel: 0, mealsPerDay: 0,
      circumferences: { waistCm: 0, hipCm: 90 }, limbCircumferences: { leftArmCm: 0 }, mealTimings: {}, bloodTestResults: { hbA1c: 5.4, tsh: 0 },
      allergies: [], hasExercise: false
    } as never) as Record<string, unknown>;
    expect(out).toEqual({
      heightCm: 170, weightKg: 70, circumferences: { hipCm: 90 }, bloodTestResults: { hbA1c: 5.4 }, allergies: [], hasExercise: false
    });
  });
});
