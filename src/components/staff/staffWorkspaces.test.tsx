import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/trainerService', async (orig) => {
  const actual = await orig<typeof import('../../services/trainerService')>();
  return {
    ...actual,
    TrainerService: {
      clients: vi.fn(), plansFor: vi.fn(), createPlan: vi.fn(), updatePlan: vi.fn(), setStatus: vi.fn(), logs: vi.fn(),
      assignments: vi.fn(), assign: vi.fn(), endAssignment: vi.fn(), myPlans: vi.fn(), myLogs: vi.fn(), logProgress: vi.fn()
    }
  };
});
vi.mock('../../services/procurementService', () => ({
  ProcurementService: {
    myBranches: vi.fn(), dashboard: vi.fn(), items: vi.fn(), suppliers: vi.fn(), orders: vi.fn(),
    createItem: vi.fn(), createSupplier: vi.fn(), setSupplierActive: vi.fn(), createOrder: vi.fn(), orderAction: vi.fn(), receive: vi.fn(), stockMovement: vi.fn()
  }
}));

import { TrainerService } from '../../services/trainerService';
import { ProcurementService } from '../../services/procurementService';
import { ApiRequestError } from '../../services/apiClient';
import { TrainerWorkspace } from './TrainerWorkspace';
import { ProcurementWorkspace } from './ProcurementWorkspace';
import { CustomerWorkouts } from '../customer/CustomerWorkouts';

const T = TrainerService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const P = ProcurementService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TrainerWorkspace', () => {
  it('lists only the API-provided clients and shows their plans', async () => {
    T.clients.mockResolvedValue([{ assignmentId: 'a1', customerProfileId: 'c1', fullName: 'Asha Nair', plans: [] }]);
    T.plansFor.mockResolvedValue([]);
    render(<TrainerWorkspace />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /asha nair/i }));
    expect(await screen.findByText(/no plans yet/i)).toBeInTheDocument();
    expect(T.plansFor).toHaveBeenCalledWith('c1');
  });

  it('explains an empty client list and shows API failures', async () => {
    T.clients.mockResolvedValue([]);
    const { unmount } = render(<TrainerWorkspace />);
    expect(await screen.findByText(/no clients are assigned/i)).toBeInTheDocument();
    unmount();
    T.clients.mockRejectedValue(new ApiRequestError('Boom', 'X', 500));
    render(<TrainerWorkspace />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
  });
});

describe('ProcurementWorkspace', () => {
  it('shows low stock from the API dashboard for the staff member\'s branch', async () => {
    P.myBranches.mockResolvedValue([{ id: 'b1', code: 'TVM', name: 'Trivandrum' }]);
    P.dashboard.mockResolvedValue({ itemCount: 2, movementsLast7Days: 3, openOrders: { ORDERED: 1 }, lowStock: [{ id: 'i1', name: 'Chicken breast', unit: 'kg', quantityOnHand: 2, minReorderLevel: 10 }], expiringSoon: [] });
    render(<ProcurementWorkspace />);
    expect(await screen.findByText(/chicken breast/i)).toBeInTheDocument();
    expect(P.dashboard).toHaveBeenCalledWith('b1');
  });

  it('asks for a branch assignment when the account has none, and makes no stock request', async () => {
    P.myBranches.mockResolvedValue([]);
    render(<ProcurementWorkspace />);
    expect(await screen.findByText(/not assigned to a branch/i)).toBeInTheDocument();
    await waitFor(() => expect(P.dashboard).not.toHaveBeenCalled());
  });
});

describe('CustomerWorkouts', () => {
  it('shows the empty state when no trainer plan exists', async () => {
    T.myPlans.mockResolvedValue([]);
    render(<CustomerWorkouts />);
    expect(await screen.findByText(/no workout plan yet/i)).toBeInTheDocument();
  });

  it('lets the customer log progress on an active plan', async () => {
    T.myPlans.mockResolvedValue([{ id: 'p1', customerProfileId: 'c1', title: 'Strength', goal: 'Build', durationWeeks: 4, status: 'ACTIVE', notes: null, updatedAt: '', workoutDays: [{ id: 'd1', dayOfWeek: 'MONDAY', title: 'Push', focusArea: 'Chest', exercises: [{ id: 'e1', name: 'Bench', sets: 3, reps: '8', restSeconds: 60 }] }] }]);
    T.myLogs.mockResolvedValue([]);
    T.logProgress.mockResolvedValue({ id: 'l1' });
    render(<CustomerWorkouts />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /save/i }));
    await waitFor(() => expect(T.logProgress).toHaveBeenCalledWith('p1', { workoutDayId: undefined, completed: true, perceivedEffort: undefined, bodyWeightKg: undefined, notes: undefined }));
    expect(await screen.findByText(/progress saved/i)).toBeInTheDocument();
  });
});
