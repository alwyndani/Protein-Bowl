import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/kitchenService', () => ({
  KitchenService: { getQueue: vi.fn(), act: vi.fn(), listRouting: vi.fn(), assignBranch: vi.fn() }
}));

import { KitchenService } from '../../../services/kitchenService';
import { ApiRequestError } from '../../../services/apiClient';
import { KitchenQueue } from './KitchenQueue';
import { KB_A, KB_B, kitchenOrder, kitchenQueue } from '../../../test/kitchenFixtures';

const getQueue = vi.mocked(KitchenService.getQueue);
const actApi = vi.mocked(KitchenService.act);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});
afterEach(() => vi.useRealTimers());

const card = (orderNumber: string) => screen.getByRole('article', { name: `Order ${orderNumber}` });

describe('Kitchen queue UI', () => {
  it('shows a loading state, then the four sections with only the NEXT valid action on each card', async () => {
    const c = kitchenOrder({ status: 'CONFIRMED' });
    const a = kitchenOrder({ status: 'ACCEPTED', acceptedAt: '2026-10-11T09:05:00.000Z' });
    const p = kitchenOrder({ status: 'PREPARING', preparingAt: '2026-10-11T09:06:00.000Z' });
    const r = kitchenOrder({ status: 'READY', readyAt: '2026-10-11T09:08:00.000Z' });
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [c], ACCEPTED: [a], PREPARING: [p], READY: [r] }));
    render(<KitchenQueue />);
    expect(screen.getByTestId('kitchen-loading')).toBeInTheDocument();
    await screen.findByTestId('kitchen-section-READY');

    expect(within(card(c.orderNumber)).getByRole('button', { name: `Accept order ${c.orderNumber}` })).toBeInTheDocument();
    expect(within(card(a.orderNumber)).getByRole('button', { name: `Start preparing ${a.orderNumber}` })).toBeInTheDocument();
    expect(within(card(p.orderNumber)).getByRole('button', { name: `Mark ready ${p.orderNumber}` })).toBeInTheDocument();
    // READY: no P8 action at all
    expect(within(card(r.orderNumber)).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card(r.orderNumber)).getByText(/dispatch\) is handled separately/i)).toBeInTheDocument();
    // statuses are text, not colour alone
    expect(within(card(c.orderNumber)).getByText('New')).toBeInTheDocument();
    expect(within(card(a.orderNumber)).getByText('Accepted')).toBeInTheDocument();
    for (const status of ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY']) expect(screen.getByTestId(`kitchen-section-${status}`)).toHaveAccessibleName();
  });

  it('shows the items to prepare with the approved recipe hints', async () => {
    const o = kitchenOrder();
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [o] }));
    render(<KitchenQueue />);
    const c = await screen.findByRole('article', { name: `Order ${o.orderNumber}` });
    expect(within(c).getByText(/2 × Berry & Banana Classic/)).toBeInTheDocument();
    expect(within(c).getByText(/Prep 10 min · Cook 5 min · veg/)).toBeInTheDocument();
    expect(within(c).getByText(/Chef note: Chill before serving/)).toBeInTheDocument();
  });

  it('empty state when there is nothing to do', async () => {
    getQueue.mockResolvedValue(kitchenQueue());
    render(<KitchenQueue />);
    expect(await screen.findByTestId('kitchen-empty')).toHaveTextContent(/no orders are waiting/i);
    expect(screen.getByText('No new orders.')).toBeInTheDocument();
  });

  it('initial load failure: a safe error with Try again (no raw backend text)', async () => {
    getQueue.mockRejectedValueOnce(new ApiRequestError('SELECT * FROM orders failed <stack>', 'INTERNAL_SERVER_ERROR', 500));
    render(<KitchenQueue />);
    const alert = await screen.findByTestId('kitchen-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).not.toHaveTextContent(/SELECT|stack/);
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [kitchenOrder()] }));
    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }));
    await screen.findByTestId('kitchen-section-CONFIRMED');
  });

  it('a later failure keeps the queue and shows a stale-data warning (role=alert)', async () => {
    const o = kitchenOrder();
    getQueue.mockResolvedValueOnce(kitchenQueue({ CONFIRMED: [o] }));
    render(<KitchenQueue />);
    await screen.findByRole('article', { name: `Order ${o.orderNumber}` });
    getQueue.mockRejectedValue(new ApiRequestError('down', 'NETWORK_ERROR'));
    await userEvent.click(screen.getByTestId('kitchen-refresh'));
    const stale = await screen.findByTestId('kitchen-stale');
    expect(stale).toHaveAttribute('role', 'alert');
    expect(stale).toHaveTextContent(/may be out of date/i);
    expect(screen.getByRole('article', { name: `Order ${o.orderNumber}` })).toBeInTheDocument(); // the queue is still there
  });

  it('Accept sends exactly one action for a double click, shows progress, and the card moves on the refresh', async () => {
    const o = kitchenOrder();
    getQueue.mockResolvedValueOnce(kitchenQueue({ CONFIRMED: [o] }));
    let finish!: () => void;
    actApi.mockImplementation(() => new Promise((res) => (finish = () => res({ changed: true, order: { ...o, status: 'ACCEPTED' } }))));
    render(<KitchenQueue />);
    const button = await screen.findByRole('button', { name: `Accept order ${o.orderNumber}` });
    await userEvent.dblClick(button);
    expect(actApi).toHaveBeenCalledTimes(1);
    expect(actApi).toHaveBeenCalledWith(o.id, 'accept');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    getQueue.mockResolvedValue(kitchenQueue({ ACCEPTED: [{ ...o, status: 'ACCEPTED' }] }));
    await act(async () => finish());
    const accepted = await screen.findByRole('button', { name: `Start preparing ${o.orderNumber}` });
    expect(accepted).toBeEnabled();
    expect(within(screen.getByTestId('kitchen-section-CONFIRMED')).queryByRole('article')).not.toBeInTheDocument();
  });

  it('start preparing and mark ready call the matching kitchen actions', async () => {
    const a = kitchenOrder({ status: 'ACCEPTED' });
    const p = kitchenOrder({ status: 'PREPARING' });
    getQueue.mockResolvedValue(kitchenQueue({ ACCEPTED: [a], PREPARING: [p] }));
    actApi.mockResolvedValue({ changed: true, order: a });
    render(<KitchenQueue />);
    await userEvent.click(await screen.findByRole('button', { name: `Start preparing ${a.orderNumber}` }));
    await userEvent.click(screen.getByRole('button', { name: `Mark ready ${p.orderNumber}` }));
    expect(actApi.mock.calls).toEqual([[a.id, 'start-preparing'], [p.id, 'mark-ready']]);
  });

  it('a stale card (409 because the order was cancelled or moved) shows safe copy on that card and the queue refreshes; the error can be dismissed', async () => {
    const o = kitchenOrder();
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [o] }));
    actApi.mockRejectedValue(new ApiRequestError('An order that is CANCELLED cannot become ACCEPTED', 'INVALID_ORDER_TRANSITION', 409));
    render(<KitchenQueue />);
    await userEvent.click(await screen.findByRole('button', { name: `Accept order ${o.orderNumber}` }));
    const alert = await within(card(o.orderNumber)).findByRole('alert');
    expect(alert).toHaveTextContent(/already moved on/i);
    expect(alert).not.toHaveTextContent(/CANCELLED cannot become/);
    await userEvent.click(within(alert).getByRole('button', { name: /dismiss/i }));
    expect(within(card(o.orderNumber)).queryByRole('alert')).not.toBeInTheDocument();
    expect(getQueue.mock.calls.length).toBeGreaterThan(1); // refreshed after the conflict
  });

  it('found in the browser E2E: when the stale card vanishes with the refresh, the explanation stays visible as a queue-level alert', async () => {
    const o = kitchenOrder();
    getQueue.mockResolvedValueOnce(kitchenQueue({ CONFIRMED: [o] }));
    actApi.mockRejectedValue(new ApiRequestError('An order that is CANCELLED cannot become ACCEPTED', 'INVALID_ORDER_TRANSITION', 409));
    getQueue.mockResolvedValue(kitchenQueue()); // the refresh after the conflict: the cancelled order is gone
    render(<KitchenQueue />);
    await userEvent.click(await screen.findByRole('button', { name: `Accept order ${o.orderNumber}` }));
    const alert = await screen.findByTestId('kitchen-orphan-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(o.orderNumber);
    expect(alert).toHaveTextContent(/already moved on/i);
    expect(alert).not.toHaveTextContent(/CANCELLED cannot become/);
    expect(screen.queryByRole('article', { name: `Order ${o.orderNumber}` })).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByTestId('kitchen-orphan-error')).not.toBeInTheDocument();
  });

  it('a concurrent no-op (another chef accepted first) explains itself with a status notice', async () => {
    const o = kitchenOrder();
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [o] }));
    actApi.mockResolvedValue({ changed: false, order: { ...o, status: 'ACCEPTED' } });
    render(<KitchenQueue />);
    await userEvent.click(await screen.findByRole('button', { name: `Accept order ${o.orderNumber}` }));
    expect(await screen.findByTestId('kitchen-notice')).toHaveTextContent(/already in that step/i);
  });

  it('mapped copy for 403 / 404 / 429 / 5xx / network and no raw text', async () => {
    const o = kitchenOrder();
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [o] }));
    render(<KitchenQueue />);
    const button = await screen.findByRole('button', { name: `Accept order ${o.orderNumber}` });
    const cases: Array<[ApiRequestError, RegExp]> = [
      [new ApiRequestError('FORBIDDEN raw', 'FORBIDDEN', 403), /not allowed/i],
      [new ApiRequestError('Order not found raw', 'ORDER_NOT_FOUND', 404), /no longer available/i],
      [new ApiRequestError('slow down raw', 'TOO_MANY_REQUESTS', 429), /too many requests/i],
      [new ApiRequestError('stack trace raw', 'INTERNAL_SERVER_ERROR', 500), /server could not complete/i],
      [new ApiRequestError('fetch failed raw', 'NETWORK_ERROR'), /could not reach the server/i]
    ];
    for (const [err, copy] of cases) {
      actApi.mockRejectedValueOnce(err);
      await userEvent.click(button);
      const alert = await within(card(o.orderNumber)).findByRole('alert');
      expect(alert).toHaveTextContent(copy);
      expect(alert).not.toHaveTextContent(/raw/);
      await userEvent.click(within(alert).getByRole('button', { name: /dismiss/i }));
    }
  });

  it('an expired session during an action is reported to the host (sign-in flow)', async () => {
    const o = kitchenOrder();
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [o] }));
    actApi.mockRejectedValue(new ApiRequestError('jwt expired', 'INVALID_TOKEN', 401));
    const onSessionExpired = vi.fn();
    render(<KitchenQueue onSessionExpired={onSessionExpired} />);
    await userEvent.click(await screen.findByRole('button', { name: `Accept order ${o.orderNumber}` }));
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(await within(card(o.orderNumber)).findByRole('alert')).toHaveTextContent(/session has expired/i);
  });

  it('truncated sections say how many are shown of the total', async () => {
    const items = Array.from({ length: 3 }, () => kitchenOrder({ status: 'READY' }));
    getQueue.mockResolvedValue(kitchenQueue({ READY: items }, {}));
    const q = kitchenQueue({ READY: items });
    q.sections.READY = { total: 130, truncated: true, items };
    getQueue.mockResolvedValue(q);
    render(<KitchenQueue />);
    expect(await screen.findByTestId('kitchen-truncated-READY')).toHaveTextContent('Showing the latest 3 of 130');
  });

  it('the branch selector exists only for multi-branch chefs, offers only the SERVER-reported branches, and requests the chosen branch', async () => {
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [kitchenOrder()] }));
    const { unmount } = render(<KitchenQueue />);
    await screen.findByTestId('kitchen-section-CONFIRMED');
    expect(screen.queryByLabelText('Branch')).not.toBeInTheDocument(); // single branch: no selector
    unmount();

    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [kitchenOrder()] }, { branches: [KB_A, KB_B] }));
    render(<KitchenQueue />);
    const select = await screen.findByLabelText('Branch');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['All my branches', KB_A.name, KB_B.name]);
    await userEvent.selectOptions(select, KB_B.id);
    await waitFor(() => expect(getQueue).toHaveBeenLastCalledWith(KB_B.id));
  });

  it('new orders are announced politely to assistive technology (live region)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getQueue.mockResolvedValueOnce(kitchenQueue({ CONFIRMED: [kitchenOrder()] }));
    render(<KitchenQueue />);
    await screen.findByTestId('kitchen-section-CONFIRMED');
    expect(screen.getByTestId('kitchen-announcement')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('kitchen-announcement')).toHaveTextContent('');
    const fresh = kitchenOrder();
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [kitchenOrder(), fresh] }));
    await userEvent.click(screen.getByTestId('kitchen-refresh'));
    await waitFor(() => expect(screen.getByTestId('kitchen-announcement')).toHaveTextContent(/new order/i));
  });

  it('contains no payment, refund, COD, price, contact or address controls or text', async () => {
    getQueue.mockResolvedValue(kitchenQueue({ CONFIRMED: [kitchenOrder()], ACCEPTED: [kitchenOrder({ status: 'ACCEPTED' })], PREPARING: [kitchenOrder({ status: 'PREPARING' })], READY: [kitchenOrder({ status: 'READY' })] }));
    const { container } = render(<KitchenQueue />);
    await screen.findByTestId('kitchen-section-READY');
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/refund|cash|\bCOD\b|pay on delivery|payment|₹|rupee|price|total|phone|email|address|customer|health/i);
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
    expect(buttons.join(' ')).not.toMatch(/refund|cancel|pay|dispatch|deliver|reject|route/i);
  });
});
