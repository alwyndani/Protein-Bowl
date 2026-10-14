import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CheckoutAttemptProvider, CheckoutAttemptStore, useCheckoutAttempt } from '../src/commerce/checkoutAttempt';
import { FakeCommerceBackend } from '../src/test/fakeCommerceBackend';
import { mountApp, mountCheckoutDirect, press, seedDevice, tab } from '../src/test/harness';

const EMAIL = 'cust@b.test';
const ADDR = (id: string, title: string) => ({ id, title, addressLine1: `${title} Road 12`, addressLine2: null, city: 'Kochi', state: 'Kerala', postalCode: '682001', isDefault: id === 'a1', isActive: true });
const orderPosts = (b: FakeCommerceBackend) => b.log.filter((r) => r.path === '/orders' && r.method === 'POST');

describe('P11B checkout attempt lifecycle (in-memory idempotency key)', () => {
  it('screen RECREATION: the attempt lives in the provider, so an unmounted and re-mounted screen sees the same key', () => {
    const store = new CheckoutAttemptStore(() => 'IK-recreate-test-1');
    store.prepare('a1', 'ring twice');
    store.markAmbiguous();
    function Reader() {
      const a = useCheckoutAttempt();
      return <Text>{a ? `${a.key}|${a.addressId}|${a.deliveryInstructions}|${a.ambiguous}` : 'none'}</Text>;
    }
    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <CheckoutAttemptProvider store={store}>
          <Pressable accessibilityRole="button" accessibilityLabel="toggle" onPress={() => setShown((v) => !v)} />
          {shown ? <Reader /> : null}
        </CheckoutAttemptProvider>
      );
    }
    render(<Host />);
    expect(screen.getByText('IK-recreate-test-1|a1|ring twice|true')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'toggle' })); // unmount the "screen"
    expect(screen.queryByText(/IK-recreate/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'toggle' })); // re-create it
    expect(screen.getByText('IK-recreate-test-1|a1|ring twice|true')).toBeTruthy();
  });

  it('a FROZEN attempt keeps its own address and instructions even if the screen is opened for a DIFFERENT address; the retry uses the same key', async () => {
    const b = new FakeCommerceBackend();
    await seedDevice(b, EMAIL);
    const uid = b.users.get(EMAIL)!.id;
    b.addresses.set(uid, [ADDR('a1', 'Home'), ADDR('a2', 'Work')]);
    b.carts.set(uid, [{ id: 'seed-1', productId: 'p-1', variantId: 'v-1', quantity: 1 }]);
    const store = new CheckoutAttemptStore(() => 'IK-frozen-attempt-1');
    store.prepare('a1', 'ring twice');
    store.markAmbiguous();
    await mountCheckoutDirect(b, store, 'a2'); // the route says a2 (Work)
    expect(await screen.findByText(/could not confirm whether your order was placed/)).toBeTruthy();
    const field = screen.getByLabelText('Delivery instructions (optional)');
    expect(field.props.editable).toBe(false);
    expect(field.props.value).toBe('ring twice');
    press('Retry the same order');
    await screen.findByText(/Payment is required/);
    const post = orderPosts(b)[0];
    expect(post.headers['x-idempotency-key']).toBe('IK-frozen-attempt-1');
    expect(post.body).toEqual({ addressId: 'a1', deliveryInstructions: 'ring twice' }); // NOT a2
    expect(store.get()).toBeNull(); // success clears the key
  });

  it('PROCESS DEATH after a lost answer: the local key is gone, but a restart does NOT recreate the order, the cart stays consumed, and My orders shows the real order', async () => {
    const b = new FakeCommerceBackend();
    await seedDevice(b, EMAIL);
    const uid = b.users.get(EMAIL)!.id;
    b.addresses.set(uid, [ADDR('a1', 'Home')]);
    b.carts.set(uid, [{ id: 'seed-1', productId: 'p-1', variantId: 'v-1', quantity: 2 }]);
    const first = mountApp(b);
    fireEvent.press(await screen.findByRole('button', { name: /^Cart/ }));
    fireEvent.press(await screen.findByRole('button', { name: 'Continue to checkout' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Deliver to Home' }));
    await screen.findByText('Review your order');
    b.loseNextOrderResponse = true;
    press('Place order');
    await screen.findByText(/could not confirm whether/);
    expect(b.orders.get(uid)!.length).toBe(1); // the server created the order; the app never learned it
    expect(orderPosts(b).length).toBe(1);

    first.unmount(); // the process dies: the in-memory attempt (and its key) is lost

    mountApp(b); // restart: a brand-new provider / store; the stored session restores
    await screen.findByLabelText('Menu tab');
    expect(orderPosts(b).length).toBe(1); // NOTHING was re-sent automatically
    fireEvent.press(await screen.findByRole('button', { name: /^Cart/ }));
    expect(await screen.findByText('Your cart is empty')).toBeTruthy(); // the cart was consumed with the order: no blind duplicate is possible
    expect(screen.queryByText(/could not confirm whether/)).toBeNull();
    await tab('Orders');
    expect(await screen.findByRole('button', { name: /^Order PB-261013-T/ })).toBeTruthy();
    expect(b.orders.get(uid)!.length).toBe(1);
  });

  it('after the restart a brand-new key cannot create a second order from the consumed cart (the server answers EMPTY_CART)', async () => {
    const b = new FakeCommerceBackend();
    await seedDevice(b, EMAIL);
    const uid = b.users.get(EMAIL)!.id;
    b.addresses.set(uid, [ADDR('a1', 'Home')]);
    b.carts.set(uid, [{ id: 'seed-1', productId: 'p-1', variantId: 'v-1', quantity: 1 }]);
    const store = new CheckoutAttemptStore(() => 'IK-before-death-001');
    const view = await mountCheckoutDirect(b, store, 'a1');
    await screen.findByText('Review your order');
    b.loseNextOrderResponse = true;
    press('Place order');
    await screen.findByText(/could not confirm whether/);
    view.unmount();
    // process death: a NEW store (new key source) re-opens checkout for the same address with the cart already consumed
    const reborn = new CheckoutAttemptStore(() => 'IK-after-death-0002');
    await mountCheckoutDirect(b, reborn, 'a1');
    expect(await screen.findByText('Your cart is empty.')).toBeTruthy();
    expect(orderPosts(b).length).toBe(0); // (the restart cleared the traffic log) no new order request was sent
    expect(b.orders.get(uid)!.length).toBe(1); // still exactly the one order
  });
});
