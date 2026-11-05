import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
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

const EMAIL = 'cust@b.test';
const DATE_LABEL = 'Start date (YYYY-MM-DD)';

async function launch(configure?: (b: FakeMessBackend, uid: string) => void) {
  const b = new FakeMessBackend();
  b.addUser({ email: EMAIL, fullName: 'Asha Rao' });
  const uid = b.users.get(EMAIL)!.id;
  configure?.(b, uid);
  const view = await mountMess(b);
  await screen.findByText('Hostel details');
  return { b, uid, ...view };
}
const go = async (nav: (n: any, p?: object) => void, name: string, params?: object) => {
  await act(async () => {
    nav(name, params);
  });
};
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const pressAsync = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
const posts = (b: FakeMessBackend, path: string) => b.log.filter((r) => r.path === path && r.method === 'POST');

beforeEach(() => {
  mockOpen.mockReset();
  mockOpen.mockResolvedValue({ kind: 'EVIDENCE', evidence: { providerPaymentId: 'pay_ABC1', providerOrderId: 'order_MESS1', signature: 'a'.repeat(64) } });
});

describe('Mess account (hostel details)', () => {
  it('home shows the add-details prompt when there is no account, and the form submits ONLY the three allowed fields', async () => {
    const { b } = await launch();
    expect(await screen.findByText('Tell us where you stay to subscribe to a Kerala Mess plan.')).toBeTruthy();
    await pressAsync('Add hostel details');
    fireEvent.press(await screen.findByRole('radio', { name: 'Hostel A Gate, Kochi' }));
    fireEvent.changeText(screen.getByLabelText('Room number'), '  B-204 ');
    press('Submit hostel details');
    expect(await screen.findByText('Your hostel details were saved.')).toBeTruthy();
    expect(screen.getByText('Waiting for approval')).toBeTruthy(); // the server's status, not an assumption
    const put = b.log.find((r) => r.path === '/mess/account' && r.method === 'PUT')!;
    expect(put.body).toEqual({ servicePointId: 'sp-1', roomNumber: 'B-204' });
  });

  it('validates locally before any request: no service point and no room', async () => {
    const { b } = await launch();
    await pressAsync('Add hostel details');
    await pressAsync('Submit hostel details');
    expect(await screen.findByText('Choose your hostel service point.')).toBeTruthy();
    expect(screen.getByText('Enter your room number.')).toBeTruthy();
    expect(b.log.some((r) => r.path === '/mess/account' && r.method === 'PUT')).toBe(false);
  });

  it('shows a rejected account with customer copy (never the raw code) and a blocked change (409) with mapped copy', async () => {
    const { b } = await launch((x, uid) => x.seedAccount(uid, 'REJECTED'));
    expect(await screen.findByText('Not approved')).toBeTruthy();
    expect(screen.getByText(/Some of your details were incomplete/)).toBeTruthy();
    expect(screen.queryByText(/INCOMPLETE_DETAILS/)).toBeNull();
    await pressAsync('Update hostel details');
    await screen.findByLabelText('Room number');
    fireEvent.changeText(screen.getByLabelText('Room number'), 'C-101');
    b.failNext('/mess/account', { status: 409, code: 'ACCOUNT_CHANGE_BLOCKED' });
    // the PUT hits the fault first (GET already happened)
    press('Save hostel details');
    expect(await screen.findByText(/open subscription, so your hostel details cannot be changed/)).toBeTruthy();
  });
});

describe('Plans', () => {
  it('lists the plans with the SERVER price and the service points; subscribe is disabled until the account is approved', async () => {
    const { b, uid, navigate } = await launch((x, u) => x.seedAccount(u, 'PENDING'));
    await go(navigate, 'MessPlans');
    expect(await screen.findByText('Lunch 30 days')).toBeTruthy();
    expect(screen.getByText('₹3,150.00')).toBeTruthy();
    expect(screen.getByText('₹150.00')).toBeTruthy();
    expect(screen.getByText('Hostel B Gate')).toBeTruthy();
    expect(screen.getByText(/once your hostel details are approved/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subscribe to Lunch 30 days' }).props.accessibilityState.disabled).toBe(true);
    // the plan list is filtered by the customer's own service point, chosen by the server-reported account
    expect(b.log.some((r) => r.path === '/mess/plans?servicePointId=sp-1')).toBe(true);
    b.approveAccount(uid);
  });

  it('empty plan list shows the empty state', async () => {
    const { navigate } = await launch((x, u) => {
      x.seedAccount(u, 'APPROVED');
      x.plans = [];
    });
    await go(navigate, 'MessPlans');
    expect(await screen.findByText('No plans on sale')).toBeTruthy();
  });

  it('a 503 on the plan list shows safe copy with a retry', async () => {
    const { b, navigate } = await launch((x, u) => x.seedAccount(u, 'APPROVED'));
    b.failNext('/mess/plans?servicePointId=sp-1', 503);
    await go(navigate, 'MessPlans');
    expect(await screen.findByText('Our service is having trouble right now. Please try again shortly.')).toBeTruthy();
    press('Try again');
    expect(await screen.findByText('Lunch 30 days')).toBeTruthy();
  });
});

describe('Purchase and ONLINE payment', () => {
  it('buys a plan (only planId + startDate + idempotency key sent), pays through the existing payment panel, and the subscription becomes active', async () => {
    const { b, navigate } = await launch((x, u) => x.seedAccount(u, 'APPROVED'));
    await go(navigate, 'MessPlans');
    await pressAsync('Subscribe to Lunch 30 days');
    await screen.findByLabelText(DATE_LABEL);
    fireEvent.changeText(screen.getByLabelText(DATE_LABEL), '2026-12-01');
    press('Continue to payment');

    // lands on the subscription: unpaid, with the payment panel
    expect((await screen.findAllByText('Payment required')).length).toBeGreaterThan(0);
    const post = posts(b, '/mess/subscriptions')[0];
    expect(post.body).toEqual({ planId: 'plan-1', startDate: '2026-12-01' });
    expect(post.headers['x-idempotency-key']).toMatch(/^IK-[0-9a-f-]{36}$/);
    expect(JSON.stringify(post.body)).not.toMatch(/payment|method|price|status|COD|cash/i);

    await pressAsync('Pay Now');
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1));
    // the checkout options come from the backend payment session, not from the screen
    expect(mockOpen.mock.calls[0][0]).toMatchObject({ order_id: 'order_MESS1', amount: 315000, currency: 'INR' });
    expect(posts(b, '/orders/ord-m1/payment-attempts').length).toBe(1);
    expect(posts(b, '/orders/ord-m1/payment-attempts/att-1/verify')[0].body).toEqual({ providerOrderId: 'order_MESS1', providerPaymentId: 'pay_ABC1', signature: 'a'.repeat(64) });

    // verified by the server => subscription re-read => ACTIVE with the calendar available
    expect(await screen.findByText('Active')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Meal calendar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull();
  });

  it('a payment that is NOT completed leaves the subscription unpaid (the server decides, nothing is assumed)', async () => {
    mockOpen.mockResolvedValue({ kind: 'NOT_COMPLETED' });
    const { b, uid, navigate } = await launch((x, u) => x.seedAccount(u, 'APPROVED'));
    const sub = b.seedSubscription(uid, 'PENDING_PAYMENT');
    await go(navigate, 'MessSubscription', { subscriptionId: sub.id });
    await pressAsync('Pay Now');
    expect(await screen.findByText('Payment not completed')).toBeTruthy();
    expect(screen.getAllByText('Payment required').length).toBeGreaterThan(0);
    expect(screen.queryByText('Active')).toBeNull();
  });

  it('start-date validation is local; the server too-early rejection is mapped and the key is not reused for the next try', async () => {
    const { b, navigate } = await launch((x, u) => {
      x.seedAccount(u, 'APPROVED');
      x.earliestStart = '2026-12-10';
    });
    await go(navigate, 'MessSubscribe', { planId: 'plan-1' });
    await screen.findByLabelText(DATE_LABEL);
    fireEvent.changeText(screen.getByLabelText(DATE_LABEL), '12/01/2026');
    press('Continue to payment');
    expect(await screen.findByText(/Enter the start date as YYYY-MM-DD/)).toBeTruthy();
    expect(posts(b, '/mess/subscriptions').length).toBe(0);

    fireEvent.changeText(screen.getByLabelText(DATE_LABEL), '2026-12-01');
    press('Continue to payment');
    expect(await screen.findByText('That start date is too soon for this plan. Please choose a later date.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(DATE_LABEL), '2026-12-15');
    press('Continue to payment');
    await screen.findAllByText('Payment required');
    const keys = posts(b, '/mess/subscriptions').map((p) => p.headers['x-idempotency-key']);
    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('a LOST purchase answer freezes the attempt: the retry re-sends the SAME key and body and creates ONE subscription', async () => {
    const { b, uid, navigate } = await launch((x, u) => x.seedAccount(u, 'APPROVED'));
    await go(navigate, 'MessSubscribe', { planId: 'plan-1' });
    await screen.findByLabelText(DATE_LABEL);
    fireEvent.changeText(screen.getByLabelText(DATE_LABEL), '2026-12-01');
    b.loseNextPurchaseResponse = true;
    press('Continue to payment');
    expect(await screen.findByText(/could not confirm whether your purchase was created/)).toBeTruthy();
    expect(screen.getByLabelText(DATE_LABEL).props.editable).toBe(false);
    expect(b.subs.filter((s) => s.ownerId === uid).length).toBe(1); // the server did create it
    press('Retry the same purchase');
    await screen.findAllByText('Payment required');
    const sent = posts(b, '/mess/subscriptions');
    expect(sent.length).toBe(2);
    expect(sent[1].headers['x-idempotency-key']).toBe(sent[0].headers['x-idempotency-key']);
    expect(sent[1].body).toEqual(sent[0].body);
    expect(b.subs.filter((s) => s.ownerId === uid).length).toBe(1);
  });

  it('server refusals are mapped: account not approved (409) and an open unpaid purchase (409)', async () => {
    const { b, uid, navigate } = await launch((x, u) => x.seedAccount(u, 'APPROVED'));
    b.seedSubscription(uid, 'PENDING_PAYMENT');
    await go(navigate, 'MessSubscribe', { planId: 'plan-1' });
    await screen.findByLabelText(DATE_LABEL);
    fireEvent.changeText(screen.getByLabelText(DATE_LABEL), '2026-12-01');
    press('Continue to payment');
    expect(await screen.findByText('You already have an unpaid Kerala Mess purchase. Pay for it or cancel it first.')).toBeTruthy();
    expect(screen.queryByText(/OPEN_PURCHASE_EXISTS/)).toBeNull();
    expect(screen.getByRole('button', { name: 'My subscriptions' })).toBeTruthy();
  });

  it('unapproved account cannot press the purchase button', async () => {
    const { b, navigate } = await launch((x, u) => x.seedAccount(u, 'PENDING'));
    await go(navigate, 'MessSubscribe', { planId: 'plan-1' });
    await screen.findByLabelText(DATE_LABEL);
    expect(screen.getByRole('button', { name: 'Continue to payment' }).props.accessibilityState.disabled).toBe(true);
    expect(posts(b, '/mess/subscriptions').length).toBe(0);
  });
});

describe('My subscriptions and detail', () => {
  it('shows the empty state when there are no subscriptions', async () => {
    const { navigate } = await launch();
    await go(navigate, 'MessSubscriptions');
    expect(await screen.findByText('No subscriptions yet')).toBeTruthy();
  });

  it('lists subscriptions and opens the detail with the server figures', async () => {
    const { b, uid, navigate } = await launch((x, u) => x.seedAccount(u, 'APPROVED'));
    const sub = b.seedSubscription(uid, 'ACTIVE');
    await go(navigate, 'MessSubscriptions');
    fireEvent.press(await screen.findByRole('button', { name: /Lunch 30 days, Active/ }));
    expect(await screen.findByText('Meal slots')).toBeTruthy();
    expect(screen.getByText('1 Dec 2026')).toBeTruthy();
    expect(screen.getAllByText('₹3,150.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(sub.id).toBeTruthy();
  });

  it('a subscription that is not found, and a 403, show safe copy', async () => {
    const { b, navigate } = await launch();
    await go(navigate, 'MessSubscription', { subscriptionId: 'nope' });
    expect(await screen.findByText('We could not find this subscription.')).toBeTruthy();
    b.failNext('/mess/subscriptions', { status: 403, code: 'FORBIDDEN' });
    await go(navigate, 'MessSubscriptions');
    expect(await screen.findByText('This is not available for your account.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('401 on the first request refreshes the session once and succeeds; a dead session shows the shared copy', async () => {
    const { b, navigate } = await launch();
    const before = b.count('/auth/mobile/refresh');
    b.expireAccessTokens();
    await go(navigate, 'MessSubscriptions');
    expect(await screen.findByText('No subscriptions yet')).toBeTruthy();
    expect(b.count('/auth/mobile/refresh') - before).toBe(1);
  });

  it('network failure offers a manual retry that works', async () => {
    const { b, navigate } = await launch();
    b.failNext('/mess/subscriptions', 'network');
    await go(navigate, 'MessSubscriptions');
    expect(await screen.findByText('You appear to be offline. Please check your connection and try again.')).toBeTruthy();
    press('Try again');
    expect(await screen.findByText('No subscriptions yet')).toBeTruthy();
  });
});

describe('Cancel subscription with server-derived refund', () => {
  it('a PAID, not-yet-started subscription: confirmation first, reason required, then the SERVER refund state is shown', async () => {
    const { b, uid, navigate } = await launch((x, u) => x.seedAccount(u, 'APPROVED'));
    const sub = b.seedSubscription(uid, 'ACTIVE');
    await go(navigate, 'MessSubscription', { subscriptionId: sub.id });
    await pressAsync('Cancel subscription');
    expect(await screen.findByText('Cancel this subscription?')).toBeTruthy();
    press('Confirm cancellation');
    expect(await screen.findByText('Choose a reason.')).toBeTruthy();
    expect(posts(b, `/mess/subscriptions/${sub.id}/cancel`).length).toBe(0);
    fireEvent.press(screen.getByRole('radio', { name: 'I changed my mind' }));
    press('Confirm cancellation');
    expect(await screen.findByText('Your full refund has been requested.')).toBeTruthy();
    expect(posts(b, `/mess/subscriptions/${sub.id}/cancel`)[0].body).toEqual({ reasonCode: 'CHANGED_MIND' });
    // the re-read subscription is cancelled and the cancel controls are gone
    expect(await screen.findByText('This subscription was cancelled.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).toBeNull();
    expect(screen.getByText('Refund amount')).toBeTruthy();
    expect(screen.getAllByText('Your full refund has been requested.').length).toBe(1);
  });

  it('an unpaid purchase cancels with no refund recorded (the server said NO_REFUND; nothing is invented)', async () => {
    const { b, uid, navigate } = await launch();
    const sub = b.seedSubscription(uid, 'PENDING_PAYMENT');
    await go(navigate, 'MessSubscription', { subscriptionId: sub.id });
    await pressAsync('Cancel subscription');
    fireEvent.press(await screen.findByRole('radio', { name: 'Something else' }));
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), '  needs   change ');
    press('Confirm cancellation');
    expect(await screen.findByText('No refund is recorded for this subscription.')).toBeTruthy();
    expect(screen.queryByText('Refund amount')).toBeNull();
    expect(posts(b, `/mess/subscriptions/${sub.id}/cancel`)[0].body).toEqual({ reasonCode: 'OTHER', note: 'needs change' });
  });

  it('cancel is not offered when the server says it is not allowed (a started subscription)', async () => {
    const { b, uid, navigate } = await launch();
    const sub = b.seedSubscription(uid, 'ACTIVE', { startsLater: false });
    await go(navigate, 'MessSubscription', { subscriptionId: sub.id });
    await screen.findByRole('button', { name: 'Meal calendar' });
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).toBeNull();
  });

  it('a server refusal (409) is mapped, the subscription is re-read and the customer can try again later', async () => {
    const { b, uid, navigate } = await launch();
    const sub = b.seedSubscription(uid, 'ACTIVE');
    await go(navigate, 'MessSubscription', { subscriptionId: sub.id });
    await pressAsync('Cancel subscription');
    fireEvent.press(await screen.findByRole('radio', { name: 'I ordered by mistake' }));
    sub.startsLater = false; // the start date arrived in the meantime
    press('Confirm cancellation');
    expect(await screen.findByText('This subscription can no longer be cancelled.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm cancellation' })).toBeNull());
    expect(screen.queryByText(/MESS_CANCELLATION_NOT_ALLOWED/)).toBeNull();
  });

  it('a refund that is under review is shown as such, never as refunded', async () => {
    const { b, uid, navigate } = await launch();
    const sub = b.seedSubscription(uid, 'CANCELLED', { refund: 'REFUND_REVIEW_REQUIRED', paid: true });
    await go(navigate, 'MessSubscription', { subscriptionId: sub.id });
    expect(await screen.findByText('Your refund is under review by Protein Bowl support.')).toBeTruthy();
    expect(screen.queryByText(/refund has been issued/)).toBeNull();
  });
});
