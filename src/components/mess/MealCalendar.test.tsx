import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/messService', () => ({ MessService: { getMeals: vi.fn(), changeMeal: vi.fn() } }));

import { MessService } from '../../services/messService';
import { ApiRequestError } from '../../services/apiClient';
import { MealCalendar } from './MealCalendar';
import { calendar, meal } from '../../test/messFixtures';

const svc = vi.mocked(MessService);
const onSessionExpired = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
});
const renderIt = () => render(<MealCalendar subscriptionId="sub-1" onSessionExpired={onSessionExpired} />);

describe('Kerala Mess meal calendar (real data, operational only)', () => {
  it('shows date, slot, SERVICE TIME (Asia/Kolkata), status and kitchen state, and the allowance', async () => {
    svc.getMeals.mockResolvedValue(
      calendar([meal(), meal({ id: 'meal-2', slot: 'BREAKFAST', serviceAt: '2026-10-20T02:30:00.000Z', kitchenState: 'IN_PREPARATION', canPause: false, reason: 'MEAL_FROZEN' })])
    );
    renderIt();
    const lunch = await screen.findByTestId('meal-2026-10-20-LUNCH');
    expect(lunch).toHaveTextContent('Lunch · 13:00');
    expect(lunch).toHaveTextContent('Scheduled');
    const breakfast = screen.getByTestId('meal-2026-10-20-BREAKFAST');
    expect(breakfast).toHaveTextContent('Breakfast · 08:00');
    expect(breakfast).toHaveTextContent('Being prepared');
    expect(breakfast).toHaveTextContent('Preparation has started');
    expect(within(breakfast).queryByRole('button')).toBeNull();
    expect(screen.getByTestId('pause-allowance')).toHaveTextContent('Pauses used: 1 of 3');
    expect(screen.getByTestId('forfeit-note')).toHaveTextContent('not refunded, replaced or added to the end of your subscription');
    expect(screen.getByTestId('forfeit-note')).toHaveTextContent('2 hours before the service time');
  });

  it('pausing asks first, says the meal is forfeited, then sends an EMPTY pause request and re-reads the server', async () => {
    const user = userEvent.setup();
    svc.getMeals.mockResolvedValueOnce(calendar([meal()])).mockResolvedValue(calendar([meal({ status: 'PAUSED', canPause: false, canResume: true })], { pausesUsed: 2 }));
    svc.changeMeal.mockResolvedValue({ changed: true, mealId: 'meal-1', status: 'PAUSED', pausesUsed: 2, maxPauses: 3 });
    renderIt();
    await user.click(await screen.findByRole('button', { name: 'Pause…' }));
    const dialog = await screen.findByTestId('pause-dialog');
    expect(dialog).toHaveTextContent('not be prepared or delivered');
    expect(dialog).toHaveTextContent('not refunded, replaced or added to the end of your subscription');
    expect(dialog).toHaveTextContent('2 left');
    expect(svc.changeMeal).not.toHaveBeenCalled(); // nothing is sent before the confirmation
    await user.click(within(dialog).getByRole('button', { name: 'Pause this meal' }));
    await waitFor(() => expect(svc.changeMeal).toHaveBeenCalledWith('sub-1', 'meal-1', 'pause'));
    expect(svc.changeMeal).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Paused (forfeited)')).toBeInTheDocument();
    expect(screen.getByTestId('pause-allowance')).toHaveTextContent('Pauses used: 2 of 3');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('resume sends one empty request and the screen follows the server (the allowance is not given back)', async () => {
    const user = userEvent.setup();
    svc.getMeals.mockResolvedValueOnce(calendar([meal({ status: 'PAUSED', canPause: false, canResume: true })], { pausesUsed: 2 })).mockResolvedValue(calendar([meal()], { pausesUsed: 2 }));
    svc.changeMeal.mockResolvedValue({ changed: true, mealId: 'meal-1', status: 'SCHEDULED', pausesUsed: 2, maxPauses: 3 });
    renderIt();
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(svc.changeMeal).toHaveBeenCalledWith('sub-1', 'meal-1', 'resume'));
    expect(await screen.findByRole('button', { name: 'Pause…' })).toBeInTheDocument();
    expect(screen.getByTestId('pause-allowance')).toHaveTextContent('Pauses used: 2 of 3');
  });

  it('a refused pause shows fixed copy (never the server text) and the calendar is refreshed', async () => {
    const user = userEvent.setup();
    svc.getMeals.mockResolvedValue(calendar([meal()]));
    svc.changeMeal.mockRejectedValue(new ApiRequestError('SQL: mess_meals_batch_ck violated', 'MEAL_FROZEN', 409));
    renderIt();
    await user.click(await screen.findByRole('button', { name: 'Pause…' }));
    await user.click(within(await screen.findByTestId('pause-dialog')).getByRole('button', { name: 'Pause this meal' }));
    const err = await screen.findByTestId('meal-error');
    expect(err).toHaveTextContent('kitchen has already started preparing this meal');
    expect(err.textContent).not.toMatch(/SQL|mess_meals_batch_ck/);
    expect(svc.getMeals.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the lifetime limit state and offers no pause when the server says so', async () => {
    svc.getMeals.mockResolvedValue(calendar([meal({ canPause: false, reason: 'PAUSE_LIMIT_REACHED' })], { pausesUsed: 3 }));
    renderIt();
    const row = await screen.findByTestId('meal-2026-10-20-LUNCH');
    expect(row).toHaveTextContent('No pauses left');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('a subscription without generated meals says so honestly', async () => {
    svc.getMeals.mockResolvedValue(calendar([], { mealsReady: false }));
    renderIt();
    expect(await screen.findByTestId('meals-not-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('pause-allowance')).toBeNull();
  });

  it('a 401 ends the session; no wallet, credit, menu, cash or delivery wording appears anywhere', async () => {
    svc.getMeals.mockRejectedValue(new ApiRequestError('expired', 'UNAUTHORIZED', 401));
    renderIt();
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
    svc.getMeals.mockResolvedValue(calendar([meal(), meal({ id: 'm2', slot: 'BREAKFAST', status: 'PAUSED', canPause: false, canResume: true })]));
    const r2 = render(<MealCalendar subscriptionId="sub-2" />);
    await screen.findAllByTestId(/^meal-2026/);
    expect(r2.container.textContent).not.toMatch(/wallet|credit|menu|dish|cash|\bCOD\b|out for delivery|tracking/i);
  });
});
