import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// File name kept from the removed diet-plan checkout so its history stays traceable; it now guards the replacement behaviour.
vi.mock('../../services/dietService', () => ({ DietService: { approvePlan: vi.fn(), requestRevision: vi.fn(), submitRequest: vi.fn() } }));

import { DietService } from '../../services/dietService';
import { CustomerPlanReview } from './CustomerPlanReview';
import { BLANK_CUSTOMER_PROFILE } from '../../data/blankProfile';
import type { DietPlanRequest } from '../../types';

const D = DietService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const request = { id: 'r1', status: 'plan_ready', goal: 'maintenance', dayWisePlan: [], customerName: 'A' } as unknown as DietPlanRequest;
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

beforeEach(() => vi.clearAllMocks());

describe('diet plan approval (there is no diet-plan checkout or payment)', () => {
  const props = { profile: BLANK_CUSTOMER_PROFILE, onRequestRevision: vi.fn(), onRejectPlan: vi.fn(), onOpenMenuModal: vi.fn() };

  it('continues only after the SERVER accepted the approval', async () => {
    D.approvePlan.mockResolvedValue({ success: true });
    const onApproved = vi.fn();
    render(<CustomerPlanReview request={request} onApproved={onApproved} {...props} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /approve & confirm diet plan/i }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith(request));
    expect(D.approvePlan).toHaveBeenCalledWith('r1', 'Approved by customer');
  });

  it('a failed approval shows an error and never reports success', async () => {
    D.approvePlan.mockResolvedValue({ success: false, message: 'nope' });
    const onApproved = vi.fn();
    render(<CustomerPlanReview request={request} onApproved={onApproved} {...props} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /approve & confirm diet plan/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not confirm your approval/i);
    expect(onApproved).not.toHaveBeenCalled();
  });

  it('an approved plan says nothing was charged and cannot be approved twice', () => {
    render(<CustomerPlanReview request={{ ...request, status: 'approved' }} onApproved={vi.fn()} {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent(/nothing was charged/i);
    expect(screen.getByRole('button', { name: /approve & confirm diet plan/i })).toBeDisabled();
  });
});

describe('the misleading pricing and checkout code is gone', () => {
  it('DietPlanBuilder shows and sends no client-calculated price and no longer fakes a saved request', () => {
    const s = read('src/components/customer/DietPlanBuilder.tsx');
    expect(s).not.toMatch(/costEngine|calculateMDCostEngine|calculatedPrice|totalPayable|recipeDatabase|req-\$\{Date\.now/);
    expect(s).toMatch(/RecipeService\.getCategories/);
  });

  it('the legacy checkout and cost calculator are deleted or empty stubs, and nothing imports them', () => {
    for (const f of ['src/components/customer/CheckoutModal.tsx', 'src/components/common/IngredientPriceCalculator.tsx']) {
      if (!fs.existsSync(path.join(process.cwd(), f))) continue; // deleted
      expect(read(f), f).not.toMatch(/useState|React\.FC|import /);
    }
    for (const f of ['src/App.tsx', 'src/components/common/MenuCardModal.tsx']) {
      expect(read(f), f).not.toMatch(/IngredientPriceCalculator|from '\.\/components\/customer\/CheckoutModal'/);
    }
  });
});
