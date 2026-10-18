import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentEvidenceProvider, PaymentEvidenceStore } from '../src/payments/paymentEvidenceStore';

const mockRequest = jest.fn();
const mockOpen = jest.fn();
// a STABLE manager, like the real AuthProvider's: a new object per render would (correctly) recreate the controller
const mockManager = { api: { request: (...a: unknown[]) => mockRequest(...a) } };
jest.mock('../src/auth/AuthProvider', () => ({ useAuth: () => ({ manager: mockManager }) }));
const mockLock = { open: false, listeners: new Set<() => void>(), settled: new Set<() => void>() };
jest.mock('../src/payments/razorpayBridge', () => ({
  isRazorpayNativeAvailable: () => true,
  isNativeCheckoutOpen: () => mockLock.open,
  onNativeCheckoutSettled: (l: () => void) => {
    mockLock.settled.add(l);
    return () => mockLock.settled.delete(l);
  },
  onNativeCheckoutStateChange: (l: () => void) => {
    mockLock.listeners.add(l);
    return () => mockLock.listeners.delete(l);
  },
  openCheckout: (...a: unknown[]) => mockOpen(...a)
}));

import { usePaymentFlow } from '../src/commerce/usePaymentFlow';

const ORDER = { id: 'ord-1', orderNumber: 'PB-261017-ABC123', status: 'PENDING', paymentStatus: 'PENDING', payment: { state: 'AWAITING_PAYMENT', canStartPayment: true } };
const SESSION = { attemptId: 'att-1', provider: 'razorpay', keyId: 'public_key_id_1', providerOrderId: 'order_ABC123', amountMinor: 33900, currency: 'INR', orderNumber: 'PB-261017-ABC123', expiresAt: 'x', status: 'PENDING' };

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = new PaymentEvidenceStore();
  const W = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <PaymentEvidenceProvider store={store}>{children}</PaymentEvidenceProvider>
    </QueryClientProvider>
  );
  return { W, qc, store };
}

beforeEach(() => {
  mockLock.open = false;
  mockRequest.mockReset();
  mockOpen.mockReset();
  mockRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
    if (path === '/orders/ord-1' && !opts?.method) return ORDER;
    if (path === '/orders/my-orders') return [ORDER];
    if (path === '/orders/ord-1/payment-attempts' && opts?.method === 'POST') return SESSION;
    throw new Error('unexpected ' + path);
  });
});

describe('usePaymentFlow (React wiring)', () => {
  it('mounting reads the order but starts NO payment: only GETs, no POST, no checkout', async () => {
    const { W } = wrapper();
    const { result } = renderHook(() => usePaymentFlow('ord-1'), { wrapper: W });
    await waitFor(() => expect(result.current.presentation.kind).toBe('READY_TO_PAY'));
    expect(mockRequest.mock.calls.every(([, o]) => !o || !o.method || o.method === 'GET')).toBe(true);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('an explicit startPayment creates ONE attempt, opens the checkout, and a not-completed result leaves the BACKEND to decide', async () => {
    const { W } = wrapper();
    mockOpen.mockResolvedValue({ kind: 'NOT_COMPLETED' });
    const { result } = renderHook(() => usePaymentFlow('ord-1'), { wrapper: W });
    await waitFor(() => expect(result.current.presentation.kind).toBe('READY_TO_PAY'));
    await act(async () => {
      await result.current.startPayment();
    });
    const posts = mockRequest.mock.calls.filter(([, o]) => o?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('/orders/ord-1/payment-attempts');
    expect(mockOpen).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.presentation.kind).toBe('PAYMENT_NOT_COMPLETED'));
    expect(result.current.presentation.message).toBe('Payment not completed');
  });

  it('unmount disposes the flow (no further requests)', async () => {
    const { W } = wrapper();
    const { result, unmount } = renderHook(() => usePaymentFlow('ord-1'), { wrapper: W });
    await waitFor(() => expect(result.current.presentation.kind).toBe('READY_TO_PAY'));
    const calls = mockRequest.mock.calls.length;
    unmount();
    await act(async () => {
      await result.current.checkPaymentStatus();
    });
    expect(mockRequest.mock.calls.length).toBe(calls);
  });
});

describe('screen recreation and double taps through the real controller', () => {
  const CONFIRMING = { ...ORDER, payment: { state: 'CONFIRMING', canStartPayment: false } };
  const EVIDENCE = { providerOrderId: 'order_ABC123', providerPaymentId: 'pay_ABC123', signature: 'a'.repeat(64) };

  it('same-process return: stored evidence lets the panel offer Retry verification for that order (no create, no checkout)', async () => {
    const { W, store } = wrapper();
    store.setEvidence('ord-1', 'att-1', EVIDENCE);
    mockRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/orders/ord-1' && !opts?.method) return CONFIRMING;
      if (path === '/orders/my-orders') return [CONFIRMING];
      throw new Error('unexpected ' + path);
    });
    const { result } = renderHook(() => usePaymentFlow('ord-1'), { wrapper: W });
    await waitFor(() => expect(result.current.presentation.kind).toBe('CHECKING_PAYMENT'));
    expect(result.current.presentation.canRetryVerification).toBe(true);
    expect(result.current.presentation.canStartPayment).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockRequest.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
  });

  it('restart-style (no evidence): backend recovery only, no retry-verification, no automatic checkout', async () => {
    const { W } = wrapper();
    mockRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/orders/ord-1' && !opts?.method) return CONFIRMING;
      if (path === '/orders/my-orders') return [CONFIRMING];
      throw new Error('unexpected ' + path);
    });
    const { result } = renderHook(() => usePaymentFlow('ord-1'), { wrapper: W });
    await waitFor(() => expect(result.current.presentation.kind).toBe('CHECKING_PAYMENT'));
    expect(result.current.presentation.canRetryVerification).toBe(false);
    expect(result.current.presentation.canCheckStatus).toBe(true);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('another order never sees this order\'s evidence', async () => {
    const { W, store } = wrapper();
    store.setEvidence('ord-OTHER', 'att-9', EVIDENCE);
    mockRequest.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/orders/ord-1' && !opts?.method) return CONFIRMING;
      if (path === '/orders/my-orders') return [CONFIRMING];
      throw new Error('unexpected ' + path);
    });
    const { result } = renderHook(() => usePaymentFlow('ord-1'), { wrapper: W });
    await waitFor(() => expect(result.current.presentation.kind).toBe('CHECKING_PAYMENT'));
    expect(result.current.presentation.canRetryVerification).toBe(false);
  });

  it('two rapid startPayment calls create ONE attempt and open ONE checkout', async () => {
    const { W } = wrapper();
    let finish!: (v: unknown) => void;
    mockOpen.mockImplementation(() => new Promise((r) => (finish = r)));
    const { result } = renderHook(() => usePaymentFlow('ord-1'), { wrapper: W });
    await waitFor(() => expect(result.current.presentation.kind).toBe('READY_TO_PAY'));
    await act(async () => {
      void result.current.startPayment();
      void result.current.startPayment();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockRequest.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(1);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(result.current.presentation.kind).toBe('CHECKOUT_OPEN');
    await act(async () => {
      finish({ kind: 'NOT_COMPLETED' });
      await new Promise((r) => setTimeout(r, 20));
    });
  });
});

describe('live native lock and build capability reach the panel', () => {
  it('a checkout opened elsewhere in the process removes Pay Now immediately; no create, no checkout', async () => {
    const { W } = wrapper();
    const { result } = renderHook(() => usePaymentFlow('ord-1'), { wrapper: W });
    await waitFor(() => expect(result.current.presentation.kind).toBe('READY_TO_PAY'));
    await act(async () => {
      mockLock.open = true; // another screen's checkout took the lock
      mockLock.listeners.forEach((l) => l());
    });
    expect(result.current.presentation).toMatchObject({ kind: 'CHECKING_PAYMENT', canStartPayment: false });
    expect(result.current.presentation.message).toMatch(/payment window may still be open/i);
    await act(async () => {
      await result.current.startPayment();
    });
    expect(mockRequest.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
    await act(async () => {
      mockLock.open = false; // the native promise finally settled
      mockLock.listeners.forEach((l) => l());
      [...mockLock.settled].forEach((l) => l());
    });
    await waitFor(() => expect(result.current.presentation.kind).toBe('READY_TO_PAY'));
  });
});
