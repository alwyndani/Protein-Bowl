import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../services/deliveryCodeService', () => ({
  DeliveryCodeService: { getState: vi.fn(), issue: vi.fn(), regenerate: vi.fn() }
}));

import { DeliveryCodeService } from '../../services/deliveryCodeService';
import { ApiRequestError } from '../../services/apiClient';
import { DeliveryCodePanel } from './DeliveryCodePanel';
import type { CustomerProof } from '../../services/deliveryTypes';

const getState = vi.mocked(DeliveryCodeService.getState);
const issue = vi.mocked(DeliveryCodeService.issue);
const regenerate = vi.mocked(DeliveryCodeService.regenerate);

const proof = (state: CustomerProof['state'], over: Partial<CustomerProof> = {}): CustomerProof => ({ state, issuedAt: state === 'NOT_ISSUED' ? null : '2026-10-11T10:00:00.000Z', lockedUntil: null, ...over });
const SECRET_CODE = '482913';

beforeEach(() => {
  vi.clearAllMocks();
  getState.mockResolvedValue(proof('NOT_ISSUED'));
});
afterEach(() => vi.restoreAllMocks());

describe('customer Delivery Code panel', () => {
  it('NOT_ISSUED: explains the code and offers "Get my delivery code"; nothing is generated until the customer asks', async () => {
    render(<DeliveryCodePanel orderId="o1" />);
    expect(await screen.findByRole('button', { name: 'Get my delivery code' })).toBeInTheDocument();
    expect(screen.getByText(/never share it before your order arrives/i)).toBeInTheDocument();
    expect(issue).not.toHaveBeenCalled();
  });

  it('issue shows the code ONCE, grouped, with a spoken label, copy and hide/reveal; a double click sends ONE request', async () => {
    let finish!: () => void;
    issue.mockImplementation(() => new Promise((res) => (finish = () => res({ ...proof('ISSUED'), code: SECRET_CODE }))));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<DeliveryCodePanel orderId="o1" />);
    const get = await screen.findByTestId('delivery-code-get');
    await userEvent.dblClick(get);
    expect(issue).toHaveBeenCalledTimes(1);
    expect(get).toBeDisabled();
    getState.mockResolvedValue(proof('ISSUED'));
    await act(async () => finish());

    const value = await screen.findByTestId('delivery-code-value');
    expect(value).toHaveTextContent('482 913');
    expect(value).toHaveAttribute('aria-label', 'Your delivery code is 4 8 2 9 1 3');
    await userEvent.click(screen.getByTestId('delivery-code-copy'));
    expect(writeText).toHaveBeenCalledWith(SECRET_CODE);
    expect(screen.getByTestId('delivery-code-copied')).toHaveTextContent('Code copied.');
    expect(screen.getByTestId('delivery-code-copied')).toHaveAttribute('aria-live', 'polite');

    await userEvent.click(screen.getByTestId('delivery-code-toggle'));
    expect(screen.getByTestId('delivery-code-value')).toHaveTextContent('••• •••');
    expect(screen.getByTestId('delivery-code-value')).toHaveAttribute('aria-label', 'Your delivery code is hidden');
    expect(screen.getByTestId('delivery-code-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(document.body.textContent).not.toContain(SECRET_CODE);
    expect(screen.getByText(/shown only now/i)).toBeInTheDocument();
  });

  it('RELOAD: after a remount the customer sees ISSUED but NEVER the old digits, and is told to generate a new code if lost', async () => {
    issue.mockResolvedValue({ ...proof('ISSUED'), code: SECRET_CODE });
    const first = render(<DeliveryCodePanel orderId="o1" />);
    await userEvent.click(await screen.findByTestId('delivery-code-get'));
    await screen.findByTestId('delivery-code-value');
    first.unmount();

    getState.mockResolvedValue(proof('ISSUED'));
    render(<DeliveryCodePanel orderId="o1" />);
    expect(await screen.findByTestId('delivery-code-issued-note')).toHaveTextContent(/cannot be shown again/i);
    expect(screen.queryByTestId('delivery-code-value')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET_CODE);
    expect(screen.getByTestId('delivery-code-regenerate')).toBeInTheDocument();
  });

  it('regenerate asks for confirmation first, then shows the NEW code; keeping the current code sends nothing', async () => {
    getState.mockResolvedValue(proof('ISSUED'));
    regenerate.mockResolvedValue({ ...proof('ISSUED'), code: '135790' });
    render(<DeliveryCodePanel orderId="o1" />);
    await userEvent.click(await screen.findByTestId('delivery-code-regenerate'));
    const dialog = screen.getByRole('dialog', { name: /generate a new delivery code/i });
    expect(within(dialog).getByText(/current code will stop working immediately/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep current code' }));
    expect(regenerate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('delivery-code-regenerate'));
    await userEvent.click(within(screen.getByRole('dialog')).getByTestId('delivery-code-confirm'));
    expect(await screen.findByTestId('delivery-code-value')).toHaveTextContent('135 790');
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it('LOCKED and CODE_BLOCKED are shown as text states with the right action; VERIFIED confirms and tells the order to refresh once', async () => {
    getState.mockResolvedValue(proof('LOCKED', { lockedUntil: '2026-10-11T10:15:00.000Z' }));
    const { unmount } = render(<DeliveryCodePanel orderId="o1" />);
    expect(await screen.findByTestId('delivery-code-locked')).toHaveTextContent(/temporarily locked/i);
    expect(screen.getByTestId('delivery-code-regenerate')).toBeInTheDocument();
    unmount();

    getState.mockResolvedValue(proof('CODE_BLOCKED'));
    const blocked = render(<DeliveryCodePanel orderId="o1" />);
    const note = await screen.findByTestId('delivery-code-blocked');
    expect(note).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('button', { name: 'Generate a new code' })).toBeInTheDocument();
    blocked.unmount();

    const onVerified = vi.fn();
    getState.mockResolvedValue(proof('VERIFIED'));
    render(<DeliveryCodePanel orderId="o1" onVerified={onVerified} />);
    expect(await screen.findByTestId('delivery-code-verified')).toHaveTextContent(/delivery confirmed/i);
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('delivery-code-regenerate')).not.toBeInTheDocument();
  });

  it('NOT_AVAILABLE renders nothing', async () => {
    getState.mockResolvedValue(proof('NOT_AVAILABLE'));
    const { container } = render(<DeliveryCodePanel orderId="o1" />);
    await waitFor(() => expect(getState).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[data-testid=delivery-code-panel]')).toBeNull());
  });

  it('errors are safe mapped copy in a role=alert (never the raw backend text) and the first-load failure is explained', async () => {
    issue.mockRejectedValue(new ApiRequestError('SQL: unique violation on delivery_proofs', 'DELIVERY_CODE_ALREADY_ISSUED', 409));
    render(<DeliveryCodePanel orderId="o1" />);
    await userEvent.click(await screen.findByTestId('delivery-code-get'));
    const alert = await screen.findByTestId('delivery-code-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(/already generated a delivery code/i);
    expect(alert).not.toHaveTextContent(/SQL|unique/);
  });

  it('first-load failure shows a safe alert; polling is GET-only (the state read) and the code never touches storage or the console', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    getState.mockRejectedValueOnce(new ApiRequestError('boom <raw>', 'INTERNAL_SERVER_ERROR', 500));
    const first = render(<DeliveryCodePanel orderId="o1" />);
    expect(await screen.findByTestId('delivery-code-load-error')).not.toHaveTextContent(/raw/);
    first.unmount();

    getState.mockResolvedValue(proof('NOT_ISSUED'));
    issue.mockResolvedValue({ ...proof('ISSUED'), code: SECRET_CODE });
    render(<DeliveryCodePanel orderId="o2" />);
    await userEvent.click(await screen.findByTestId('delivery-code-get'));
    await screen.findByTestId('delivery-code-value');
    expect(regenerate).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(SECRET_CODE);
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain(SECRET_CODE);
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET_CODE);
  });

  it('static guard: the panel, its hook and service never use browser storage, logging or analytics, and the service sends empty bodies only', () => {
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const rel of ['components/customer/DeliveryCodePanel.tsx', 'hooks/useDeliveryCode.ts', 'services/deliveryCodeService.ts']) {
      const text = strip(readFileSync(join(__dirname, '..', '..', rel), 'utf8'));
      expect(text, rel).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\.|gtag|analytics|dataLayer/);
      expect(text, rel).not.toMatch(/\bcod\b|cash|payment|refund/i);
    }
    const svc = strip(readFileSync(join(__dirname, '..', '..', 'services/deliveryCodeService.ts'), 'utf8'));
    expect(svc.match(/body: JSON\.stringify\(\{\}\)/g)).toHaveLength(2);
  });
});
