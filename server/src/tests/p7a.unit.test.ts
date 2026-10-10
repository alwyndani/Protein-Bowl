import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoleEnum } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  COMMERCE_ENV_KEYS,
  CommercePolicyConfigError,
  DEVELOPMENT_EXAMPLE_VALUES,
  TECHNICAL_MAX_CART_UNITS,
  TECHNICAL_MAX_LINE_QUANTITY,
  buildCommercePolicy,
  buildPricingSnapshot,
  getCommercePolicy,
  parseCommercePolicy,
  resetCommercePolicyProvider,
  setCommercePolicyProvider
} from '../config/commercePolicy.js';
import { PricingService, PricingItemInput } from '../modules/commerce/pricing.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { IDEMPOTENCY_KEY_PATTERN, computeRequestFingerprint, resolveIdempotencyKey } from '../modules/order/idempotency.js';
import { generateOrderNumber, setOrderNumberGenerator } from '../modules/order/orderNumber.js';
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  OrderStatus,
  TERMINAL_ORDER_STATUSES,
  TRANSITION_PARTIES,
  transitionKey
} from '../modules/order/orderStatus.js';

// A complete, explicit production-style configuration (TEST VALUES - not Protein Bowl policy).
const FULL: Record<string, string> = {
  COMMERCE_TAX_MODE: 'EXCLUSIVE',
  COMMERCE_DELIVERY_FEE: '25.00',
  COMMERCE_FREE_DELIVERY_ENABLED: 'true',
  COMMERCE_FREE_DELIVERY_THRESHOLD: '300.00',
  COMMERCE_PACKAGING_FEE: '0',
  COMMERCE_MIN_ORDER_VALUE: '0',
  COMMERCE_DELIVERY_TAXABLE: 'false',
  COMMERCE_PACKAGING_TAXABLE: 'false',
  COMMERCE_MAX_LINE_QUANTITY: '10',
  COMMERCE_MAX_CART_UNITS: '30',
  COMMERCE_COD_ENABLED: 'false'
};
const without = (key: string) => {
  const { [key]: _omit, ...rest } = FULL;
  return rest;
};
const parse = (raw: Record<string, string | undefined>, env = 'production') => parseCommercePolicy(raw, env);
const policy = (over: Partial<Record<(typeof COMMERCE_ENV_KEYS)[number], string>> = {}) => buildCommercePolicy({ ...FULL, ...over });
const item = (over: Partial<PricingItemInput> = {}): PricingItemInput => ({
  productId: 'p1',
  itemTitle: 'Bowl',
  unitPrice: '100.00',
  quantity: 1,
  taxRate: '0.05',
  ...over
});

describe('P7A CommercePolicy — configuration validation', () => {
  it('production refuses to start without any commerce configuration (no silent fallback to old assumptions)', () => {
    expect(() => parse({})).toThrow(CommercePolicyConfigError);
    expect(() => parse({})).toThrow(/must be set explicitly in production/);
  });

  it('production names the first missing value', () => {
    for (const key of COMMERCE_ENV_KEYS) {
      if (key === 'COMMERCE_FREE_DELIVERY_THRESHOLD') continue; // only required when free delivery is enabled
      expect(() => parse(without(key))).toThrow(new RegExp(key));
    }
  });

  it('production accepts a complete explicit configuration and marks the source ENVIRONMENT', () => {
    const p = parse(FULL);
    expect(p.source).toBe('ENVIRONMENT');
    expect(p.deliveryFee.toFixed(2)).toBe('25.00');
    expect(p.freeDelivery).toEqual({ enabled: true, threshold: expect.anything() });
    expect(p.maxLineQuantity).toBe(10);
    expect(p.codEnabled).toBe(false);
  });

  it('development falls back to clearly labelled development example values', () => {
    const p = parse({}, 'development');
    expect(p.source).toBe('DEVELOPMENT_DEFAULTS');
    expect(buildPricingSnapshot(p).policySource).toBe('DEVELOPMENT_DEFAULTS');
    expect(p.taxMode).toBe(DEVELOPMENT_EXAMPLE_VALUES.COMMERCE_TAX_MODE);
  });

  it('the development example values are NOT the retired production assumptions', () => {
    expect(DEVELOPMENT_EXAMPLE_VALUES.COMMERCE_DELIVERY_FEE).not.toBe('40.00');
    expect(DEVELOPMENT_EXAMPLE_VALUES.COMMERCE_FREE_DELIVERY_THRESHOLD).not.toBe('499.00');
  });

  it.each(['abc', '12.345', '-5', '1e3', '٣', '12,50', ' ', '5.'])('rejects malformed monetary value %j', (bad) => {
    expect(() => parse({ ...FULL, COMMERCE_DELIVERY_FEE: bad })).toThrow(CommercePolicyConfigError);
  });

  it('rejects a negative fee and a negative packaging fee / minimum order', () => {
    expect(() => parse({ ...FULL, COMMERCE_DELIVERY_FEE: '-1' })).toThrow(/non-negative/);
    expect(() => parse({ ...FULL, COMMERCE_PACKAGING_FEE: '-0.01' })).toThrow(CommercePolicyConfigError);
    expect(() => parse({ ...FULL, COMMERCE_MIN_ORDER_VALUE: '-10' })).toThrow(CommercePolicyConfigError);
  });

  it('a configured ZERO packaging fee / delivery fee is valid and explicit in production (zero is not "missing")', () => {
    const p = parse({ ...FULL, COMMERCE_PACKAGING_FEE: '0', COMMERCE_DELIVERY_FEE: '0.00' });
    expect(p.packagingFee.isZero()).toBe(true);
    expect(p.deliveryFee.isZero()).toBe(true);
    expect(p.source).toBe('ENVIRONMENT');
  });

  it('free delivery can be DISABLED explicitly (no magic sentinel); a threshold while disabled is a configuration error', () => {
    const { COMMERCE_FREE_DELIVERY_THRESHOLD: _t, ...rest } = FULL;
    const disabled = parse({ ...rest, COMMERCE_FREE_DELIVERY_ENABLED: 'false' });
    expect(disabled.freeDelivery).toEqual({ enabled: false, threshold: null });
    expect(() => parse({ ...FULL, COMMERCE_FREE_DELIVERY_ENABLED: 'false' })).toThrow(/remove one of them/);
  });

  it('an enabled free-delivery threshold must be greater than zero and be present', () => {
    expect(() => parse({ ...FULL, COMMERCE_FREE_DELIVERY_THRESHOLD: '0' })).toThrow(/greater than 0/);
    expect(() => parse(without('COMMERCE_FREE_DELIVERY_THRESHOLD'))).toThrow(/COMMERCE_FREE_DELIVERY_THRESHOLD/);
  });

  it('minimum order: zero disables it, a positive value enables it', () => {
    expect(parse({ ...FULL, COMMERCE_MIN_ORDER_VALUE: '0' }).minimumOrderValue.isZero()).toBe(true);
    expect(parse({ ...FULL, COMMERCE_MIN_ORDER_VALUE: '199.00' }).minimumOrderValue.toFixed(2)).toBe('199.00');
  });

  it('only EXCLUSIVE tax is supported: INCLUSIVE and unknown modes fail startup instead of pretending to work', () => {
    expect(() => parse({ ...FULL, COMMERCE_TAX_MODE: 'INCLUSIVE' })).toThrow(/not supported/);
    expect(() => parse({ ...FULL, COMMERCE_TAX_MODE: 'gst' })).toThrow(CommercePolicyConfigError);
    expect(() => parse({ ...FULL, COMMERCE_TAX_MODE: 'exclusive' })).toThrow(CommercePolicyConfigError); // exact, case-sensitive
  });

  it('taxable delivery/packaging fees are rejected (only the untaxed fee mode exists today)', () => {
    expect(() => parse({ ...FULL, COMMERCE_DELIVERY_TAXABLE: 'true' })).toThrow(/not supported/);
    expect(() => parse({ ...FULL, COMMERCE_PACKAGING_TAXABLE: 'true' })).toThrow(/not supported/);
    expect(() => parse({ ...FULL, COMMERCE_DELIVERY_TAXABLE: 'maybe' })).toThrow(/"true" or "false"/);
  });

  it('quantity caps are validated: whole numbers, within the technical ceilings, cart >= line', () => {
    for (const bad of ['0', '-1', '2.5', 'x', String(TECHNICAL_MAX_LINE_QUANTITY + 1)]) {
      expect(() => parse({ ...FULL, COMMERCE_MAX_LINE_QUANTITY: bad })).toThrow(CommercePolicyConfigError);
    }
    expect(() => parse({ ...FULL, COMMERCE_MAX_CART_UNITS: String(TECHNICAL_MAX_CART_UNITS + 1) })).toThrow(CommercePolicyConfigError);
    expect(() => parse({ ...FULL, COMMERCE_MAX_LINE_QUANTITY: '10', COMMERCE_MAX_CART_UNITS: '5' })).toThrow(/must not be smaller/);
  });

  it('COD flag must be a strict boolean', () => {
    expect(parse({ ...FULL, COMMERCE_COD_ENABLED: 'true' }).codEnabled).toBe(true);
    expect(() => parse({ ...FULL, COMMERCE_COD_ENABLED: 'yes' })).toThrow(CommercePolicyConfigError);
  });

  it('the policy object is frozen and tests can inject a deterministic policy that is refused in production', () => {
    const injected = policy({ COMMERCE_DELIVERY_FEE: '12.00' });
    expect(injected.source).toBe('INJECTED');
    expect(Object.isFrozen(injected)).toBe(true);

    setCommercePolicyProvider({ getPolicy: () => injected });
    expect(getCommercePolicy().deliveryFee.toFixed(2)).toBe('12.00');
    resetCommercePolicyProvider();
    expect(getCommercePolicy().deliveryFee.toFixed(2)).toBe('40.00'); // the test environment's own explicit fixture value

    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => setCommercePolicyProvider({ getPolicy: () => injected })).toThrow(/cannot be replaced in production/);
      expect(() => setOrderNumberGenerator(() => 'X')).toThrow(/cannot be replaced in production/);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('P7A pricing snapshot', () => {
  it('records the rules applied, never environment variable names or secrets', () => {
    const snap = buildPricingSnapshot(policy());
    const text = JSON.stringify(snap);
    expect(text).not.toMatch(/COMMERCE_|process\.env|secret|password/i);
    expect(snap.tax).toEqual({ mode: 'EXCLUSIVE', rounding: 'LINE_HALF_UP', deliveryTaxable: false, packagingTaxable: false });
    expect(snap.deliveryFee).toBe('25.00');
    expect(snap.freeDelivery).toEqual({ enabled: true, threshold: '300.00', basis: 'ITEMS_SUBTOTAL' });
    expect(snap.minimumOrder).toEqual({ enabled: false, requiredAmount: '0.00', basis: 'ITEMS_SUBTOTAL' });
    expect(snap.quantityLimits).toEqual({ maxLineQuantity: 10, maxCartUnits: 30 });
    expect(snap.policyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the policy hash is deterministic and changes whenever any rule changes', () => {
    const base = buildPricingSnapshot(policy()).policyHash;
    expect(buildPricingSnapshot(policy()).policyHash).toBe(base);
    expect(buildPricingSnapshot(policy({ COMMERCE_DELIVERY_FEE: '26.00' })).policyHash).not.toBe(base);
    expect(buildPricingSnapshot(policy({ COMMERCE_MIN_ORDER_VALUE: '100' })).policyHash).not.toBe(base);
    expect(buildPricingSnapshot(policy({ COMMERCE_COD_ENABLED: 'true' })).policyHash).not.toBe(base);
  });
});

describe('P7A PricingService — deterministic, policy-driven, Decimal-safe', () => {
  const p = policy({ COMMERCE_PACKAGING_FEE: '5.00' });

  it('EXCLUSIVE tax is added on top; the fee/threshold come from the policy, not the code', () => {
    const r = PricingService.calculatePricing([item({ unitPrice: '149.00', quantity: 1 })], p);
    expect(r.subtotal).toBe(149);
    expect(r.taxAmount).toBe(7.45);
    expect(r.deliveryFee).toBe(25);
    expect(r.packagingFee).toBe(5);
    expect(r.netAmount).toBe(186.45); // 149 + 7.45 + 5 + 25
  });

  it('rounds tax HALF_UP per line and sums the ROUNDED lines (order tax equals the sum of persisted line taxes)', () => {
    // 10.10 x 5% = 0.505 -> 0.51 per line. Two lines: 1.02 (not the unrounded-sum 1.01).
    const r = PricingService.calculatePricing([item({ productId: 'a', unitPrice: '10.10' }), item({ productId: 'b', unitPrice: '10.10' })], p);
    expect(r.items.map((i) => i.taxAmount)).toEqual([0.51, 0.51]);
    expect(r.taxAmount).toBe(1.02);
    expect(r.items.reduce((s, i) => s + i.taxAmount, 0)).toBeCloseTo(r.taxAmount, 10);
  });

  it('is exact where binary floating point is not (0.10 x 3 = 0.30, 0.1 + 0.2 pricing)', () => {
    const flat = buildCommercePolicy({ ...FULL, COMMERCE_DELIVERY_FEE: '0', COMMERCE_FREE_DELIVERY_ENABLED: 'false', COMMERCE_FREE_DELIVERY_THRESHOLD: '' });
    const r = PricingService.calculatePricing([item({ unitPrice: '0.10', quantity: 3, taxRate: 0 }), item({ productId: 'b', unitPrice: '0.20', taxRate: 0 })], flat);
    expect(r.subtotal).toBe(0.5);
    expect(r.netAmount).toBe(0.5);
  });

  it('free delivery applies at EXACTLY the threshold and not below it', () => {
    expect(PricingService.calculatePricing([item({ unitPrice: '299.99', taxRate: 0 })], p).deliveryFee).toBe(25);
    expect(PricingService.calculatePricing([item({ unitPrice: '300.00', taxRate: 0 })], p).deliveryFee).toBe(0);
    expect(PricingService.calculatePricing([item({ unitPrice: '300.01', taxRate: 0 })], p).deliveryFee).toBe(0);
  });

  it('a disabled free-delivery rule never waives the fee, however large the cart', () => {
    const noFree = buildCommercePolicy({ ...FULL, COMMERCE_FREE_DELIVERY_ENABLED: 'false', COMMERCE_FREE_DELIVERY_THRESHOLD: '' });
    expect(PricingService.calculatePricing([item({ unitPrice: '5000.00', taxRate: 0, quantity: 2 })], noFree).deliveryFee).toBe(25);
  });

  it('packaging is an order-level flat fee, is not taxed, and ZERO is a valid configured value', () => {
    const zero = policy({ COMMERCE_PACKAGING_FEE: '0' });
    expect(PricingService.calculatePricing([item()], zero).packagingFee).toBe(0);
    const r = PricingService.calculatePricing([item({ unitPrice: '100.00', taxRate: 0.05 })], p);
    expect(r.taxAmount).toBe(5); // tax only on the item, never on packaging or delivery
  });

  it('container deposits are added untaxed', () => {
    const r = PricingService.calculatePricing([item({ unitPrice: '100.00', containerDeposit: '10.00', quantity: 2 })], p);
    expect(r.containerDepositTotal).toBe(20);
    expect(r.taxAmount).toBe(10);
  });

  it('REJECTS zero, negative, fractional and non-numeric quantities (never coerces to 1)', () => {
    for (const q of [0, -1, 1.5, Number.NaN, '2' as unknown as number, null as unknown as number]) {
      expect(() => PricingService.calculatePricing([item({ quantity: q })], p)).toThrowError(expect.objectContaining({ errorCode: 'INVALID_QUANTITY' }));
    }
  });

  it('enforces the per-line and whole-cart unit limits from the policy', () => {
    expect(() => PricingService.calculatePricing([item({ quantity: 11 })], p)).toThrowError(expect.objectContaining({ errorCode: 'MAX_LINE_QUANTITY_EXCEEDED' }));
    const many = [1, 2, 3, 4].map((n) => item({ productId: `p${n}`, quantity: 10 }));
    expect(() => PricingService.calculatePricing(many, p)).toThrowError(expect.objectContaining({ errorCode: 'MAX_CART_QUANTITY_EXCEEDED' }));
    expect(() => PricingService.calculatePricing(many.slice(0, 3), p)).not.toThrow();
  });

  it('has NO fallback tax rate: a missing/invalid rate is rejected, a rate of 0 is a legitimate explicit value', () => {
    for (const bad of [undefined, null, '', 'abc', -0.1, 1.5]) {
      expect(() => PricingService.calculatePricing([item({ taxRate: bad as never })], p)).toThrowError(expect.objectContaining({ errorCode: 'PRODUCT_TAX_NOT_CONFIGURED' }));
    }
    expect(PricingService.calculatePricing([item({ taxRate: 0 })], p).taxAmount).toBe(0);
    expect(PricingService.calculatePricing([item({ taxRate: '0.18' })], p).taxAmount).toBe(18); // a configured 18 % is honoured too
  });

  it('protects Decimal(10,2) storage from overflow', () => {
    expect(() => PricingService.calculatePricing([item({ unitPrice: '99999999.99', quantity: 2, taxRate: 0 })], p)).toThrowError(expect.objectContaining({ errorCode: 'ORDER_TOTAL_TOO_LARGE' }));
  });

  it('minimum order: disabled when 0, otherwise reports met and the shortfall (items subtotal basis)', () => {
    expect(PricingService.calculatePricing([item()], p).minimumOrder).toEqual({ enabled: false, requiredAmount: 0, met: true, shortfall: 0 });
    const min = policy({ COMMERCE_MIN_ORDER_VALUE: '250.00' });
    expect(PricingService.calculatePricing([item({ unitPrice: '100.00' })], min).minimumOrder).toEqual({ enabled: true, requiredAmount: 250, met: false, shortfall: 150 });
    expect(PricingService.calculatePricing([item({ unitPrice: '250.00' })], min).minimumOrder).toEqual({ enabled: true, requiredAmount: 250, met: true, shortfall: 0 });
  });

  it('identical inputs and policy always produce identical output', () => {
    const items = [item({ unitPrice: '33.33', quantity: 3 }), item({ productId: 'b', unitPrice: '12.49', quantity: 2, containerDeposit: '10' })];
    expect(PricingService.calculatePricing(items, p)).toEqual(PricingService.calculatePricing(items, p));
  });

  it('a discount can never be negative or push the total below zero', () => {
    const base = PricingService.calculatePricing([item()], p).netAmount;
    expect(PricingService.calculatePricing([item()], p, -50).netAmount).toBe(base);
    expect(PricingService.calculatePricing([item()], p, 1e9).netAmount).toBe(0);
  });

  it('findQuantityIssues describes problems without throwing (used only to display a legacy cart)', () => {
    expect(PricingService.findQuantityIssues([{ quantity: 0 }, { quantity: 99 }, { quantity: 2 }], p)).toEqual([
      { index: 0, code: 'INVALID_QUANTITY' },
      { index: 1, code: 'MAX_LINE_QUANTITY_EXCEEDED' }
    ]);
  });

  it('contains no retired hard-coded commercial constants (40 / 499 / 5 %)', () => {
    const src = readFileSync(join(__dirname, '..', 'modules', 'commerce', 'pricing.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).not.toMatch(/\b499\b|\b40(\.0+)?\b|0\.05\b|DEFAULT_PRICING_CONFIG/);
  });
});

describe('P7A order status catalogue', () => {
  it('uses the approved vocabulary (no OUT_FOR_DELIVERY)', () => {
    expect([...ORDER_STATUSES]).toEqual(['PENDING', 'CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED']);
    expect(ORDER_STATUSES as readonly string[]).not.toContain('OUT_FOR_DELIVERY');
  });

  it('terminal statuses have no outgoing transitions; every status is reachable only through listed edges', () => {
    for (const t of TERMINAL_ORDER_STATUSES) expect(ORDER_TRANSITIONS[t]).toEqual([]);
    for (const from of ORDER_STATUSES) for (const to of ORDER_TRANSITIONS[from]) expect(ORDER_STATUSES).toContain(to);
  });

  it('every legal edge has an explicit list of parties; no edge lists CUSTOMER_OWNER except cancelling an unconfirmed order', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_TRANSITIONS[from]) {
        const parties = TRANSITION_PARTIES[transitionKey(from, to)];
        expect(parties, `${from}->${to}`).toBeDefined();
        expect(parties.length).toBeGreaterThan(0);
        if (parties.includes('CUSTOMER_OWNER')) expect(transitionKey(from, to)).toBe('PENDING->CANCELLED');
      }
    }
  });

  it('confirmation is a SYSTEM-only edge, kitchen edges are CHEF/SUPER_ADMIN, delivery edges are DELIVERY/SUPER_ADMIN', () => {
    expect(TRANSITION_PARTIES['PENDING->CONFIRMED']).toEqual(['SYSTEM']);
    expect(TRANSITION_PARTIES['PREPARING->READY']).toEqual([RoleEnum.CHEF, RoleEnum.SUPER_ADMIN]);
    expect(TRANSITION_PARTIES['READY->DISPATCHED']).toEqual([RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN]);
    expect(TRANSITION_PARTIES['DISPATCHED->DELIVERED']).toEqual([RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN]);
    // MD is read-only: it appears on no edge
    expect(Object.values(TRANSITION_PARTIES).flat()).not.toContain(RoleEnum.MD);
  });

  it('there is no way to leave DELIVERED or CANCELLED, and DISPATCHED can only be delivered', () => {
    const edges = (s: OrderStatus) => [...ORDER_TRANSITIONS[s]];
    expect(edges('DELIVERED')).toEqual([]);
    expect(edges('CANCELLED')).toEqual([]);
    expect(edges('DISPATCHED')).toEqual(['DELIVERED']);
  });
});

describe('P7A idempotency key + request fingerprint', () => {
  it('the key is REQUIRED - the server never invents one', () => {
    expect(() => resolveIdempotencyKey(undefined, undefined)).toThrowError(expect.objectContaining({ errorCode: 'IDEMPOTENCY_KEY_REQUIRED' }));
    expect(() => resolveIdempotencyKey('', '')).toThrowError(expect.objectContaining({ errorCode: 'IDEMPOTENCY_KEY_REQUIRED' }));
  });

  it('rejects malformed, too short, too long and non-string keys', () => {
    for (const bad of ['short', 'has space in it!', 'bad/char/slash-1', 'x'.repeat(129), '-leadingdash1', 'ünïcödé-key-123', 12345678]) {
      expect(() => resolveIdempotencyKey(bad, undefined), String(bad)).toThrowError(expect.objectContaining({ errorCode: 'INVALID_IDEMPOTENCY_KEY' }));
    }
    expect(() => resolveIdempotencyKey(['IK-12345678', 'IK-87654321'], undefined)).toThrowError(expect.objectContaining({ errorCode: 'INVALID_IDEMPOTENCY_KEY' }));
  });

  it('accepts the supported character set and lengths 8..128; header and legacy body field must agree', () => {
    expect(resolveIdempotencyKey('IK-3f2b4c1e-0a9d-4c1b-8f55-1234567890ab', undefined)).toBe('IK-3f2b4c1e-0a9d-4c1b-8f55-1234567890ab');
    expect(resolveIdempotencyKey(undefined, 'IK-body.key_1:ok')).toBe('IK-body.key_1:ok');
    expect(IDEMPOTENCY_KEY_PATTERN.test('a'.repeat(8))).toBe(true);
    expect(IDEMPOTENCY_KEY_PATTERN.test('a'.repeat(128))).toBe(true);
    expect(resolveIdempotencyKey('IK-same-key-1', 'IK-same-key-1')).toBe('IK-same-key-1');
    expect(() => resolveIdempotencyKey('IK-header-key-1', 'IK-body-key-22')).toThrowError(expect.objectContaining({ errorCode: 'INVALID_IDEMPOTENCY_KEY' }));
  });

  const base = {
    customerProfileId: 'cust-1',
    addressId: 'addr-1',
    paymentMethod: 'ONLINE',
    deliveryInstructions: 'Ring twice',
    items: [
      { productId: 'a', variantId: null, quantity: 1 },
      { productId: 'b', variantId: 'v1', quantity: 2 }
    ],
    policyHash: 'f'.repeat(64)
  };

  it('is canonical: item order and key order do not matter, whitespace in instructions is normalised', () => {
    const f = computeRequestFingerprint(base);
    expect(computeRequestFingerprint({ ...base, items: [...base.items].reverse() })).toBe(f);
    expect(computeRequestFingerprint({ ...base, deliveryInstructions: '  Ring twice  ' })).toBe(f);
    expect(f).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when ANY semantically relevant input changes', () => {
    const f = computeRequestFingerprint(base);
    const variants = [
      { ...base, customerProfileId: 'cust-2' },
      { ...base, addressId: 'addr-2' },
      { ...base, paymentMethod: 'COD' },
      { ...base, deliveryInstructions: 'Leave at gate' },
      { ...base, items: [{ productId: 'a', variantId: null, quantity: 2 }, base.items[1]] },
      { ...base, items: [base.items[0]] },
      { ...base, items: [{ productId: 'a', variantId: 'v9', quantity: 1 }, base.items[1]] },
      { ...base, policyHash: 'e'.repeat(64) }
    ];
    for (const v of variants) expect(computeRequestFingerprint(v)).not.toBe(f);
  });
});

describe('P7A order numbers', () => {
  afterEach(() => setOrderNumberGenerator(null));

  it('are human readable (PB-YYMMDD-XXXXXX), UTC dated, and use no look-alike characters', () => {
    const n = generateOrderNumber(new Date(Date.UTC(2026, 9, 10, 12, 0, 0)));
    expect(n).toMatch(/^PB-261010-[2-9A-HJKMNP-TV-Z]{6}$/);
    for (let i = 0; i < 200; i++) expect(generateOrderNumber().slice(10)).not.toMatch(/[01OILU]/); // suffix only; the date part is digits
  });

  it('are unique across a large sample (CSPRNG suffix)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateOrderNumber());
    expect(seen.size).toBe(2000);
  });

  it('the generator can be replaced in tests (deterministic collision tests)', () => {
    setOrderNumberGenerator(() => 'PB-FIXED-000001');
    // nextOrderNumber is exercised by the integration tests; here we only assert the seam does not throw outside production
    expect(() => setOrderNumberGenerator(null)).not.toThrow();
  });
});

describe('P7A audit redaction (payment-oriented keys)', () => {
  it('redacts signature / cvv / card / vpa style keys but keeps harmless identifiers', () => {
    const out = AuditService.sanitize({
      razorpay_signature: 'abc',
      signature: 'abc',
      cvv: '123',
      cardNumber: '4111111111111111',
      card: { last4: '1111' },
      vpa: 'name@upi',
      orderNumber: 'PB-261010-ABCDEF',
      providerPaymentId: 'pay_123',
      amount: 100,
      scorecard: 'ok'
    }) as Record<string, unknown>;
    for (const k of ['razorpay_signature', 'signature', 'cvv', 'cardNumber', 'card', 'vpa']) expect(out[k]).toBe('[REDACTED]');
    expect(out.orderNumber).toBe('PB-261010-ABCDEF');
    expect(out.providerPaymentId).toBe('pay_123');
    expect(out.amount).toBe(100);
    expect(out.scorecard).toBe('ok');
  });
});

describe('P7A Decimal sanity', () => {
  it('Decimal money rounding helper behaves as documented (HALF_UP)', () => {
    expect(new Decimal('0.505').toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)).toBe('0.51');
    expect(new Decimal('0.504').toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)).toBe('0.50');
  });
});

describe('P7A startup validation (module load)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    vi.resetModules();
  });

  it('loading the policy module in production without explicit configuration FAILS at startup', async () => {
    for (const k of COMMERCE_ENV_KEYS) delete process.env[k];
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    await expect(import('../config/commercePolicy.js')).rejects.toThrow(/must be set explicitly in production/);
  });

  it('loading it in production with a complete explicit configuration succeeds and serves that policy', async () => {
    Object.assign(process.env, FULL, { NODE_ENV: 'production' });
    vi.resetModules();
    const mod = await import('../config/commercePolicy.js');
    expect(mod.getCommercePolicy().source).toBe('ENVIRONMENT');
    expect(mod.getCommercePolicy().deliveryFee.toFixed(2)).toBe('25.00');
  });

  it('an invalid value (unsupported tax mode) fails startup even in development', async () => {
    Object.assign(process.env, FULL, { NODE_ENV: 'development', COMMERCE_TAX_MODE: 'INCLUSIVE' });
    vi.resetModules();
    await expect(import('../config/commercePolicy.js')).rejects.toThrow(/not supported/);
  });
});
