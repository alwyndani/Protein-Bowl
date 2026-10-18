import { NativeModules } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { IDEMPOTENCY_KEY_PATTERN } from '../src/commerce/idempotencyKey';
import { FakeCommerceBackend } from '../src/test/fakeCommerceBackend';
import { mountApp, press, pressAsync, seedDevice, tab } from '../src/test/harness';

const EMAIL = 'cust@b.test';
const ADDRESS = { id: 'a1', title: 'Home', addressLine1: '12 Beach Road', addressLine2: null, city: 'Kochi', state: 'Kerala', postalCode: '682001', isDefault: true, isActive: true };

async function launch(configure?: (b: FakeCommerceBackend, userId: string) => void) {
  const b = new FakeCommerceBackend();
  await seedDevice(b, EMAIL);
  const uid = b.users.get(EMAIL)!.id;
  b.addresses.set(uid, [{ ...ADDRESS }]);
  b.carts.set(uid, [{ id: 'seed-1', productId: 'p-1', variantId: 'v-1', quantity: 2 }]);
  configure?.(b, uid);
  mountApp(b);
  return { b, uid };
}

async function toCheckout() {
  fireEvent.press(await screen.findByRole('button', { name: /^Cart/ }));
  fireEvent.press(await screen.findByRole('button', { name: 'Continue to checkout' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Deliver to Home' }));
  await screen.findByText('Review your order');
}

const orderPosts = (b: FakeCommerceBackend) => b.log.filter((r) => r.path === '/orders' && r.method === 'POST');

describe('P11B checkout preview (server authority)', () => {
  it('shows the server preview and default-selected address; totals are verbatim', async () => {
    const { b } = await launch((x) => (x.netOverride = 777.77));
    await toCheckout();
    expect(await screen.findByText('₹777.77')).toBeTruthy(); // not derivable from the lines
    expect(screen.getByText('Deliver to Asha Rao')).toBeTruthy();
    expect(screen.getByText('12 Beach Road, Kochi, Kerala, 682001')).toBeTruthy();
    const preview = b.log.find((r) => r.path === '/checkout/preview')!;
    expect(preview.body).toEqual({ addressId: 'a1' });
  });

  it('there is no payment-method selector and no cash option anywhere on the screen', async () => {
    await launch();
    await toCheckout();
    expect(screen.getByText('Payment is online only.')).toBeTruthy();
    expect(screen.queryByText(/cash|COD|wallet|hostel|gate|collect/i)).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('an invalid address (INVALID_ADDRESS) is mapped, nothing is ordered', async () => {
    const { b, uid } = await launch();
    fireEvent.press(await screen.findByRole('button', { name: /^Cart/ }));
    fireEvent.press(await screen.findByRole('button', { name: 'Continue to checkout' }));
    const deliver = await screen.findByRole('button', { name: 'Deliver to Home' });
    b.addresses.get(uid)![0].isActive = false;
    fireEvent.press(deliver);
    expect(await screen.findByText(/address is not valid/)).toBeTruthy();
    expect(orderPosts(b).length).toBe(0);
  });

  it('an empty cart at preview time is mapped', async () => {
    const { b, uid } = await launch();
    fireEvent.press(await screen.findByRole('button', { name: /^Cart/ }));
    fireEvent.press(await screen.findByRole('button', { name: 'Continue to checkout' }));
    const deliver = await screen.findByRole('button', { name: 'Deliver to Home' });
    b.carts.set(uid, []);
    fireEvent.press(deliver);
    expect(await screen.findByText('Your cart is empty.')).toBeTruthy();
  });

  it('the minimum order blocks placing and is shown from the server values', async () => {
    await launch((x) => (x.minimumOrder = { enabled: true, requiredAmount: 5000 }));
    fireEvent.press(await screen.findByRole('button', { name: /^Cart/ }));
    expect(await screen.findByText(/The minimum order is ₹5,000\.00/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to checkout' }).props.accessibilityState.disabled).toBe(true);
  });
});

describe('P11B order creation (ONLINE, idempotent)', () => {
  it('creates the order with a valid idempotency header, NO paymentMethod, and lands on the payment-required result', async () => {
    const { b } = await launch();
    await toCheckout();
    press('Place order');
    expect(await screen.findByText(/Payment is required before your order can be confirmed/)).toBeTruthy();
    const post = orderPosts(b)[0];
    expect(post.headers['x-idempotency-key']).toMatch(IDEMPOTENCY_KEY_PATTERN);
    expect(post.body).toEqual({ addressId: 'a1' });
    expect('paymentMethod' in post.body).toBe(false);
    expect(screen.getByText(/^Order PB-/)).toBeTruthy();
    expect(screen.getAllByText('Order placed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payment required').length).toBeGreaterThan(0);
    // the order is not confirmed and not paid; the ONLY payment-related control is the explicit navigation to the order (P11C-2 step 5)
    expect(screen.queryByText('Confirmed')).toBeNull();
    expect(screen.queryByText(/^Paid$/)).toBeNull();
    const names = screen.getAllByRole('button').map((n) => String(n.props.accessibilityLabel ?? ''));
    expect(names.filter((n) => /pay|razorpay|upi|card/i.test(n))).toEqual(['Continue to payment']);
  });

  it('delivery instructions are sent only when entered and are limited to the backend maximum', async () => {
    const { b } = await launch();
    await toCheckout();
    const field = screen.getByLabelText('Delivery instructions (optional)');
    expect(field.props.maxLength).toBe(500);
    fireEvent.changeText(field, '  Leave at the gate  ');
    press('Place order');
    await screen.findByText(/Payment is required/);
    expect(orderPosts(b)[0].body).toEqual({ addressId: 'a1', deliveryInstructions: 'Leave at the gate' });
  });

  it('double / triple tap on Place order sends ONE order request and the control is disabled while busy', async () => {
    const { b } = await launch();
    await toCheckout();
    b.delayMs = 40;
    const place = screen.getByRole('button', { name: 'Place order' });
    fireEvent.press(place);
    fireEvent.press(place);
    fireEvent.press(place);
    await screen.findByText(/Payment is required/);
    expect(orderPosts(b).length).toBe(1);
  });

  it('the server cart is consumed: the cart is empty afterwards', async () => {
    await launch();
    await toCheckout();
    press('Place order');
    await screen.findByText(/Payment is required/);
    fireEvent.press(await screen.findByRole('button', { name: 'Back to the menu' }));
    fireEvent.press(await screen.findByRole('button', { name: /^Cart/ }));
    expect(await screen.findByText('Your cart is empty')).toBeTruthy();
  });

  it('the total shown at review is re-requested before ordering: if the server total changed nothing is ordered until the customer reviews it again', async () => {
    const { b } = await launch();
    await toCheckout();
    b.netOverride = 555;
    press('Place order');
    expect(await screen.findByText('Your order details have been updated. Please review them and place your order again.')).toBeTruthy();
    expect(orderPosts(b).length).toBe(0);
    expect(await screen.findByText('₹555.00')).toBeTruthy();
    press('Place order');
    await screen.findByText(/Payment is required/);
    expect(orderPosts(b).length).toBe(1);
  });

  it('REVIEW GATE: the same server values place the order; a changed fee, a changed tax (net unchanged), or a changed total require a new review - never a silent order', async () => {
    const { b } = await launch((x) => (x.netOverride = 777));
    await toCheckout();
    // 1. representation-only noise (0.3 vs 0.1 + 0.2 style) is NOT a change: it places
    b.netOverride = 777.0000000000001;
    press('Place order');
    await screen.findByText(/Payment is required/);
    expect(orderPosts(b).length).toBe(1);
  });

  it('REVIEW GATE: a delivery FEE that changed while the net total stayed the same blocks the order until re-reviewed', async () => {
    const { b } = await launch((x) => (x.netOverride = 777));
    await toCheckout();
    b.deliveryFeeOverride = 55; // net total is pinned, only the fee line differs
    press('Place order');
    expect(await screen.findByText('Your order details have been updated. Please review them and place your order again.')).toBeTruthy();
    expect(orderPosts(b).length).toBe(0);
    expect(await screen.findByText('₹55.00')).toBeTruthy();
    press('Place order'); // the customer has now seen the new figures
    await screen.findByText(/Payment is required/);
    expect(orderPosts(b).length).toBe(1);
  });

  it('REVIEW GATE: a TAX change with an unchanged net total blocks the order until re-reviewed', async () => {
    const { b } = await launch((x) => (x.netOverride = 777));
    await toCheckout();
    b.taxOverride = 99.5;
    press('Place order');
    expect(await screen.findByText(/Your order details have been updated/)).toBeTruthy();
    expect(orderPosts(b).length).toBe(0);
  });

  it('REVIEW GATE: unchanged server values place the order with no extra review', async () => {
    const { b } = await launch();
    await toCheckout();
    press('Place order');
    await screen.findByText(/Payment is required/);
    expect(orderPosts(b).length).toBe(1);
  });

  it('a definitive rejection (422) is mapped, keeps the form usable and the SAME key for the same request', async () => {
    const { b } = await launch();
    await toCheckout();
    b.failNext('/orders', 422);
    press('Place order');
    expect(await screen.findByText(/check what you entered/)).toBeTruthy();
    expect(screen.queryByText(/could not confirm whether/)).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' }).props.accessibilityState.disabled).toBe(false));
    press('Place order');
    await screen.findByText(/Payment is required/);
    const keys = orderPosts(b).map((r) => r.headers['x-idempotency-key']);
    expect(keys.length).toBe(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('IDEMPOTENCY_KEY_REUSED (409) is mapped to guidance that points to My orders, never a raw code', async () => {
    const { b } = await launch();
    await toCheckout();
    b.failNext('/orders', { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
    press('Place order');
    expect(await screen.findByText(/no longer matches what you submitted. Please check My orders/)).toBeTruthy();
    expect(screen.queryByText(/IDEMPOTENCY/)).toBeNull();
  });

  it('MINIMUM_ORDER_NOT_MET at order time (422) is mapped', async () => {
    const { b } = await launch();
    await toCheckout();
    b.failNext('/orders', { status: 422, code: 'MINIMUM_ORDER_NOT_MET' });
    press('Place order');
    expect(await screen.findByText(/below the minimum order amount/)).toBeTruthy();
  });

  it('a 401 while ordering triggers the single-flight refresh and the order is still placed once', async () => {
    const { b } = await launch();
    await toCheckout();
    b.expireAccessTokens();
    press('Place order');
    await screen.findByText(/Payment is required/);
    expect(b.count('/auth/mobile/refresh')).toBe(2); // 1 at launch (session restore) + exactly 1 for the expired token
    expect(orderPosts(b).length).toBe(1);
  });

  it('a 429 is mapped and nothing is frozen (the server did not process it)', async () => {
    const { b } = await launch();
    await toCheckout();
    b.failNext('/orders', 429);
    press('Place order');
    expect(await screen.findByText(/wait/)).toBeTruthy();
    expect(screen.queryByText(/could not confirm whether/)).toBeNull();
  });
});

describe('P11B ambiguous order creation (same key, never a new-key order)', () => {
  it('a LOST response after the server committed: the UI says the outcome is unknown, retry reuses the SAME key and yields ONE order', async () => {
    const { b, uid } = await launch();
    await toCheckout();
    b.loseNextOrderResponse = true;
    press('Place order');
    expect(await screen.findByText(/could not confirm whether your order was placed/)).toBeTruthy();
    expect(screen.queryByText(/failed/i)).toBeNull(); // it is NOT presented as a failure
    expect(screen.getByRole('button', { name: 'Check my orders' })).toBeTruthy();
    // the request is frozen: address / instructions cannot be edited and the change-address control is gone
    expect(screen.getByLabelText('Delivery instructions (optional)').props.editable).toBe(false);
    expect(screen.queryByRole('button', { name: 'Change address' })).toBeNull();
    expect(b.orders.get(uid)!.length).toBe(1); // the order really exists server-side

    press('Retry the same order');
    expect(await screen.findByText(/Payment is required/)).toBeTruthy();
    const posts = orderPosts(b);
    expect(posts.length).toBe(2);
    expect(posts[1].headers['x-idempotency-key']).toBe(posts[0].headers['x-idempotency-key']);
    expect(posts[1].body).toEqual(posts[0].body);
    expect(b.orders.get(uid)!.length).toBe(1); // replayed, not duplicated
    expect(b.log.filter((r) => r.path === '/checkout/preview').length).toBe(2); // screen load + the pre-order re-request; the RETRY did not preview again (the cart was already consumed)
  });

  it.each([
    ['network failure before the server saw it', 'network' as const],
    ['timeout', 'timeout' as const],
    ['server error', 500]
  ])('%s: frozen attempt, retry uses the same key and creates exactly one order', async (_n, fault) => {
    const { b, uid } = await launch();
    await toCheckout();
    b.failNext('/orders', fault);
    press('Place order');
    expect(await screen.findByText(/could not confirm whether your order was placed/)).toBeTruthy();
    press('Retry the same order');
    await screen.findByText(/Payment is required/);
    const posts = orderPosts(b);
    expect(posts.length).toBe(2);
    expect(posts[1].headers['x-idempotency-key']).toBe(posts[0].headers['x-idempotency-key']);
    expect(b.orders.get(uid)!.length).toBe(1);
  });

  it('"Check my orders" shows the order that was committed; the checkout stays frozen until it is resolved', async () => {
    const { b } = await launch();
    await toCheckout();
    b.loseNextOrderResponse = true;
    press('Place order');
    await screen.findByText(/could not confirm whether/);
    press('Check my orders');
    expect(await screen.findByText(/^PB-261013-T/)).toBeTruthy();
    expect(screen.getAllByText('Payment required').length).toBeGreaterThan(0);
  });

  it('the frozen attempt survives navigating away and back (provider-level state, not screen state)', async () => {
    const { b } = await launch();
    await toCheckout();
    b.loseNextOrderResponse = true;
    press('Place order');
    await screen.findByText(/could not confirm whether/);
    await tab('Orders');
    await tab('Menu');
    expect(await screen.findByText(/could not confirm whether/)).toBeTruthy();
    press('Retry the same order');
    await screen.findByText(/Payment is required/);
    const posts = orderPosts(b);
    expect(posts[1].headers['x-idempotency-key']).toBe(posts[0].headers['x-idempotency-key']);
  });

  it('a retry the server definitively rejects (cart emptied elsewhere) resolves the ambiguity instead of looping', async () => {
    const { b, uid } = await launch();
    await toCheckout();
    b.failNext('/orders', 'network');
    press('Place order');
    await screen.findByText(/could not confirm whether/);
    b.carts.set(uid, []); // nothing was ever created and the cart is gone
    press('Retry the same order');
    expect(await screen.findByText('Your cart is empty.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/could not confirm whether/)).toBeNull());
  });

  it('"Start over" abandons the attempt (a fresh key is used afterwards)', async () => {
    const { b } = await launch();
    await toCheckout();
    b.failNext('/orders', 'timeout');
    press('Place order');
    await screen.findByText(/could not confirm whether/);
    press('Start over');
    await waitFor(() => expect(screen.queryByText(/could not confirm whether/)).toBeNull());
    press('Place order');
    await screen.findByText(/Payment is required/);
    const keys = orderPosts(b).map((r) => r.headers['x-idempotency-key']);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('signing out discards the attempt (the key never outlives the session)', async () => {
    const { b } = await launch();
    await toCheckout();
    b.failNext('/orders', 'network');
    press('Place order');
    await screen.findByText(/could not confirm whether/);
    await tab('Account');
    press('Sign out');
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeTruthy();
    expect(screen.queryByText(/could not confirm whether/)).toBeNull();
  });
});

describe('P11B orders list and detail (read-only)', () => {
  async function place() {
    const ctx = await launch();
    await toCheckout();
    fireEvent.changeText(screen.getByLabelText('Delivery instructions (optional)'), 'Leave at the gate');
    press('Place order');
    await screen.findByText(/Payment is required/);
    return ctx;
  }

  it('empty list', async () => {
    const b = new FakeCommerceBackend();
    await seedDevice(b, EMAIL);
    mountApp(b);
    await tab('Orders');
    expect(await screen.findByText('No orders yet')).toBeTruthy();
  });

  it('lists the order: number, IST time, server total, order and payment state (no client-derived money)', async () => {
    await place();
    await tab('Orders');
    const card = await screen.findByRole('button', { name: /^Order PB-261013-T/ });
    expect(card.props.accessibilityLabel).toMatch(/Order placed/);
    expect(screen.getByText('13 Oct 2026, 3:45 pm IST')).toBeTruthy();
    expect(screen.getAllByText('Payment required').length).toBeGreaterThan(0);
  });

  // The secure payment window exists only in a native build: simulate one for the tests that expect Pay Now.
  const withNative = (on: boolean) => {
    if (on) (NativeModules as Record<string, unknown>).RNRazorpayCheckout = {};
    else delete (NativeModules as Record<string, unknown>).RNRazorpayCheckout;
  };
  afterEach(() => withNative(false));

  it('detail: items with server price snapshots, totals, address snapshot, instructions, timeline - and NO email, phone, SKU or internal fields', async () => {
    withNative(true);
    await place();
    await pressAsync('Continue to payment');
    expect(await screen.findByText('Chicken Bowl')).toBeTruthy();
    expect(screen.getByText('2 × ₹299.00')).toBeTruthy();
    expect(screen.getByText('Delivery address')).toBeTruthy();
    expect(screen.getByText('12 Beach Road, Kochi, Kerala, 682001')).toBeTruthy();
    expect(screen.getByText('Instructions: Leave at the gate')).toBeTruthy();
    expect(screen.getByText('Order placed · 13 Oct 2026, 3:45 pm IST')).toBeTruthy();
    expect(screen.queryByText(/@|\+91|SKU-SECRET|PB-.*idempot|fingerprint/i)).toBeNull();
    // payment is still required: the payment panel (its explicit Pay Now) is the only payment control; no cancel / refund / delivery-code control
    expect(screen.getByText(/Payment is required before your order can be confirmed/)).toBeTruthy();
    const names = screen.getAllByRole('button').map((n) => String(n.props.accessibilityLabel ?? ''));
    expect(names.filter((n) => /cancel|refund|delivery code|code/i.test(n))).toEqual([]);
    expect(names.filter((n) => /pay/i.test(n)).sort()).toEqual(['Pay Now']);
  });

  it('a build WITHOUT the secure payment window shows the explanation up front and no Pay Now (no fallback)', async () => {
    withNative(false);
    await place();
    await pressAsync('Continue to payment');
    expect(await screen.findByText(/Secure payment can.t be opened on this app build or device/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull();
    expect(screen.queryByText(/cash|wallet|COD|bank transfer/i)).toBeNull();
  });

  it('Continue to payment only NAVIGATES to the order: no payment request is made, nothing opens, the panel offers an explicit Pay Now', async () => {
    withNative(true);
    const { b } = await place();
    const before = b.log.length;
    await pressAsync('Continue to payment');
    expect(await screen.findByText('Chicken Bowl')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeTruthy();
    expect(b.log.slice(before).filter((r) => /payment-attempts|verify/.test(r.path) || r.method !== 'GET')).toEqual([]);
  });

  it('cancellation / refund / delivery states are DISPLAYED read-only when meaningful - still no action control', async () => {
    const { b, uid } = await place();
    const o = b.orders.get(uid)![0];
    o.status = 'DISPATCHED';
    o.paymentStatus = 'PAID';
    o.payment = { state: 'PAID', canStartPayment: false };
    o.refund = { state: 'REFUND_PROCESSING' };
    o.cancellation = { state: 'CANCELLATION_NOT_ALLOWED', allowed: false };
    o.delivery = { state: 'ON_THE_WAY', attemptNumber: 1, maxAttempts: 3 };
    await pressAsync('Continue to payment');
    expect(await screen.findByText('Refund processing')).toBeTruthy();
    expect(screen.getByText('Out for delivery. Your order is on its way.')).toBeTruthy();
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Payment is required/)).toBeNull();
    const names = screen.getAllByRole('button').map((n) => String(n.props.accessibilityLabel ?? ''));
    expect(names.filter((n) => /cancel|refund|delivery code|generate|verify/i.test(n))).toEqual([]);
  });

  it('a cancelled order explains it (read-only)', async () => {
    const { b, uid } = await place();
    const o = b.orders.get(uid)![0];
    o.status = 'CANCELLED';
    o.cancellation = { state: 'CANCELLED', allowed: false };
    await pressAsync('Continue to payment');
    expect(await screen.findByText('This order was cancelled.')).toBeTruthy();
    expect(screen.queryByText(/Payment is required/)).toBeNull();
  });

  it('a missing order (404) is a safe message', async () => {
    const { b, uid } = await place();
    const orders = b.orders.get(uid)!;
    orders.push({ ...orders[0], id: 'ord-ghost', orderNumber: 'PB-261013-TGHOST' });
    await tab('Orders');
    const card = await screen.findByRole('button', { name: /^Order PB-261013-TGHOST/ });
    orders.pop(); // it no longer exists server-side, and was never cached as an order detail
    fireEvent.press(card);
    expect(await screen.findByText('We could not find this order.')).toBeTruthy();
  });

  it('orders list failure is mapped (5xx) and Try again recovers', async () => {
    const b = new FakeCommerceBackend();
    await seedDevice(b, EMAIL);
    mountApp(b);
    b.failNext('/orders/my-orders', 500);
    await tab('Orders');
    expect(await screen.findByText(/having trouble/)).toBeTruthy();
    press('Try again');
    expect(await screen.findByText('No orders yet')).toBeTruthy();
  });
});

describe('P11B automated journey (no device, stops before payment)', () => {
  it('sign in -> catalog -> cart -> address -> preview -> ONLINE order -> PENDING/PENDING -> orders -> detail', async () => {
    const b = new FakeCommerceBackend();
    b.addUser({ email: 'journey@b.test', fullName: 'Journey Customer' });
    mountApp(b); // no stored session: starts signed out
    fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.changeText(await screen.findByLabelText('Email'), 'journey@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    // catalog -> product -> cart
    fireEvent.press(await screen.findByRole('button', { name: /^Chicken Bowl/ }));
    await pressAsync('Add to cart');
    await screen.findByText('Added to your cart.');
    fireEvent.press(screen.getByRole('button', { name: 'View cart' }));
    expect(await screen.findByText('Your cart')).toBeTruthy();
    fireEvent.press(await screen.findByRole('button', { name: 'Continue to checkout' }));

    // address
    await pressAsync('Add a new address');
    fireEvent.changeText(await screen.findByLabelText('Address line 1'), '12 Beach Road');
    fireEvent.changeText(screen.getByLabelText('City'), 'Kochi');
    fireEvent.changeText(screen.getByLabelText('Postal code'), '682001');
    press('Save address');
    fireEvent.press(await screen.findByRole('button', { name: 'Deliver to Home' }));

    // preview -> order
    expect(await screen.findByText('Review your order')).toBeTruthy();
    press('Place order');
    expect(await screen.findByText(/Payment is required before your order can be confirmed/)).toBeTruthy();
    const created = b.orders.get(b.users.get('journey@b.test')!.id)![0];
    expect(created.status).toBe('PENDING');
    expect(created.paymentStatus).toBe('PENDING');
    expect(created.paymentMethod).toBe('ONLINE');
    expect(created.payment.state).toBe('NOT_STARTED');

    // orders list -> detail
    await tab('Orders');
    fireEvent.press(await screen.findByRole('button', { name: /^Order PB-261013-T/ }));
    expect(await screen.findByText('Chicken Bowl')).toBeTruthy();
    expect(screen.getByText('Delivery address')).toBeTruthy();
  }, 30000);
});

describe('P11B registration phone', () => {
  const fill = async (b: FakeCommerceBackend, phone?: string) => {
    mountApp(b);
    fireEvent.press(await screen.findByRole('button', { name: 'Create account' }));
    fireEvent.changeText(await screen.findByLabelText('Full name'), 'New Person');
    fireEvent.changeText(screen.getByLabelText('Email'), 'new@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    if (phone !== undefined) fireEvent.changeText(screen.getByLabelText('Phone number (optional)'), phone);
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  };

  it('the optional phone is sent through the existing mobile register contract when entered (trimmed)', async () => {
    const b = new FakeCommerceBackend();
    await fill(b, ' +91 98765 43210 ');
    await screen.findByLabelText('Menu tab');
    expect(b.log.find((r) => r.path === '/auth/mobile/register')!.body).toEqual({ email: 'new@b.test', password: 'Password-123', fullName: 'New Person', phone: '+91 98765 43210' });
  });

  it('it is optional: omitted when empty', async () => {
    const b = new FakeCommerceBackend();
    await fill(b);
    await screen.findByLabelText('Menu tab');
    expect('phone' in b.log.find((r) => r.path === '/auth/mobile/register')!.body).toBe(false);
  });

  it('a server error with a phone entered gives honest, non-leaky guidance', async () => {
    const b = new FakeCommerceBackend();
    b.failNext('/auth/mobile/register', 500);
    await fill(b, '9876543210');
    expect(await screen.findByText(/phone number is already registered, try again without it/)).toBeTruthy();
  });
});
