import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../services/apiClient';
import { describeError, isSessionExpired } from './paymentErrors';
import { SUPPORT_COPY } from './orderLabels';

const e = (code: string, status?: number, message = 'RAW SERVER TEXT should never be shown') => new ApiRequestError(message, code, status);

describe('financial error mapping (code -> safe copy)', () => {
  const table: Array<[string, number, string, RegExp]> = [
    ['PAYMENT_ALREADY_COMPLETED', 409, 'REFRESH_ORDER', /already been paid/i],
    ['ORDER_NOT_PAYABLE', 409, 'REFRESH_ORDER', /no longer be paid online/i],
    ['PAYMENT_ATTEMPT_IN_PROGRESS', 409, 'CONFIRMING', /do not pay again yet/i],
    ['PAYMENT_AMOUNT_TOO_SMALL', 422, 'NONE', /too small/i],
    ['PAYMENT_PROVIDER_UNAVAILABLE', 503, 'RETRY', /no payment was taken/i],
    ['PAYMENT_VERIFICATION_FAILED', 400, 'REFRESH_ORDER', /do not pay again/i],
    ['PAYMENT_AMOUNT_MISMATCH', 422, 'SUPPORT', /do not pay again/i],
    ['PAYMENT_CURRENCY_MISMATCH', 422, 'SUPPORT', /do not pay again/i],
    ['PAYMENT_ATTEMPT_NOT_FOUND', 404, 'REFRESH_ORDER', /no longer available/i],
    ['CANCELLATION_NOT_ALLOWED', 409, 'REFRESH_ORDER', /no longer be cancelled/i],
    ['CANCELLATION_STATE_NOT_SUPPORTED', 409, 'REFRESH_ORDER', /no longer be cancelled/i],
    ['ORDER_NOT_CANCELLABLE', 409, 'REFRESH_ORDER', /no longer be cancelled/i],
    ['EXTERNAL_REFUND_PRESENT', 409, 'SUPPORT', /manual review/i],
    ['REFUND_ALREADY_EXISTS', 409, 'REFRESH_ORDER', /refund for this order already exists/i],
    ['TOO_MANY_REQUESTS', 429, 'RETRY', /too many attempts/i],
    ['VALIDATION_ERROR', 422, 'INLINE', /check the details/i],
    ['UNAUTHORIZED', 401, 'SIGN_IN', /session has expired/i],
    ['NETWORK_ERROR', 0, 'RETRY', /could not reach the server/i]
  ];
  for (const [code, status, action, copy] of table) {
    it(`${code} -> ${action}, with safe copy and without the raw server text`, () => {
      const r = describeError(e(code, status === 0 ? undefined : status));
      expect(r.action).toBe(action);
      expect(r.message).toMatch(copy);
      expect(r.message).not.toContain('RAW SERVER TEXT');
    });
  }

  it('401 always means "sign in again" whatever the code; 429 always means "wait", whatever the code', () => {
    expect(describeError(e('WHATEVER', 401)).action).toBe('SIGN_IN');
    expect(describeError(e('WHATEVER', 429)).action).toBe('RETRY');
    expect(isSessionExpired(e('X', 401))).toBe(true);
    expect(isSessionExpired(e('X', 409))).toBe(false);
  });

  it('every 5xx (and any unexpected error) gets the generic copy; raw / provider text never leaks', () => {
    for (const status of [500, 502, 503, 504]) {
      const r = describeError(e('SOMETHING_WEIRD', status, 'provider says: BAD_REQUEST_ERROR card 4242'));
      expect(r.message).toBe('Something went wrong on our side. Please try again in a moment.');
    }
    expect(describeError(new Error('TypeError: x is undefined at app.js:1')).message).not.toMatch(/TypeError/);
    expect(describeError('a string').message).not.toMatch(/a string/);
  });

  it('404 / 403 / unknown 4xx are generic and never reveal whether an order exists', () => {
    expect(describeError(e('NOT_FOUND', 404)).message).toBe('Order not found.');
    expect(describeError(e('ORDER_NOT_FOUND', 404)).message).toBe('Order not found.');
    expect(describeError(e('MYSTERY', 404)).message).toBe('Order not found.');
    expect(describeError(e('FORBIDDEN', 403)).message).toMatch(/not available for your account/i);
    expect(describeError(e('MYSTERY', 418)).message).toBe('We could not complete that request.');
  });

  it('only a tiny allow-list of customer-safe validation codes passes the server wording through (4xx only)', () => {
    const r = describeError(e('MINIMUM_ORDER_NOT_MET', 422, 'The minimum order is ₹250.00; add ₹51.00 more to continue'));
    expect(r.message).toContain('The minimum order is ₹250.00');
    expect(describeError(e('MINIMUM_ORDER_NOT_MET', 500, 'leaky')).message).not.toContain('leaky');
    expect(describeError(e('PAYMENT_PROVIDER_ERROR_RAW', 422, 'razorpay_signature mismatch for pay_123')).message).not.toMatch(/razorpay|pay_123/);
  });

  it('support copy is centralised and honest: no invented contact details', () => {
    expect(SUPPORT_COPY).toBe('Please contact Protein Bowl support.');
    expect(SUPPORT_COPY).not.toMatch(/@|\d{5,}|https?:/);
    expect(describeError(e('PAYMENT_AMOUNT_MISMATCH', 422)).message).toContain(SUPPORT_COPY);
  });
});
