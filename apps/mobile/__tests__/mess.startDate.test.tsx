import { act, fireEvent, screen } from '@testing-library/react-native';
import { ApiError } from '../src/api/ApiError';
import { START_DATE_PASSED_COPY, startDatePassed } from '../src/mess/labels';
import { messMessage } from '../src/mess/messErrors';
import { FakeMessBackend, mountMess } from '../src/test/fakeMessBackend';

const mockOpen = jest.fn();
const mockLock = { listeners: new Set<() => void>(), settled: new Set<() => void>() };
jest.mock('../src/payments/razorpayBridge', () => ({
  isRazorpayNativeAvailable: () => true,
  isNativeCheckoutOpen: () => false,
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

beforeEach(() => {
  mockOpen.mockReset();
  mockOpen.mockResolvedValue({ kind: 'NOT_COMPLETED' });
});

describe('start-date error copy', () => {
  it('MESS_START_DATE_PASSED has its own clear message, distinct from the unavailable-start-day one', () => {
    const passed = messMessage(new ApiError('http', 409, 'MESS_START_DATE_PASSED'));
    const unavailable = messMessage(new ApiError('http', 409, 'MESS_START_DAY_UNAVAILABLE'));
    expect(passed).toBe(START_DATE_PASSED_COPY);
    expect(passed).toMatch(/start date of this subscription has passed/i);
    expect(passed).toMatch(/cancel it and buy again/i);
    expect(unavailable).toBe("Today's meals can no longer be prepared for this plan. Please choose a later start date.");
    expect(unavailable).not.toBe(passed);
  });

  it('the unmapped-code fallback and the auth/server-error rules are unchanged', () => {
    expect(messMessage(new ApiError('http', 409, 'SOMETHING_NEW'))).toBe('That conflicts with the current state. Please refresh and try again.');
    expect(messMessage(new ApiError('http', 500, 'MESS_START_DATE_PASSED'))).not.toBe(START_DATE_PASSED_COPY);
    expect(messMessage(new ApiError('http', 403, 'MESS_START_DATE_PASSED'))).not.toBe(START_DATE_PASSED_COPY);
  });

  it('the start date has passed only when it is before today in India (+05:30)', () => {
    const now = Date.parse('2026-11-05T20:00:00Z'); // 01:30 on 6 Nov in India
    expect(startDatePassed('2026-11-05', now)).toBe(true);
    expect(startDatePassed('2026-11-06', now)).toBe(false);
    expect(startDatePassed('2026-11-07', now)).toBe(false);
    const earlier = Date.parse('2026-11-05T18:00:00Z'); // 23:30 on 5 Nov in India
    expect(startDatePassed('2026-11-05', earlier)).toBe(false);
    expect(startDatePassed('2026-11-04', earlier)).toBe(true);
    expect(startDatePassed(undefined, now)).toBe(false);
    expect(startDatePassed('not a date', now)).toBe(false);
  });
});

async function open(startDate: string) {
  const b = new FakeMessBackend();
  b.addUser({ email: 'cust@b.test', fullName: 'Asha Rao' });
  const uid = b.users.get('cust@b.test')!.id;
  b.seedAccount(uid, 'APPROVED');
  const sub = b.seedSubscription(uid, 'PENDING_PAYMENT', { startDate, endDate: startDate });
  const { navigate } = await mountMess(b);
  await screen.findByText('Hostel details');
  await act(async () => {
    (navigate as (n: string, p?: object) => void)('MessSubscription', { subscriptionId: sub.id });
  });
  return { b, sub };
}

describe('unpaid subscription whose start date has passed', () => {
  it('says so clearly and leaves the payment panel and flow untouched', async () => {
    const { b } = await open('2020-01-01');
    expect(await screen.findByText(START_DATE_PASSED_COPY)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Pay Now' })).toBeTruthy(); // the shared payment panel is still the only payment UI
    expect(b.log.filter((r) => r.path.includes('payment-attempts'))).toHaveLength(0); // nothing is started by merely showing the notice
  });

  it('a payment attempt the server refuses with MESS_START_DATE_PASSED opens no checkout and takes no money', async () => {
    const { b, sub } = await open('2020-01-01');
    b.failNext(`/orders/${sub.orderId}/payment-attempts`, { status: 409, code: 'MESS_START_DATE_PASSED' });
    fireEvent.press(await screen.findByRole('button', { name: 'Pay Now' }));
    await act(async () => {});
    expect(mockOpen).not.toHaveBeenCalled();
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.getByText(START_DATE_PASSED_COPY)).toBeTruthy(); // still explained
  });

  it('a subscription that starts today or later shows no such notice', async () => {
    await open('2099-01-01');
    expect(await screen.findByRole('button', { name: 'Pay Now' })).toBeTruthy();
    expect(screen.queryByText(START_DATE_PASSED_COPY)).toBeNull();
  });
});
