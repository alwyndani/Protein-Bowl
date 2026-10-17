import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentEvidenceProvider, PaymentEvidenceStore } from '../src/payments/paymentEvidenceStore';

const mockRequest = jest.fn();
const mockOpen = jest.fn();
// a STABLE manager, like the real AuthProvider's: a new object per render would (correctly) recreate the controller
const mockManager = { api: { request: (...a: unknown[]) => mockRequest(...a) } };
jest.mock('../src/auth/AuthProvider', () => ({ useAuth: () => ({ manager: mockManager }) }));
jest.mock('../src/payments/razorpayBridge', () => ({
  isRazorpayNativeAvailable: () => true,
  isNativeCheckoutOpen: () => false,
  onNativeCheckoutSettled: () => () => {},
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
