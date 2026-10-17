import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

/**
 * P11C-1: the development-only native harness. The REAL native module cannot run under Jest (that is what the physical device test is
 * for); these tests prove the JavaScript behaviour around it: dev-only exposure, test-key-only, no secrets, field presence as booleans,
 * and no persistence of callback evidence.
 */
const mockAvailable = jest.fn();
const mockOpen = jest.fn();
jest.mock('../src/payments/razorpayBridge', () => ({
  isRazorpayNativeAvailable: () => mockAvailable(),
  openRazorpayCheckoutWithPresence: (...a: unknown[]) => mockOpen(...a)
}));

const TEST_KEY = 'rzp_' + 'test_AAAAAAAAAAAAAA'; // concatenated so no key-shaped literal sits in the repo
const LIVE_KEY = 'rzp_' + 'live_AAAAAAAAAAAAAA';
const LABEL = 'Open Razorpay Test Checkout';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RazorpayTestScreen: Harness } = require('../src/screens/dev/RazorpayTestScreen') as typeof import('../src/screens/dev/RazorpayTestScreen');
// The Expo Babel preset inlines EXPO_PUBLIC_* at transform time, so tests pass the public key id as a prop.
function loadHarness(key: string | undefined) {
  return ({ onClose }: { onClose: () => void }) => <Harness onClose={onClose} keyId={key ?? ''} />;
}

const isDisabled = () => screen.getByLabelText(LABEL).props.accessibilityState.disabled === true;

beforeEach(() => {
  mockAvailable.mockReset().mockReturnValue(true);
  mockOpen.mockReset();
});

describe('availability and key handling', () => {
  it('reports the native bridge as UNAVAILABLE (Expo Go) and cannot open a checkout', () => {
    mockAvailable.mockReturnValue(false);
    const H = loadHarness(TEST_KEY);
    render(<H onClose={() => {}} />);
    expect(screen.getByText(/Native bridge: UNAVAILABLE/)).toBeTruthy();
    expect(isDisabled()).toBe(true);
    fireEvent.press(screen.getByLabelText(LABEL));
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('reports AVAILABLE when the native module is present', () => {
    const H = loadHarness(TEST_KEY);
    render(<H onClose={() => {}} />);
    expect(screen.getByText(/Native bridge: AVAILABLE/)).toBeTruthy();
    expect(isDisabled()).toBe(false);
  });

  it('a missing key id disables the button and says so', () => {
    const H = loadHarness(undefined);
    render(<H onClose={() => {}} />);
    expect(screen.getByText(/Test key id: MISSING/)).toBeTruthy();
    expect(isDisabled()).toBe(true);
  });

  it('REFUSES a live-mode key id: the harness can never open a live checkout', () => {
    const H = loadHarness(LIVE_KEY);
    render(<H onClose={() => {}} />);
    expect(screen.getByText(/REFUSED/)).toBeTruthy();
    expect(isDisabled()).toBe(true);
    fireEvent.press(screen.getByLabelText(LABEL));
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('an invalid order id disables the button', () => {
    const H = loadHarness(TEST_KEY);
    render(<H onClose={() => {}} />);
    fireEvent.changeText(screen.getByLabelText('Test order id (optional)'), 'order 1; drop');
    expect(screen.getByText('Use letters, digits and underscores only.')).toBeTruthy();
    expect(isDisabled()).toBe(true);
  });
});

describe('checkout invocation', () => {
  it('order-less: opens the REAL bridge with the public key, INR 1.00 and no order id', async () => {
    mockOpen.mockResolvedValue({ outcome: { kind: 'MALFORMED_RESULT' }, presence: { paymentIdPresent: true, orderIdPresent: false, signaturePresent: false } });
    const H = loadHarness(TEST_KEY);
    render(<H onClose={() => {}} />);
    fireEvent.press(screen.getByLabelText(LABEL));
    await waitFor(() => expect(screen.getByText(/paymentIdPresent: yes/)).toBeTruthy());
    expect(mockOpen).toHaveBeenCalledTimes(1);
    const options = mockOpen.mock.calls[0][0];
    expect(options).toEqual({ key: TEST_KEY, amount: 100, currency: 'INR', name: 'Protein Bowl (test)', description: 'Native SDK test, not an order' });
    expect('order_id' in options).toBe(false);
    expect(screen.getByText(/orderIdPresent: no/)).toBeTruthy();
    expect(screen.getByText(/signaturePresent: no/)).toBeTruthy();
    expect(screen.getByText(/PARTIAL PAYLOAD/)).toBeTruthy();
  });

  it('with a test order id: it is passed through unchanged', async () => {
    mockOpen.mockResolvedValue({ outcome: { kind: 'ERROR', code: 2, description: 'cancelled' }, presence: null });
    const H = loadHarness(TEST_KEY);
    render(<H onClose={() => {}} />);
    fireEvent.changeText(screen.getByLabelText('Test order id (optional)'), '  order_ABC123  ');
    fireEvent.press(screen.getByLabelText(LABEL));
    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
    expect(mockOpen.mock.calls[0][0].order_id).toBe('order_ABC123');
  });
});

describe('what the screen shows', () => {
  it('SUCCESS shows only booleans: the payment id, order id and signature values are NEVER rendered', async () => {
    mockOpen.mockResolvedValue({
      outcome: { kind: 'SUCCESS', evidence: { razorpayPaymentId: 'pay_SECRETVALUE1', razorpayOrderId: 'order_SECRETVALUE2', razorpaySignature: 'f'.repeat(64) } },
      presence: { paymentIdPresent: true, orderIdPresent: true, signaturePresent: true }
    });
    const H = loadHarness(TEST_KEY);
    render(<H onClose={() => {}} />);
    fireEvent.press(screen.getByLabelText(LABEL));
    await waitFor(() => expect(screen.getByText(/SUCCESS:/)).toBeTruthy());
    expect(screen.getByText(/signaturePresent: yes/)).toBeTruthy();
    const everything = JSON.stringify(screen.toJSON());
    expect(everything).not.toMatch(/SECRETVALUE|ffffffff/);
  });

  it('a failure / dismissal is an ERROR callback with its code and description, clearly not a success', async () => {
    mockOpen.mockResolvedValue({ outcome: { kind: 'ERROR', code: 2, description: 'Payment cancelled by user' }, presence: null });
    const H = loadHarness(TEST_KEY);
    render(<H onClose={() => {}} />);
    fireEvent.press(screen.getByLabelText(LABEL));
    await waitFor(() => expect(screen.getByText(/ERROR callback/)).toBeTruthy());
    expect(screen.getByText(/code: 2/)).toBeTruthy();
    expect(screen.getByText(/description: Payment cancelled by user/)).toBeTruthy();
    expect(screen.queryByText(/SUCCESS:/)).toBeNull();
    expect(screen.queryByText(/paymentIdPresent/)).toBeNull();
  });

  it('the result lives in memory only: it is cleared on request and gone after the panel is closed and reopened', async () => {
    mockOpen.mockResolvedValue({ outcome: { kind: 'ERROR', code: 0, description: 'x' }, presence: null });
    const H = loadHarness(TEST_KEY);
    const first = render(<H onClose={() => {}} />);
    fireEvent.press(screen.getByLabelText(LABEL));
    await waitFor(() => expect(screen.getByText(/ERROR callback/)).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Clear result'));
    expect(screen.queryByText(/ERROR callback/)).toBeNull();
    fireEvent.press(screen.getByLabelText(LABEL));
    await waitFor(() => expect(screen.getByText(/ERROR callback/)).toBeTruthy());
    first.unmount();
    render(<H onClose={() => {}} />);
    expect(screen.queryByText(/ERROR callback/)).toBeNull();
  });

  it('a double press opens only one checkout', async () => {
    let finish!: (v: unknown) => void;
    mockOpen.mockReturnValue(new Promise((r) => (finish = r)));
    const H = loadHarness(TEST_KEY);
    render(<H onClose={() => {}} />);
    fireEvent.press(screen.getByLabelText(LABEL));
    fireEvent.press(screen.getByLabelText(LABEL));
    expect(mockOpen).toHaveBeenCalledTimes(1);
    finish({ outcome: { kind: 'ERROR', code: 0, description: null }, presence: null });
    await waitFor(() => expect(screen.getByText(/ERROR callback/)).toBeTruthy());
  });
});

describe('development-only exposure (Account screen)', () => {
  function renderAccount(dev: boolean) {
    jest.resetModules();
    (global as unknown as { __DEV__: boolean }).__DEV__ = dev;
    const harnessLoaded = jest.fn();
    jest.doMock('../src/auth/AuthProvider', () => ({
      useAuth: () => ({ manager: { signOut: async () => {} }, state: { status: 'signedIn', user: { fullName: 'Test Customer', email: 'customer@example.test' } } })
    }));
    jest.doMock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: () => {} }) }));
    jest.doMock('../src/screens/dev/RazorpayTestScreen', () => {
      harnessLoaded();
      const { Text } = require('react-native');
      const R = require('react');
      return { RazorpayTestScreen: () => R.createElement(Text, null, 'HARNESS OPEN') };
    });
    const R = require('react');
    const rtl = require('@testing-library/react-native/pure');
    const { AccountScreen } = require('../src/screens/AccountScreen');
    rtl.render(R.createElement(AccountScreen));
    return { rtl, harnessLoaded };
  }

  afterEach(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
    jest.dontMock('../src/auth/AuthProvider');
    jest.dontMock('@react-navigation/native');
    jest.dontMock('../src/screens/dev/RazorpayTestScreen');
    jest.resetModules();
  });

  it('in a development build the entry is present and opens the harness', () => {
    const { rtl, harnessLoaded } = renderAccount(true);
    expect(harnessLoaded).toHaveBeenCalled();
    fireEvent_press(rtl, 'P11C-1 Razorpay Test');
    expect(rtl.screen.getByText('HARNESS OPEN')).toBeTruthy();
  });

  it('in a PRODUCTION build (__DEV__ false) the entry is absent and the harness module is never even loaded', () => {
    const { rtl, harnessLoaded } = renderAccount(false);
    expect(rtl.screen.queryByLabelText('P11C-1 Razorpay Test')).toBeNull();
    expect(harnessLoaded).not.toHaveBeenCalled();
    expect(rtl.screen.getByLabelText('Sign out')).toBeTruthy();
  });
});

function fireEvent_press(rtl: typeof import('@testing-library/react-native'), label: string) {
  rtl.fireEvent.press(rtl.screen.getByLabelText(label));
}
