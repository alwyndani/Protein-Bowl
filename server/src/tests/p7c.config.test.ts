import { describe, it, expect } from 'vitest';
import { PaymentConfigError, parsePaymentConfig } from '../config/paymentConfig.js';
import { rejectionProvesNoRefund } from '../modules/refund/refund.service.js';

const RZP = { PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_unit', RAZORPAY_KEY_SECRET: 'unit-key-secret', RAZORPAY_WEBHOOK_SECRET: 'unit-webhook-secret' };

describe('P7C configuration: PAYMENT_REFUND_INLINE_SUBMIT is a latency switch with no hidden production default', () => {
  it('production REQUIRES an explicit value (fail closed)', () => {
    expect(() => parsePaymentConfig(RZP, 'production')).toThrow(/PAYMENT_REFUND_INLINE_SUBMIT must be set explicitly in production/);
    expect(() => parsePaymentConfig({ ...RZP, PAYMENT_REFUND_INLINE_SUBMIT: '   ' }, 'production')).toThrow(PaymentConfigError);
    expect(parsePaymentConfig({ ...RZP, PAYMENT_REFUND_INLINE_SUBMIT: 'true' }, 'production').refundInlineSubmit).toBe(true);
    expect(parsePaymentConfig({ ...RZP, PAYMENT_REFUND_INLINE_SUBMIT: 'false' }, 'production').refundInlineSubmit).toBe(false);
  });

  it('only the exact words true / false are accepted anywhere; development and test default to true', () => {
    for (const bad of ['yes', '1', 'on', 'TRUEISH', 'no']) {
      expect(() => parsePaymentConfig({ PAYMENT_REFUND_INLINE_SUBMIT: bad }, 'development'), bad).toThrow(/exactly true or false/);
    }
    expect(parsePaymentConfig({}, 'development').refundInlineSubmit).toBe(true);
    expect(parsePaymentConfig({}, 'test').refundInlineSubmit).toBe(true);
    expect(parsePaymentConfig({ PAYMENT_REFUND_INLINE_SUBMIT: ' FALSE ' }, 'development').refundInlineSubmit).toBe(false);
  });

  it('the setting touches nothing else in the configuration', () => {
    const on = parsePaymentConfig({ ...RZP, PAYMENT_REFUND_INLINE_SUBMIT: 'true' }, 'production');
    const off = parsePaymentConfig({ ...RZP, PAYMENT_REFUND_INLINE_SUBMIT: 'false' }, 'production');
    expect({ ...on, refundInlineSubmit: false }).toEqual(off);
  });
});

describe('P7C unit: which provider rejections PROVE that no refund was created', () => {
  it('accepts only documented "nothing created" rejections', () => {
    for (const text of [
      'The payment status should be captured for action to be taken.',
      'The refund amount provided is greater than amount captured.',
      'The amount must be at least INR 1.00.',
      'The amount must be an integer.',
      'Amount cannot be blank.',
      'Your account does not have enough balance to carry out the refund operation.',
      'Refund is currently not supported for this payment method.',
      'Refunds cannot be created on your account.'
    ]) expect(rejectionProvesNoRefund(text), text).toBe(true);
  });

  it('refuses everything that could mean "a refund exists" or that it does not recognise', () => {
    // a text that MIXES a documented phrase with a duplicate/already marker is still not proof (the disqualifier is independent of the allow-list)
    expect(rejectionProvesNoRefund('Duplicate receipt found; the amount must be at least INR 1.00.')).toBe(false);
    expect(rejectionProvesNoRefund('The payment status should be captured, refund already processed.')).toBe(false);
    for (const text of ['Duplicate receipt found for this refund request.', 'The payment has been fully refunded already.', 'Refund has already been processed.', 'Concurrent operation in progress.', 'something new we have never seen', '', null, undefined]) {
      expect(rejectionProvesNoRefund(text as string | null | undefined), String(text)).toBe(false);
    }
  });
});
