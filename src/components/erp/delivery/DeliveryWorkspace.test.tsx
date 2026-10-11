import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/deliveryService', () => ({
  DeliveryService: { getQueue: vi.fn(), act: vi.fn(), reportFailure: vi.fn(), getMonitor: vi.fn(), listDrivers: vi.fn(), assign: vi.fn() }
}));

import { DeliveryService } from '../../../services/deliveryService';
import { ApiRequestError } from '../../../services/apiClient';
import { DeliveryWorkspace } from './DeliveryWorkspace';
import { DB_A, DB_B, areaOrder, driverQueue, outOrder, ownedOrder } from '../../../test/deliveryFixtures';

const getQueue = vi.mocked(DeliveryService.getQueue);
const act = vi.mocked(DeliveryService.act);
const report = vi.mocked(DeliveryService.reportFailure);

const section = (name: 'available' | 'mine' | 'out') => screen.getByTestId(`delivery-section-${name}`);

beforeEach(() => {
  vi.clearAllMocks();
  getQueue.mockResolvedValue(driverQueue());
});

describe('DELIVERY workspace: sections, claim, dispatch', () => {
  it('shows loading, then the three sections; before a claim only the AREA and bag items are shown (no customer contact data)', async () => {
    let resolve!: (q: ReturnType<typeof driverQueue>) => void;
    getQueue.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<DeliveryWorkspace />);
    expect(screen.getByTestId('delivery-loading')).toBeInTheDocument();
    resolve(driverQueue({ available: [areaOrder({ orderNumber: 'PB-AVAIL-1' })] }));
    const card = await within(await screen.findByTestId('delivery-section-available')).findByTestId('delivery-card');
    expect(card).toHaveTextContent('PB-AVAIL-1');
    expect(card).toHaveTextContent('Area: Kochi 682001');
    expect(card).toHaveTextContent('2 × Sweet Potato Chicken Bowl');
    expect(card).toHaveTextContent('Customer details are shown after you claim this order.');
    expect(card.querySelector('a[href^="tel:"]')).toBeNull();
    for (const name of ['Available for pickup', 'My orders, ready to collect', 'Out for delivery']) expect(screen.getByRole('region', { name: new RegExp(name) })).toBeInTheDocument();
  });

  it('claiming sends ONE claim for that order, refreshes, and the order then appears under "My orders" WITH the approved delivery details', async () => {
    const order = areaOrder({ orderNumber: 'PB-CLAIM-1' });
    getQueue.mockResolvedValue(driverQueue({ available: [order] }));
    act.mockResolvedValue({ changed: true, order: ownedOrder({ id: order.id }) });
    render(<DeliveryWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: 'Claim PB-CLAIM-1' }));
    expect(act).toHaveBeenCalledTimes(1);
    expect(act).toHaveBeenCalledWith(order.id, 'claim');

    getQueue.mockResolvedValue(driverQueue({ mine: [ownedOrder({ id: order.id, orderNumber: 'PB-CLAIM-1' })] }));
    await userEvent.click(screen.getByTestId('delivery-refresh'));
    const mine = await within(section('mine')).findByTestId('delivery-card');
    const details = within(mine).getByTestId('delivery-details');
    expect(details).toHaveTextContent('Asha');
    expect(details).toHaveTextContent('12 Marine Drive');
    expect(details).toHaveTextContent('Flat 4B');
    expect(details).toHaveTextContent('Delivery instructions: Leave with the security guard');
    expect(within(details).getByRole('link', { name: '+91 98765 43210' })).toHaveAttribute('href', 'tel:+919876543210');
    expect(within(section('available')).queryByTestId('delivery-card')).not.toBeInTheDocument();
  });

  it('a double click on Claim sends a single request and the button is busy meanwhile', async () => {
    const order = areaOrder();
    getQueue.mockResolvedValue(driverQueue({ available: [order] }));
    let finish!: () => void;
    act.mockImplementation(() => new Promise((res) => (finish = () => res({ changed: true, order: ownedOrder({ id: order.id }) }))));
    render(<DeliveryWorkspace />);
    const button = await screen.findByTestId('delivery-claim');
    await userEvent.dblClick(button);
    expect(act).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    finish();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('"Collected, start delivery" dispatches the owner\'s READY order (one request, empty-body action)', async () => {
    const order = ownedOrder({ orderNumber: 'PB-DISP-1' });
    getQueue.mockResolvedValue(driverQueue({ mine: [order] }));
    act.mockResolvedValue({ changed: true, order: outOrder({ id: order.id }) });
    render(<DeliveryWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start delivery PB-DISP-1' }));
    expect(act).toHaveBeenCalledWith(order.id, 'dispatch');
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('out for delivery: details stay visible and the only action is "Report an issue" - there is NO mark-delivered, payment, cash or tracking control anywhere', async () => {
    getQueue.mockResolvedValue(driverQueue({ available: [areaOrder()], mine: [ownedOrder()], out: [outOrder({ orderNumber: 'PB-OUT-1' })] }));
    render(<DeliveryWorkspace />);
    const out = await within(await screen.findByTestId('delivery-section-out')).findByTestId('delivery-card');
    expect(out).toHaveTextContent('Out for delivery');
    expect(out).toHaveTextContent('12 Marine Drive');
    expect(within(out).getByRole('button', { name: 'Report an issue with PB-OUT-1' })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/mark(ed)? (as )?delivered|\bdelivered\b|proof of delivery|\botp\b|\bpin\b|signature|photo/i);
    expect(text).not.toMatch(/\bcod\b|cash|collect payment|pay on delivery|payment|refund|₹|rupee|price|amount|paid/i);
    const names = screen.getAllByRole('button').map((b) => b.textContent?.toLowerCase() ?? '');
    expect(names.some((n) => /deliver(ed)?$/.test(n.trim()) && !/start delivery|collected/.test(n))).toBe(false);
  });
});

describe('report an issue', () => {
  it('opens an accessible dialog, requires a reason, then sends ONLY the structured reason and note; the card then says the issue awaits review', async () => {
    const order = outOrder({ orderNumber: 'PB-FAIL-1' });
    getQueue.mockResolvedValue(driverQueue({ out: [order] }));
    report.mockResolvedValue({ changed: true, order: { ...order, assignment: { ...order.assignment, state: 'FAILED', issueReported: true } } });
    render(<DeliveryWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: 'Report an issue with PB-FAIL-1' }));

    const dialog = screen.getByRole('dialog', { name: /report an issue with PB-FAIL-1/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/does not cancel the order/i)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['CUSTOMER_UNAVAILABLE', 'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'DELIVERY_REFUSED', 'OTHER']);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Report issue' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose what happened.');
    expect(report).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Wrong or incomplete address' }));
    await userEvent.type(within(dialog).getByLabelText(/note \(optional\)/i), 'No such house number');
    getQueue.mockResolvedValue(driverQueue({ out: [{ ...order, assignment: { ...order.assignment, state: 'FAILED', issueReported: true } }] }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Report issue' }));

    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(report).toHaveBeenCalledWith(order.id, { reasonCode: 'WRONG_ADDRESS', note: 'No such house number' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByTestId('delivery-issue-reported')).toHaveTextContent('Issue reported, awaiting review');
    expect(screen.queryByRole('button', { name: /report an issue with/i })).not.toBeInTheDocument();
  });

  it('Escape closes the dialog without sending anything and focus returns to the trigger; a server error stays inside the dialog as safe copy', async () => {
    const order = outOrder({ orderNumber: 'PB-FAIL-2' });
    getQueue.mockResolvedValue(driverQueue({ out: [order] }));
    render(<DeliveryWorkspace />);
    const trigger = await screen.findByRole('button', { name: 'Report an issue with PB-FAIL-2' });
    trigger.focus();
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());

    report.mockRejectedValueOnce(new ApiRequestError('SQL: constraint violated', 'ORDER_NOT_DISPATCHED', 409));
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Other' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Report issue' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/only be reported once the order is out for delivery/i);
    expect(alert).not.toHaveTextContent(/SQL|constraint/);
  });
});

describe('errors, staleness, branches and accessibility', () => {
  it('a stale claim (another driver won) shows safe copy on the card and refreshes; the raw message is never rendered', async () => {
    const order = areaOrder({ orderNumber: 'PB-STALE-1' });
    getQueue.mockResolvedValue(driverQueue({ available: [order] }));
    act.mockRejectedValue(new ApiRequestError('claimed by 22222222-2222', 'ALREADY_CLAIMED', 409));
    render(<DeliveryWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: 'Claim PB-STALE-1' }));
    const alert = await within(await screen.findByTestId('delivery-card')).findByRole('alert');
    expect(alert).toHaveTextContent('Another driver has already claimed this order');
    expect(alert).not.toHaveTextContent('22222222');
    await waitFor(() => expect(getQueue.mock.calls.length).toBeGreaterThan(1));
  });

  it('an error for an order that already left the list is shown at the top level instead of vanishing with its card', async () => {
    const order = areaOrder({ orderNumber: 'PB-GONE-1' });
    getQueue.mockResolvedValue(driverQueue({ available: [order] }));
    act.mockImplementation(async () => {
      getQueue.mockResolvedValue(driverQueue()); // the next refresh no longer contains it
      throw new ApiRequestError('Order not found', 'ORDER_NOT_FOUND', 404);
    });
    render(<DeliveryWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: 'Claim PB-GONE-1' }));
    const orphan = await screen.findByTestId('delivery-orphan-error');
    expect(orphan).toHaveTextContent('PB-GONE-1');
    expect(orphan).toHaveTextContent(/no longer available/i);
  });

  it('a failed refresh keeps the list on screen with a stale warning (role=alert); the first-load failure shows an error with Try again', async () => {
    getQueue.mockResolvedValueOnce(driverQueue({ available: [areaOrder({ orderNumber: 'PB-KEEP-1' })] }));
    render(<DeliveryWorkspace />);
    await screen.findByText('PB-KEEP-1');
    getQueue.mockRejectedValue(new ApiRequestError('boom', 'INTERNAL_SERVER_ERROR', 500));
    await userEvent.click(screen.getByTestId('delivery-refresh'));
    const stale = await screen.findByTestId('delivery-stale');
    expect(stale).toHaveAttribute('role', 'alert');
    expect(stale).toHaveTextContent(/may be out of date/i);
    expect(screen.getByText('PB-KEEP-1')).toBeInTheDocument();
  });

  it('first-load error offers Try again; a dead session is reported once and offers no retry; empty state is explicit', async () => {
    getQueue.mockRejectedValueOnce(new ApiRequestError('x', 'NETWORK_ERROR'));
    const { unmount } = render(<DeliveryWorkspace />);
    expect(await screen.findByTestId('delivery-error')).toHaveTextContent(/could not reach the server/i);
    getQueue.mockResolvedValue(driverQueue());
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('delivery-empty')).toHaveTextContent(/no deliveries are waiting/i);
    unmount();

    const onSessionExpired = vi.fn();
    getQueue.mockRejectedValue(new ApiRequestError('expired', 'INVALID_TOKEN', 401));
    render(<DeliveryWorkspace onSessionExpired={onSessionExpired} />);
    expect(await screen.findByTestId('delivery-error')).toHaveTextContent(/session has expired/i);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('a driver of ONE branch gets no selector; a multi-branch driver gets a selector built ONLY from the server-authorized branches, and choosing one requests that branch', async () => {
    getQueue.mockResolvedValue(driverQueue({ available: [areaOrder()] }));
    const { unmount } = render(<DeliveryWorkspace />);
    await screen.findByTestId('delivery-card');
    expect(screen.queryByLabelText('Branch')).not.toBeInTheDocument();
    unmount();

    getQueue.mockResolvedValue(driverQueue({ available: [areaOrder()] }, { branches: [DB_A, DB_B], selectedBranchIds: [DB_A.id, DB_B.id] }));
    render(<DeliveryWorkspace />);
    const select = await screen.findByLabelText('Branch');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['All my branches', 'Kochi Central', 'Kozhikode Hub']);
    // multi-branch cards name their branch
    expect(screen.getByTestId('delivery-card')).toHaveTextContent('Branch: Kochi Central');
    await userEvent.selectOptions(select, DB_B.id);
    await waitFor(() => expect(getQueue).toHaveBeenLastCalledWith(DB_B.id));
  });

  it('a branch the server refuses (403) shows safe copy, not the backend text', async () => {
    getQueue.mockRejectedValue(new ApiRequestError('You do not have access to the requested branch', 'BRANCH_FORBIDDEN', 403));
    render(<DeliveryWorkspace />);
    expect(await screen.findByTestId('delivery-error')).toHaveTextContent('You do not have access to that branch.');
  });

  it('accessibility and layout: named regions and buttons, visible focus rings, 44px touch targets, status as text, a polite live region announcing new orders, and a responsive single-column-first grid', async () => {
    const first = areaOrder({ orderNumber: 'PB-A11Y-1' });
    getQueue.mockResolvedValueOnce(driverQueue({ available: [first] }));
    render(<DeliveryWorkspace />);
    const claim = await screen.findByRole('button', { name: 'Claim PB-A11Y-1' });
    expect(claim.className).toMatch(/min-h-11/);
    expect(claim.className).toMatch(/focus-visible:ring/);
    expect(screen.getByTestId('delivery-refresh').className).toMatch(/min-h-11/);
    expect(screen.getByTestId('delivery-card')).toHaveTextContent('Ready'); // status is text, not colour
    expect(screen.getByRole('region', { name: 'Delivery queue' })).toBeInTheDocument();
    const grid = screen.getByTestId('delivery-section-available').parentElement!;
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(grid.className).toMatch(/lg:grid-cols-3/);

    const live = screen.getByTestId('delivery-announcement');
    expect(live).toHaveAttribute('aria-live', 'polite');
    getQueue.mockResolvedValue(driverQueue({ available: [first, areaOrder({ orderNumber: 'PB-A11Y-2' })] }));
    await userEvent.click(screen.getByTestId('delivery-refresh'));
    await waitFor(() => expect(live).toHaveTextContent('1 new order is available for pickup.'));
  });
});
