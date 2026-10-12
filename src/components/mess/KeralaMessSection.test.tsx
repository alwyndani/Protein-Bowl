import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/messService', () => ({
  MessService: { getAccount: vi.fn(), getSubscriptions: vi.fn(), getServicePoints: vi.fn(), getPlans: vi.fn(), saveAccount: vi.fn(), purchase: vi.fn(), cancel: vi.fn(), getSubscription: vi.fn() }
}));
vi.mock('../../services/orderService', () => ({ OrderService: { getOrder: vi.fn() } }));
// The shared payment panel is covered by its own suite; here we only prove it is mounted for the purchase ORDER and nothing else pays.
vi.mock('../customer/PaymentPanel', () => ({
  PaymentPanel: ({ order }: { order: { id: string } }) => <div data-testid="payment-panel-stub" data-order-id={order.id} />
}));

import { MessService } from '../../services/messService';
import { OrderService } from '../../services/orderService';
import { ApiRequestError } from '../../services/apiClient';
import { KeralaMessSection } from './KeralaMessSection';
import { SP_A, SP_B, account, publicPlan, subscription } from '../../test/messFixtures';
import { order } from '../../test/fixtures';

const mess = vi.mocked(MessService);
const orders = vi.mocked(OrderService);
const onSessionExpired = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mess.getAccount.mockResolvedValue(null);
  mess.getSubscriptions.mockResolvedValue([]);
  mess.getServicePoints.mockResolvedValue([SP_A, SP_B]);
  mess.getPlans.mockResolvedValue([]);
  orders.getOrder.mockResolvedValue(order({ id: 'order-mess-1' }));
});

const renderIt = () => render(<KeralaMessSection onSessionExpired={onSessionExpired} />);

describe('Kerala Mess customer screen (real backend data, no mock behaviour)', () => {
  it('shows onboarding for a customer without an account and submits ONLY service point, room and student id', async () => {
    const user = userEvent.setup();
    mess.saveAccount.mockResolvedValue(account({ approvalStatus: 'PENDING' }));
    renderIt();
    const form = await screen.findByTestId('mess-account-form');
    await user.selectOptions(within(form).getByLabelText('Hostel / service point'), SP_A.id);
    await user.type(within(form).getByLabelText('Room number'), '204');
    await user.type(within(form).getByLabelText('Student ID (optional)'), 'STU-9');
    await user.click(within(form).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(mess.saveAccount).toHaveBeenCalledTimes(1));
    expect(mess.saveAccount).toHaveBeenCalledWith({ servicePointId: SP_A.id, roomNumber: '204', studentIdCard: 'STU-9' });
  });

  it('a PENDING account shows the waiting state and offers no plans or purchase', async () => {
    mess.getAccount.mockResolvedValue(account({ approvalStatus: 'PENDING' }));
    renderIt();
    expect(await screen.findByTestId('mess-pending')).toHaveTextContent('Waiting for approval');
    expect(mess.getPlans).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose a plan')).toBeNull();
  });

  it('a REJECTED account shows a fixed explanation (never the reviewer note) and allows resubmission', async () => {
    mess.getAccount.mockResolvedValue(account({ approvalStatus: 'REJECTED', rejectionReasonCode: 'INCOMPLETE_DETAILS' }));
    renderIt();
    expect(await screen.findByTestId('mess-rejected')).toHaveTextContent('Some of your details were incomplete.');
    expect(screen.getByRole('button', { name: 'Submit again for approval' })).toBeInTheDocument();
  });

  it('an APPROVED account lists the SERVER-priced plans exactly as computed (no client arithmetic)', async () => {
    mess.getAccount.mockResolvedValue(account());
    mess.getPlans.mockResolvedValue([publicPlan()]);
    renderIt();
    const plan = await screen.findByTestId('mess-plan-MONTHLY-LB');
    expect(within(plan).getByTestId('mess-plan-total')).toHaveTextContent('₹350');
    expect(plan).toHaveTextContent('₹333.33 + ₹16.67 tax');
    expect(plan).toHaveTextContent('30 days');
    expect(plan).toHaveTextContent('Breakfast + Lunch');
    expect(plan).toHaveTextContent('60 meals');
    expect(mess.getPlans).toHaveBeenCalledWith(SP_A.id);
  });

  it('shows an honest empty state when no plan is on sale', async () => {
    mess.getAccount.mockResolvedValue(account());
    renderIt();
    expect(await screen.findByTestId('mess-no-plans')).toBeInTheDocument();
  });

  it('purchase sends only {planId, startDate} + an idempotency key; a retry of the SAME selection reuses the key, a different date uses a new one', async () => {
    const user = userEvent.setup();
    mess.getAccount.mockResolvedValue(account());
    mess.getPlans.mockResolvedValue([publicPlan()]);
    mess.purchase.mockRejectedValueOnce(new ApiRequestError('boom', 'INTERNAL_ERROR', 500)).mockResolvedValue({ subscription: subscription(), replay: false });
    renderIt();
    const plan = await screen.findByTestId('mess-plan-MONTHLY-LB');
    const date = within(plan).getByLabelText('Start date');
    await user.type(date, '2026-10-20');
    await user.click(within(plan).getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() => expect(mess.purchase).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('mess-error')).toBeInTheDocument();
    await user.click(within(plan).getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() => expect(mess.purchase).toHaveBeenCalledTimes(2));
    const [first, second] = mess.purchase.mock.calls;
    expect(first[0]).toEqual({ planId: 'plan-1', startDate: '2026-10-20' });
    expect(second[1]).toBe(first[1]); // same request => same key (a retry can never double-buy)
    expect(String(first[1]).length).toBeGreaterThanOrEqual(8);
    await user.clear(date);
    await user.type(date, '2026-10-25');
    mess.purchase.mockResolvedValue({ subscription: subscription(), replay: false });
    await user.click(within(plan).getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() => expect(mess.purchase).toHaveBeenCalledTimes(3));
    expect(mess.purchase.mock.calls[2][1]).not.toBe(first[1]);
  });

  it('an unpaid purchase mounts the shared PaymentPanel for the purchase ORDER and hides the plan list', async () => {
    mess.getAccount.mockResolvedValue(account());
    mess.getPlans.mockResolvedValue([publicPlan()]);
    mess.getSubscriptions.mockResolvedValue([subscription()]);
    renderIt();
    const stub = await screen.findByTestId('payment-panel-stub');
    expect(stub).toHaveAttribute('data-order-id', 'order-mess-1');
    expect(orders.getOrder).toHaveBeenCalledWith('order-mess-1');
    expect(screen.queryByTestId('mess-plan-MONTHLY-LB')).toBeNull();
    expect(screen.getByTestId('mess-sub-status')).toHaveTextContent('Awaiting payment');
  });

  it('an ACTIVE subscription is shown from the server state only; no meal, pause, tracking, gate-pass or wallet UI exists', async () => {
    mess.getAccount.mockResolvedValue(account());
    mess.getPlans.mockResolvedValue([publicPlan()]);
    mess.getSubscriptions.mockResolvedValue([subscription({ status: 'ACTIVE', payment: { state: 'PAID', canStartPayment: false }, activatedAt: '2026-10-13T00:00:00.000Z', cancellation: { allowed: false } })]);
    renderIt();
    expect(await screen.findByTestId('mess-sub-active-note')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-panel-stub')).toBeNull();
    const text = document.body.textContent ?? '';
    for (const forbidden of [/wallet/i, /gate\s*pass/i, /pause/i, /tracking/i, /QR/, /handover/i, /refund of ₹/i, /today'?s meal/i]) expect(text).not.toMatch(forbidden);
    expect(screen.getByTestId('mess-checkpoint-note')).toHaveTextContent('Meal scheduling, pausing and daily delivery are not available yet');
    expect(screen.queryByTestId('mess-cancel-open')).toBeNull();
  });

  it('refund state follows the server wording only', async () => {
    mess.getAccount.mockResolvedValue(account());
    mess.getSubscriptions.mockResolvedValue([subscription({ status: 'CANCELLED', refund: { state: 'REFUND_PROCESSING' }, cancellation: { allowed: false } })]);
    renderIt();
    expect(await screen.findByTestId('mess-refund')).toHaveTextContent('Your refund is being processed.');
  });

  it('cancellation: needs a reason, sends {reasonCode, note?} only, and explains the full refund for a paid subscription', async () => {
    const user = userEvent.setup();
    mess.getAccount.mockResolvedValue(account());
    mess.getSubscriptions.mockResolvedValue([subscription({ status: 'ACTIVE', payment: { state: 'PAID', canStartPayment: false }, cancellation: { allowed: true } })]);
    mess.cancel.mockResolvedValue({ subscriptionId: 'sub-1', status: 'CANCELLED', alreadyCancelled: false, refund: { state: 'REFUND_PENDING' }, payment: null });
    renderIt();
    await user.click(await screen.findByTestId('mess-cancel-open'));
    const dialog = await screen.findByTestId('mess-cancel-dialog');
    expect(dialog).toHaveTextContent('full payment will be refunded');
    const submit = within(dialog).getAllByRole('button', { name: 'Cancel subscription' }).pop()!;
    expect(submit).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Why are you cancelling?'), 'WRONG_PLAN');
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'picked wrong');
    await user.click(submit);
    await waitFor(() => expect(mess.cancel).toHaveBeenCalledTimes(1));
    expect(mess.cancel).toHaveBeenCalledWith('sub-1', 'WRONG_PLAN', 'picked wrong');
  });

  it('an unpaid purchase can be cancelled and the dialog says no payment was taken', async () => {
    const user = userEvent.setup();
    mess.getAccount.mockResolvedValue(account());
    mess.getSubscriptions.mockResolvedValue([subscription()]);
    renderIt();
    await user.click(await screen.findByTestId('mess-cancel-open'));
    expect(await screen.findByTestId('mess-cancel-dialog')).toHaveTextContent('No payment has been taken');
  });

  it('maps backend error codes to fixed copy: never the raw server message', async () => {
    const user = userEvent.setup();
    mess.getAccount.mockResolvedValue(account());
    mess.getPlans.mockResolvedValue([publicPlan()]);
    mess.purchase.mockRejectedValue(new ApiRequestError('SQL constraint mess_subs_status_ck violated at 10.0.0.5', 'OPEN_PURCHASE_EXISTS', 409));
    renderIt();
    const plan = await screen.findByTestId('mess-plan-MONTHLY-LB');
    await user.type(within(plan).getByLabelText('Start date'), '2026-10-20');
    await user.click(within(plan).getByRole('button', { name: 'Continue to payment' }));
    const err = await screen.findByTestId('mess-error');
    expect(err).toHaveTextContent('You already have an unpaid Kerala Mess purchase');
    expect(err.textContent).not.toMatch(/SQL|constraint|10\.0\.0\.5/);
  });

  it('a legacy MESS_CUSTOMER session gets the explicit conversion message and no forms', async () => {
    mess.getAccount.mockRejectedValue(new ApiRequestError('legacy', 'MESS_CUSTOMER_LEGACY_ROLE', 403));
    mess.getSubscriptions.mockRejectedValue(new ApiRequestError('legacy', 'MESS_CUSTOMER_LEGACY_ROLE', 403));
    renderIt();
    expect(await screen.findByTestId('mess-error')).toHaveTextContent('legacy Kerala Mess role');
    expect(screen.queryByTestId('mess-account-form')).toBeNull();
    expect(screen.queryByTestId('mess-plan-MONTHLY-LB')).toBeNull();
  });

  it('a 401 ends the session through the app callback', async () => {
    mess.getAccount.mockRejectedValue(new ApiRequestError('expired', 'UNAUTHORIZED', 401));
    mess.getSubscriptions.mockRejectedValue(new ApiRequestError('expired', 'UNAUTHORIZED', 401));
    renderIt();
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });
});
