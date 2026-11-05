import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../services/dietService', () => ({
  DietService: { getUnassignedQueue: vi.fn(), getClaimedQueue: vi.fn(), claimRequest: vi.fn(), getAuthorizedHealthProfile: vi.fn(), publishDietPlan: vi.fn() }
}));

vi.mock('../../services/recipeService', () => ({
  RecipeService: {
    getStaffRecipes: vi.fn().mockResolvedValue((() => {
      const items = [{ id: 'rec1', name: 'Quinoa Bowl', category: 'Salads', cuisine: 'Indian', servingGrams: 250, calories: 300, protein: 20, carbs: 30, fat: 8, image: '', isPublished: true }];
      return { items, recipes: items, total: 1, page: 1, limit: 100, totalPages: 1 };
    })())
  }
}));

import { DietService } from '../../services/dietService';
import { NutritionistWorkspace, toProfile, toUiRequest } from './NutritionistWorkspace';

const D = DietService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const apiReq = (over: Record<string, unknown> = {}) => ({
  id: 'r1', goal: 'WEIGHT_LOSS', status: 'ASSIGNED', planType: null, durationDays: 7, dietaryPreference: 'veg', cuisinePreference: null, grainPreference: null,
  spiceLevel: null, allergiesExclusions: null, customQuery: null, addonSlots: [], preferredCategories: [], calculatedPrice: null, revisionNotes: null, createdAt: '2026-10-01',
  customerProfile: { id: 'c1', fullName: 'Asha Nair', user: { email: 'a@test.com', phone: null }, healthBiometrics: { bmi: 27.1, targetCalories: 1650 } },
  ...over
});

beforeEach(() => vi.clearAllMocks());

describe('mapping', () => {
  it('maps the API request without inventing values', () => {
    const r = toUiRequest(apiReq() as never);
    expect(r).toMatchObject({ id: 'r1', customerName: 'Asha Nair', bmi: 27.1, targetCalories: 1650, status: 'under_review', customerPhone: '', allergiesExclusions: '' });
  });

  it('a profile without biometrics maps to nothing; present fields are passed through untouched', () => {
    expect(toProfile(null)).toBeUndefined();
    expect(toProfile({})).toBeUndefined();
    const p = toProfile({ healthBiometrics: { heightCm: 171, weightKg: 80, medicalConditions: ['Asthma'] } }) as unknown as Record<string, unknown>;
    expect(p.heightCm).toBe(171);
    expect(p.medicalConditions).toEqual(['Asthma']);
    expect(p.currentMedications).toBeUndefined();
  });
});

describe('NutritionistWorkspace', () => {
  it('lists unclaimed requests and claims one through the API, then reloads both queues', async () => {
    D.getUnassignedQueue.mockResolvedValueOnce([apiReq({ status: 'SUBMITTED' })]).mockResolvedValue([]);
    D.getClaimedQueue.mockResolvedValue([]);
    D.claimRequest.mockResolvedValue({ success: true });
    render(<NutritionistWorkspace onOpenMenuModal={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^claim$/i }));
    await waitFor(() => expect(D.claimRequest).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(D.getUnassignedQueue).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no unclaimed requests/i)).toBeInTheDocument();
  });

  it('tells the nutritionist honestly when another nutritionist won the claim', async () => {
    D.getUnassignedQueue.mockResolvedValue([apiReq({ status: 'SUBMITTED' })]);
    D.getClaimedQueue.mockResolvedValue([]);
    D.claimRequest.mockResolvedValue({ success: false, httpStatus: 409 });
    render(<NutritionistWorkspace onOpenMenuModal={() => {}} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /^claim$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/another nutritionist claimed/i);
  });

  it('shows "Not provided" - never invented clinical values - when the health profile has gaps', async () => {
    D.getUnassignedQueue.mockResolvedValue([]);
    D.getClaimedQueue.mockResolvedValue([apiReq()]);
    D.getAuthorizedHealthProfile.mockResolvedValue({ healthBiometrics: { heightCm: 171, weightKg: 80, medicalConditions: [] } });
    render(<NutritionistWorkspace onOpenMenuModal={() => {}} />);
    expect(await screen.findByText('171 cm')).toBeInTheDocument();
    expect(D.getAuthorizedHealthProfile).toHaveBeenCalledWith('r1');
    const text = document.body.textContent ?? '';
    for (const invented of ['Metformin', 'Insulin Resistance', 'Omega-3', 'Multivitamin']) expect(text).not.toContain(invented);
    expect(text).toContain('None reported');
    expect(text).toContain('No blood test results were provided');
  });

  it('a new plan starts EMPTY (no canned menu) and cannot be sent until every day has dishes', async () => {
    D.getUnassignedQueue.mockResolvedValue([]);
    D.getClaimedQueue.mockResolvedValue([apiReq()]);
    D.getAuthorizedHealthProfile.mockResolvedValue({ healthBiometrics: { heightCm: 171, weightKg: 80 } });
    render(<NutritionistWorkspace onOpenMenuModal={() => {}} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /finalize & send plan to client/i }));
    expect(await screen.findByText(/add at least one dish to every day/i)).toBeInTheDocument();
    expect(D.publishDietPlan).not.toHaveBeenCalled();
  });

  const noCalcReq = () => apiReq({ customerProfile: { id: 'c1', fullName: 'Asha Nair', user: { email: 'a@test.com', phone: null }, healthBiometrics: { bmi: 27.1 } } });
  const fillOneDishEverywhere = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click((await screen.findAllByRole('button', { name: /add menu dish/i }))[0]);
    await user.click((await screen.findAllByRole('button', { name: /\+ add dish/i }))[0]);
    await user.click(screen.getByRole('button', { name: /copy monday to all/i }));
  };

  it('when the client\'s calories could not be calculated, the target is NEVER defaulted: the nutritionist must type one, and exactly that value is sent', async () => {
    D.getUnassignedQueue.mockResolvedValue([]);
    D.getClaimedQueue.mockResolvedValue([noCalcReq()]);
    D.getAuthorizedHealthProfile.mockResolvedValue({ healthBiometrics: { heightCm: 171, weightKg: 80, calculation: { available: false, missing: ['dateOfBirth', 'gender'] } } });
    D.publishDietPlan.mockResolvedValue({ success: false, message: 'stop here' });
    render(<NutritionistWorkspace onOpenMenuModal={() => {}} />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText(/calorie target \(kcal per day\)/i)).toBeInTheDocument();
    expect(document.body.textContent).toContain('Not calculated');
    expect(await screen.findByText(/missing: dateOfBirth, gender/)).toBeInTheDocument(); // from the audited health-profile read
    await fillOneDishEverywhere(user);
    // no target typed: refused, nothing sent (the plan's own dish calories are NOT used as the target)
    await user.click(await screen.findByRole('button', { name: /finalize & send plan to client/i }));
    expect(await screen.findByText(/could not be calculated.*Enter the daily calorie target/i)).toBeInTheDocument();
    expect(D.publishDietPlan).not.toHaveBeenCalled();
    // an implausible target is refused too
    await user.type(screen.getByLabelText(/calorie target \(kcal per day\)/i), '100');
    await user.click(screen.getByRole('button', { name: /finalize & send plan to client/i }));
    expect(D.publishDietPlan).not.toHaveBeenCalled();
    // an explicit target is sent verbatim
    await user.clear(screen.getByLabelText(/calorie target \(kcal per day\)/i));
    await user.type(screen.getByLabelText(/calorie target \(kcal per day\)/i), '1800');
    await user.click(screen.getByRole('button', { name: /finalize & send plan to client/i }));
    await waitFor(() => expect(D.publishDietPlan).toHaveBeenCalledTimes(1));
    expect(D.publishDietPlan.mock.calls[0][0]).toMatchObject({ requestId: 'r1', targetCalories: 1800 });
  }, 20000); // several UI steps (typing, dish picker): slow under a fully parallel run

  it('when the target WAS calculated no manual field is shown and the calculated target is what is sent', async () => {
    D.getUnassignedQueue.mockResolvedValue([]);
    D.getClaimedQueue.mockResolvedValue([apiReq()]); // targetCalories 1650 from the server's verified calculation
    D.getAuthorizedHealthProfile.mockResolvedValue({ healthBiometrics: { heightCm: 171, weightKg: 80 } });
    D.publishDietPlan.mockResolvedValue({ success: false, message: 'stop here' });
    render(<NutritionistWorkspace onOpenMenuModal={() => {}} />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /finalize & send plan to client/i });
    expect(screen.queryByLabelText(/calorie target \(kcal per day\)/i)).not.toBeInTheDocument();
    await fillOneDishEverywhere(user);
    await user.click(screen.getByRole('button', { name: /finalize & send plan to client/i }));
    await waitFor(() => expect(D.publishDietPlan).toHaveBeenCalled());
    expect(D.publishDietPlan.mock.calls[0][0]).toMatchObject({ targetCalories: 1650 });
  });

  it('a failed publish shows the error and does not report the plan as sent', async () => {
    D.getUnassignedQueue.mockResolvedValue([]);
    D.getClaimedQueue.mockResolvedValue([apiReq()]);
    D.getAuthorizedHealthProfile.mockResolvedValue({ healthBiometrics: { heightCm: 171, weightKg: 80 } });
    D.publishDietPlan.mockResolvedValue({ success: false, message: 'Validation failed' });
    render(<NutritionistWorkspace onOpenMenuModal={() => {}} />);
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: /add menu dish/i }))[0]);
    await user.click((await screen.findAllByRole('button', { name: /\+ add dish/i }))[0]);
    await user.click(screen.getByRole('button', { name: /copy monday to all/i }));
    await user.click(await screen.findByRole('button', { name: /finalize & send plan to client/i }));
    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(D.publishDietPlan).toHaveBeenCalledTimes(1);
    expect(D.getClaimedQueue).toHaveBeenCalledTimes(1); // no "success" reload
  });
});
