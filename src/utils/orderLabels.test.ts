import { describe, expect, it } from 'vitest';
import { paymentBadge } from './orderLabels';

describe('paymentBadge precedence', () => {
  it('a refunded order shows "Refunded", not "Paid", even though the server summary keeps state PAID (found in the P7D browser E2E)', () => {
    expect(paymentBadge({ status: 'CANCELLED', paymentStatus: 'REFUNDED', payment: { state: 'PAID', canStartPayment: false } }).label).toBe('Refunded');
  });

  it('a paid order still shows "Paid"; a cancelled unpaid order shows no payment taken', () => {
    expect(paymentBadge({ status: 'CONFIRMED', paymentStatus: 'PAID', payment: { state: 'PAID', canStartPayment: false } }).label).toBe('Paid');
    expect(paymentBadge({ status: 'CANCELLED', paymentStatus: 'PENDING', payment: { state: 'NOT_STARTED', canStartPayment: false } }).label).toBe('No payment taken');
  });
});
