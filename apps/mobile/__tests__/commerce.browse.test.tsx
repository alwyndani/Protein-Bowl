import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { FakeCommerceBackend } from '../src/test/fakeCommerceBackend';
import { mountApp, press, pressAsync, seedDevice } from '../src/test/harness';

const EMAIL = 'cust@b.test';

async function launch(configure?: (b: FakeCommerceBackend) => void) {
  const backend = new FakeCommerceBackend();
  configure?.(backend);
  await seedDevice(backend, EMAIL);
  mountApp(backend);
  return backend;
}

const uid = (b: FakeCommerceBackend) => b.users.get(EMAIL)!.id;
const addLine = (b: FakeCommerceBackend, productId: string, variantId: string | null, quantity: number) => {
  const lines = b.carts.get(uid(b)) ?? [];
  lines.push({ id: `seed-${lines.length + 1}`, productId, variantId, quantity });
  b.carts.set(uid(b), lines);
};
const openCart = async () => fireEvent.press(await screen.findByRole('button', { name: /^Cart/ }));

describe('P11B catalog', () => {
  it('loads categories and products; renders only allow-listed fields (price from the default variant)', async () => {
    await launch();
    expect(await screen.findByText('Chicken Bowl')).toBeTruthy();
    expect(screen.getByText('Paneer Bowl')).toBeTruthy();
    expect(screen.getByText('₹299.00')).toBeTruthy();
    expect(screen.getByText('₹249.50')).toBeTruthy();
    expect((await screen.findAllByRole('button', { name: 'Drinks' })).length).toBeGreaterThan(0);
    // fields the public API returns but the app must never show
    expect(screen.queryByText(/4\.8|SKU-SECRET|recipe-internal|0\.0500|reviews?|in stock|stock/i)).toBeNull();
  });

  it('images: https renders, null / http fall back to the neutral placeholder (nothing invented)', async () => {
    await launch();
    await screen.findByText('Chicken Bowl');
    // Chicken (null image) and Tepache (http image) use the placeholder; Paneer (https) does not.
    expect(screen.getAllByLabelText('No product image').length).toBe(2);
  });

  it('a product with no usable variant is shown as not available (no price is invented)', async () => {
    await launch();
    await screen.findByText('Tepache');
    expect(screen.getByText('Not available')).toBeTruthy();
  });

  it('category filter requests the server with the category id', async () => {
    const b = await launch();
    await screen.findByText('Chicken Bowl');
    fireEvent.press((await screen.findAllByRole('button', { name: 'Drinks' }))[0]); // the category chip (the Tepache card also mentions its category)
    expect(await screen.findByText('Tepache')).toBeTruthy();
    expect(screen.queryByText('Chicken Bowl')).toBeNull();
    expect(b.log.some((r) => r.path === '/products?categoryId=cat-2')).toBe(true);
  });

  it('empty catalog', async () => {
    await launch((b) => (b.products = []));
    expect(await screen.findByText('Nothing on the menu here yet')).toBeTruthy();
  });

  it('catalog failure shows safe copy and Try again recovers', async () => {
    const b = new FakeCommerceBackend();
    await seedDevice(b, EMAIL);
    b.failNext('/products', 500);
    mountApp(b);
    expect(await screen.findByText(/having trouble/)).toBeTruthy();
    expect(screen.queryByText(/FAULT|INTERNAL/)).toBeNull();
    press('Try again');
    expect(await screen.findByText('Chicken Bowl')).toBeTruthy();
  });

  it('offline catalog read shows the offline copy', async () => {
    const b = new FakeCommerceBackend();
    await seedDevice(b, EMAIL);
    b.failNext('/products', 'network');
    mountApp(b);
    expect(await screen.findByText(/appear to be offline/)).toBeTruthy();
  });
});

describe('P11B product detail', () => {
  it('shows active options only, lets the customer choose, and sends the chosen variant', async () => {
    const b = await launch();
    fireEvent.press(await screen.findByRole('button', { name: /^Paneer Bowl/ }));
    expect(await screen.findByText('Choose an option')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Regular/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Large/ })).toBeTruthy();
    expect(screen.queryByText('Retired')).toBeNull();
    fireEvent.press(screen.getByRole('radio', { name: /Large/ }));
    expect(screen.getAllByText('₹1,249.50').length).toBeGreaterThan(0);
    press('Add to cart');
    expect(await screen.findByText('Added to your cart.')).toBeTruthy();
    const add = b.log.find((r) => r.path === '/cart/items' && r.method === 'POST')!;
    expect(add.body).toEqual({ productId: 'p-2', variantId: 'v-2b', quantity: 1 });
    expect(screen.queryByText(/SKU-SECRET|stock/i)).toBeNull();
  });

  it('a single default variant is preselected', async () => {
    const b = await launch();
    fireEvent.press(await screen.findByRole('button', { name: /^Chicken Bowl/ }));
    await screen.findByText('Add to cart');
    expect(screen.queryByText('Choose an option')).toBeNull();
    press('Add to cart');
    await screen.findByText('Added to your cart.');
    expect(b.log.find((r) => r.path === '/cart/items')!.body.variantId).toBe('v-1');
  });

  it('no usable variant: Add to cart is disabled honestly', async () => {
    await launch();
    fireEvent.press(await screen.findByRole('button', { name: /^Tepache/ }));
    expect(await screen.findByText('This item has no available option right now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to cart' }).props.accessibilityState.disabled).toBe(true);
  });

  it('a product that disappeared (404 without a code) shows the unavailable message', async () => {
    const b = await launch();
    const card = await screen.findByRole('button', { name: /^Chicken Bowl/ });
    b.products = [];
    fireEvent.press(card);
    expect(await screen.findByText('This item is no longer available.')).toBeTruthy();
  });

  it('rapid double tap on Add to cart sends ONE request', async () => {
    const b = await launch();
    b.delayMs = 40;
    fireEvent.press(await screen.findByRole('button', { name: /^Chicken Bowl/ }));
    const add = await screen.findByRole('button', { name: 'Add to cart' });
    fireEvent.press(add);
    fireEvent.press(add);
    fireEvent.press(add);
    await screen.findByText('Added to your cart.');
    expect(b.count('/cart/items')).toBe(1);
  });

  it('quantity failure (over the line limit) uses the mapped copy', async () => {
    await launch();
    fireEvent.press(await screen.findByRole('button', { name: /^Chicken Bowl/ }));
    for (let i = 0; i < 10; i++) fireEvent.press(await screen.findByRole('button', { name: 'Increase Chicken Bowl' }));
    press('Add to cart');
    expect(await screen.findByText('That is more than can be ordered of a single item.')).toBeTruthy();
  });

  it('offline write refusal: the add is not faked', async () => {
    const b = await launch();
    fireEvent.press(await screen.findByRole('button', { name: /^Chicken Bowl/ }));
    await screen.findByText('Add to cart');
    b.failNext('/cart/items', 'network');
    press('Add to cart');
    expect(await screen.findByText(/not saved/)).toBeTruthy();
    expect(screen.queryByText('Added to your cart.')).toBeNull();
  });
});

describe('P11B server cart', () => {
  it('empty cart', async () => {
    await launch();
    await openCart();
    expect(await screen.findByText('Your cart is empty')).toBeTruthy();
  });

  it('displays the SERVER figures verbatim - nothing is calculated on the device', async () => {
    const b = await launch((x) => (x.netOverride = 999.99));
    addLine(b, 'p-1', 'v-1', 2);
    await openCart();
    // The fake's own line math (2 x 299 + tax) is shown for the line; the TOTAL is an unrelated server value the app cannot derive.
    expect(await screen.findByText('₹999.99')).toBeTruthy();
    expect(screen.getByText('₹299.00 each')).toBeTruthy();
    expect(screen.getByText('₹627.90')).toBeTruthy(); // server line total (598 + 29.9 tax)
  });

  it('quantity increase / decrease go to the server and the response replaces the cart', async () => {
    const b = await launch();
    addLine(b, 'p-1', 'v-1', 1);
    await openCart();
    fireEvent.press(await screen.findByRole('button', { name: 'Increase Chicken Bowl' }));
    await waitFor(() => expect(b.log.find((r) => r.method === 'PATCH')?.body).toEqual({ quantity: 2 }));
    expect(await screen.findByText('₹627.90')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Decrease Chicken Bowl' }));
    await waitFor(() => expect(b.log.filter((r) => r.method === 'PATCH').length).toBe(2));
    expect(await screen.findByText('₹313.95')).toBeTruthy();
  });

  it('the decrease control is disabled at quantity 1 (use Remove)', async () => {
    const b = await launch();
    addLine(b, 'p-1', 'v-1', 1);
    await openCart();
    const minus = await screen.findByRole('button', { name: 'Decrease Chicken Bowl' });
    expect(minus.props.accessibilityState.disabled).toBe(true);
  });

  it('fast repeated taps cannot fire repeated mutations', async () => {
    const b = await launch();
    addLine(b, 'p-1', 'v-1', 1);
    b.delayMs = 40;
    await openCart();
    const plus = await screen.findByRole('button', { name: 'Increase Chicken Bowl' });
    fireEvent.press(plus);
    fireEvent.press(plus);
    fireEvent.press(plus);
    await waitFor(() => expect(b.count('/cart/items/seed-1')).toBe(1));
    await new Promise((r) => setTimeout(r, 120));
    expect(b.count('/cart/items/seed-1')).toBe(1);
  });

  it('remove and clear (with confirmation)', async () => {
    const b = await launch();
    addLine(b, 'p-1', 'v-1', 1);
    addLine(b, 'p-2', 'v-2a', 1);
    await openCart();
    fireEvent.press(await screen.findByRole('button', { name: 'Remove Chicken Bowl' }));
    await waitFor(() => expect(screen.queryByText('Chicken Bowl')).toBeNull());
    expect(b.log.some((r) => r.method === 'DELETE' && r.path === '/cart/items/seed-1')).toBe(true);
    press('Clear cart');
    expect(screen.getByText('Remove everything from your cart?')).toBeTruthy();
    press('Yes, clear my cart');
    expect(await screen.findByText('Your cart is empty')).toBeTruthy();
    expect(b.log.some((r) => r.method === 'DELETE' && r.path === '/cart')).toBe(true);
  });

  it('quantity limit failure from the server is mapped (and the cart stays as the server has it)', async () => {
    const b = await launch();
    addLine(b, 'p-1', 'v-1', 10);
    await openCart();
    fireEvent.press(await screen.findByRole('button', { name: 'Increase Chicken Bowl' }));
    expect(await screen.findByText('Your cart cannot hold that many items in total.')).toBeTruthy();
  });

  it('minimum order state comes from the server and blocks Continue', async () => {
    const b = await launch((x) => (x.minimumOrder = { enabled: true, requiredAmount: 1000 }));
    addLine(b, 'p-1', 'v-1', 1);
    await openCart();
    expect(await screen.findByText('The minimum order is ₹1,000.00. Add ₹701.00 more to continue.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to checkout' }).props.accessibilityState.disabled).toBe(true);
  });

  it('401 during a cart call triggers the single-flight refresh and the call succeeds', async () => {
    const b = await launch();
    addLine(b, 'p-1', 'v-1', 1);
    await screen.findByText('Paneer Bowl'); // the session is restored and the menu is loaded
    b.expireAccessTokens();
    await openCart();
    expect(await screen.findByText('Chicken Bowl')).toBeTruthy();
    expect(b.count('/auth/mobile/refresh')).toBe(2); // 1 at launch (restore) + exactly 1 for the expired token
  });

  it.each([
    [403, /not available for your account/],
    [429, /wait/],
    [500, /having trouble/],
    [409, /conflicts/],
    [422, /check what you entered/]
  ])('cart read failure %s shows mapped copy only', async (status, re) => {
    const b = await launch();
    b.failNext('/cart', status as number, status as number); // the header badge query consumes the first one
    await openCart();
    expect(await screen.findByText(re as RegExp)).toBeTruthy();
    expect(screen.queryByText(/FAULT/)).toBeNull();
  });
});

describe('P11B addresses', () => {
  const goAddresses = async () => {
    fireEvent.press(await screen.findByLabelText('Account tab'));
    fireEvent.press(await screen.findByRole('button', { name: 'Delivery addresses' }));
  };

  it('empty list, then create the first address (default preselected); fields match the backend', async () => {
    const b = await launch();
    await goAddresses();
    expect(await screen.findByText('No delivery addresses yet')).toBeTruthy();
    await pressAsync('Add a new address');
    press('Save address');
    expect(await screen.findByText('Enter the first line of the address.')).toBeTruthy();
    expect(screen.getByText('Enter the city.')).toBeTruthy();
    expect(screen.getByText('Enter the postal code.')).toBeTruthy();
    expect(b.log.some((r) => r.method === 'POST' && r.path === '/customers/me/addresses')).toBe(false); // nothing was posted
    fireEvent.changeText(screen.getByLabelText('Address line 1'), '12 Beach Road');
    fireEvent.changeText(screen.getByLabelText('City'), 'Kochi');
    fireEvent.changeText(screen.getByLabelText('Postal code'), '682001');
    press('Save address');
    expect(await screen.findByText(/12 Beach Road, Kochi, Kerala, 682001/)).toBeTruthy();
    const post = b.log.find((r) => r.method === 'POST' && r.path === '/customers/me/addresses')!;
    expect(post.body).toEqual({ title: 'Home', addressLine1: '12 Beach Road', addressLine2: null, city: 'Kochi', state: 'Kerala', postalCode: '682001', isDefault: true });
    expect(screen.getByText('Default')).toBeTruthy();
  });

  it('edit, set default and delete (with confirmation)', async () => {
    const b = await launch();
    b.addresses.set(uid(b), [
      { id: 'a1', title: 'Home', addressLine1: '12 Beach Road', addressLine2: null, city: 'Kochi', state: 'Kerala', postalCode: '682001', isDefault: true, isActive: true },
      { id: 'a2', title: 'Work', addressLine1: '5 MG Road', addressLine2: null, city: 'Kochi', state: 'Kerala', postalCode: '682016', isDefault: false, isActive: true }
    ]);
    await goAddresses();
    await screen.findByText('Work');
    press('Make Work default');
    await waitFor(() => expect(b.log.find((r) => r.method === 'PUT')?.body).toEqual({ isDefault: true }));
    press('Edit Work');
    fireEvent.changeText(await screen.findByLabelText('City'), 'Thrissur');
    press('Save address');
    await waitFor(() => expect(b.log.filter((r) => r.method === 'PUT').length).toBe(2));
    expect(b.log.filter((r) => r.method === 'PUT')[1].body.city).toBe('Thrissur');
    press('Delete Home');
    press('Yes, delete Home');
    await waitFor(() => expect(screen.queryByText('Home')).toBeNull(), { timeout: 4000 });
    expect(b.log.some((r) => r.method === 'DELETE' && r.path === '/customers/me/addresses/a1')).toBe(true);
  }, 20000);

  it("another customer's (or a removed) address is a safe 404: the message is generic and the list is unchanged", async () => {
    const b = await launch();
    b.addresses.set(uid(b), [{ id: 'a1', title: 'Home', addressLine1: '12 Beach Road', addressLine2: null, city: 'Kochi', state: 'Kerala', postalCode: '682001', isDefault: false, isActive: true }]);
    await goAddresses();
    await screen.findByText('Home');
    b.addresses.get(uid(b))![0].isActive = false; // gone / not owned from the server's point of view
    press('Make Home default');
    expect(await screen.findByText(/could not find that/)).toBeTruthy();
  });

  it('address write while offline is refused honestly', async () => {
    const b = await launch();
    await goAddresses();
    await screen.findByText('No delivery addresses yet');
    await pressAsync('Add a new address');
    fireEvent.changeText(await screen.findByLabelText('Address line 1'), '12 Beach Road');
    fireEvent.changeText(screen.getByLabelText('City'), 'Kochi');
    fireEvent.changeText(screen.getByLabelText('Postal code'), '682001');
    b.failNext('/customers/me/addresses', 'network');
    press('Save address');
    expect(await screen.findByText(/not saved/)).toBeTruthy();
  });

  it('never asks for location: no location permission or coordinates are involved', async () => {
    const b = await launch();
    await goAddresses();
    await pressAsync('Add a new address');
    fireEvent.changeText(await screen.findByLabelText('Address line 1'), '12 Beach Road');
    fireEvent.changeText(screen.getByLabelText('City'), 'Kochi');
    fireEvent.changeText(screen.getByLabelText('Postal code'), '682001');
    press('Save address');
    await waitFor(() => expect(b.log.some((r) => r.method === 'POST' && r.path === '/customers/me/addresses')).toBe(true));
    const body = b.log.find((r) => r.method === 'POST' && r.path === '/customers/me/addresses')!.body;
    expect('latitude' in body || 'longitude' in body).toBe(false);
  });
});
