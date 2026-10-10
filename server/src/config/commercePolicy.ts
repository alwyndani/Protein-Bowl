import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { Decimal } from '@prisma/client/runtime/library';

// Make sure a local .env is loaded before the policy is validated (does not override variables that are already set).
dotenv.config();

/**
 * Server-authoritative commerce policy (P7A).
 *
 * Every monetary rule that affects what a customer pays lives here - never in the pricing code, the web app or a
 * client request. Values come from the environment (validated at startup) behind a `CommercePolicyProvider`, so an
 * admin-editable, database-backed provider can replace it later without touching the pricing code. Each order stores an
 * immutable snapshot of the policy it was priced with (`Order.pricingSnapshot`).
 *
 * PRODUCT DECISIONS (tax rate/mode, fees, thresholds, minimum order, quantity caps, COD) are NOT made here. In production
 * every value must be supplied explicitly - there are no production defaults, and the old assumptions (delivery fee,
 * free-delivery threshold, 5 % tax) no longer exist anywhere in the code.
 */

/** Largest amount the Decimal(10,2) money columns can hold. */
export const MAX_MONEY = new Decimal('99999999.99');

/** TECHNICAL safety ceilings (protect arithmetic/storage). Business limits are configured BELOW these, never above. */
export const TECHNICAL_MAX_LINE_QUANTITY = 1000;
export const TECHNICAL_MAX_CART_UNITS = 10000;

export const SUPPORTED_TAX_MODES = ['EXCLUSIVE'] as const;
export type TaxMode = (typeof SUPPORTED_TAX_MODES)[number];

export type PolicySource = 'ENVIRONMENT' | 'DEVELOPMENT_DEFAULTS' | 'INJECTED';

/** Bumped whenever the shape/meaning of the snapshot changes. */
export const POLICY_SNAPSHOT_VERSION = 1;

export interface CommercePolicy {
  readonly source: PolicySource;
  readonly currency: 'INR';
  readonly taxMode: TaxMode;
  /** Delivery / packaging fees are not taxed in P7A (taxable fees need a fee tax rate - a later, explicit decision). */
  readonly deliveryTaxable: false;
  readonly packagingTaxable: false;
  readonly deliveryFee: Decimal;
  readonly freeDelivery: { readonly enabled: boolean; readonly threshold: Decimal | null };
  readonly packagingFee: Decimal;
  /** 0 disables the minimum. Compared against the items subtotal (before tax, fees and deposits). */
  readonly minimumOrderValue: Decimal;
  readonly maxLineQuantity: number;
  readonly maxCartUnits: number;
  readonly codEnabled: boolean;
}

export interface CommercePolicyProvider {
  getPolicy(): CommercePolicy;
}

/** Keys read from the environment. */
export const COMMERCE_ENV_KEYS = [
  'COMMERCE_TAX_MODE',
  'COMMERCE_DELIVERY_FEE',
  'COMMERCE_FREE_DELIVERY_ENABLED',
  'COMMERCE_FREE_DELIVERY_THRESHOLD',
  'COMMERCE_PACKAGING_FEE',
  'COMMERCE_MIN_ORDER_VALUE',
  'COMMERCE_DELIVERY_TAXABLE',
  'COMMERCE_PACKAGING_TAXABLE',
  'COMMERCE_MAX_LINE_QUANTITY',
  'COMMERCE_MAX_CART_UNITS',
  'COMMERCE_COD_ENABLED'
] as const;
export type CommerceEnvKey = (typeof COMMERCE_ENV_KEYS)[number];
export type RawCommerceEnv = Partial<Record<CommerceEnvKey, string | undefined>> & Record<string, string | undefined>;

/**
 * DEVELOPMENT-ONLY example values, used ONLY when NODE_ENV is not "production" and a variable is absent. They are
 * placeholders to make local development possible - they are NOT Protein Bowl policy and are refused in production.
 */
export const DEVELOPMENT_EXAMPLE_VALUES: Readonly<Record<CommerceEnvKey, string>> = Object.freeze({
  COMMERCE_TAX_MODE: 'EXCLUSIVE',
  COMMERCE_DELIVERY_FEE: '30.00',
  COMMERCE_FREE_DELIVERY_ENABLED: 'true',
  COMMERCE_FREE_DELIVERY_THRESHOLD: '600.00',
  COMMERCE_PACKAGING_FEE: '0.00',
  COMMERCE_MIN_ORDER_VALUE: '0',
  COMMERCE_DELIVERY_TAXABLE: 'false',
  COMMERCE_PACKAGING_TAXABLE: 'false',
  COMMERCE_MAX_LINE_QUANTITY: '20',
  COMMERCE_MAX_CART_UNITS: '50',
  COMMERCE_COD_ENABLED: 'false'
});

export class CommercePolicyConfigError extends Error {
  constructor(message: string) {
    super(`Invalid commerce policy configuration: ${message}`);
    this.name = 'CommercePolicyConfigError';
  }
}

const MONEY_RE = /^\d{1,8}(\.\d{1,2})?$/;
const INT_RE = /^\d{1,9}$/;

function parseMoney(key: string, raw: string): Decimal {
  const value = raw.trim();
  if (!MONEY_RE.test(value)) {
    throw new CommercePolicyConfigError(`${key} must be a non-negative amount with at most 2 decimals (got "${raw}")`);
  }
  const d = new Decimal(value);
  if (d.greaterThan(MAX_MONEY)) throw new CommercePolicyConfigError(`${key} exceeds the supported maximum amount`);
  return d;
}

function parseBool(key: string, raw: string): boolean {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new CommercePolicyConfigError(`${key} must be exactly "true" or "false" (got "${raw}")`);
}

function parseIntInRange(key: string, raw: string, min: number, max: number): number {
  const value = raw.trim();
  if (!INT_RE.test(value)) throw new CommercePolicyConfigError(`${key} must be a whole number (got "${raw}")`);
  const n = Number(value);
  if (n < min || n > max) throw new CommercePolicyConfigError(`${key} must be between ${min} and ${max} (got ${n})`);
  return n;
}

/**
 * Parse and validate raw settings into a policy. Pure and deterministic: tests pass their own raw object.
 * - production: every key must be present (explicit decisions, no silent fallback);
 * - other environments: a missing key falls back to the labelled DEVELOPMENT_EXAMPLE_VALUES (source DEVELOPMENT_DEFAULTS).
 * Malformed values, negative amounts, unsupported tax modes and unsupported taxable-fee settings always throw.
 */
export function parseCommercePolicy(raw: RawCommerceEnv, nodeEnv: string): CommercePolicy {
  const production = nodeEnv === 'production';
  let usedDevelopmentDefault = false;

  const read = (key: CommerceEnvKey): string => {
    const supplied = raw[key];
    if (supplied !== undefined && supplied.trim() !== '') return supplied;
    if (production) {
      throw new CommercePolicyConfigError(`${key} must be set explicitly in production (no default exists - this is a product decision)`);
    }
    usedDevelopmentDefault = true;
    return DEVELOPMENT_EXAMPLE_VALUES[key];
  };

  const taxModeRaw = read('COMMERCE_TAX_MODE').trim();
  if (!(SUPPORTED_TAX_MODES as readonly string[]).includes(taxModeRaw)) {
    throw new CommercePolicyConfigError(
      `COMMERCE_TAX_MODE "${taxModeRaw}" is not supported (supported: ${SUPPORTED_TAX_MODES.join(', ')}); inclusive pricing is not implemented`
    );
  }

  const deliveryTaxable = parseBool('COMMERCE_DELIVERY_TAXABLE', read('COMMERCE_DELIVERY_TAXABLE'));
  const packagingTaxable = parseBool('COMMERCE_PACKAGING_TAXABLE', read('COMMERCE_PACKAGING_TAXABLE'));
  if (deliveryTaxable || packagingTaxable) {
    throw new CommercePolicyConfigError('taxable delivery/packaging fees are not supported yet; set COMMERCE_DELIVERY_TAXABLE and COMMERCE_PACKAGING_TAXABLE to "false"');
  }

  const deliveryFee = parseMoney('COMMERCE_DELIVERY_FEE', read('COMMERCE_DELIVERY_FEE'));
  const packagingFee = parseMoney('COMMERCE_PACKAGING_FEE', read('COMMERCE_PACKAGING_FEE'));
  const minimumOrderValue = parseMoney('COMMERCE_MIN_ORDER_VALUE', read('COMMERCE_MIN_ORDER_VALUE'));

  const freeEnabled = parseBool('COMMERCE_FREE_DELIVERY_ENABLED', read('COMMERCE_FREE_DELIVERY_ENABLED'));
  let threshold: Decimal | null = null;
  if (freeEnabled) {
    threshold = parseMoney('COMMERCE_FREE_DELIVERY_THRESHOLD', read('COMMERCE_FREE_DELIVERY_THRESHOLD'));
    if (threshold.lessThanOrEqualTo(0)) {
      throw new CommercePolicyConfigError('COMMERCE_FREE_DELIVERY_THRESHOLD must be greater than 0 when free delivery is enabled (use a delivery fee of 0 for always-free delivery)');
    }
  } else if (raw.COMMERCE_FREE_DELIVERY_THRESHOLD !== undefined && raw.COMMERCE_FREE_DELIVERY_THRESHOLD.trim() !== '') {
    throw new CommercePolicyConfigError('COMMERCE_FREE_DELIVERY_THRESHOLD is set but COMMERCE_FREE_DELIVERY_ENABLED is "false"; remove one of them');
  }

  const maxLineQuantity = parseIntInRange('COMMERCE_MAX_LINE_QUANTITY', read('COMMERCE_MAX_LINE_QUANTITY'), 1, TECHNICAL_MAX_LINE_QUANTITY);
  const maxCartUnits = parseIntInRange('COMMERCE_MAX_CART_UNITS', read('COMMERCE_MAX_CART_UNITS'), 1, TECHNICAL_MAX_CART_UNITS);
  if (maxCartUnits < maxLineQuantity) {
    throw new CommercePolicyConfigError('COMMERCE_MAX_CART_UNITS must not be smaller than COMMERCE_MAX_LINE_QUANTITY');
  }

  const codEnabled = parseBool('COMMERCE_COD_ENABLED', read('COMMERCE_COD_ENABLED'));

  return Object.freeze({
    source: usedDevelopmentDefault ? 'DEVELOPMENT_DEFAULTS' : 'ENVIRONMENT',
    currency: 'INR',
    taxMode: taxModeRaw as TaxMode,
    deliveryTaxable: false,
    packagingTaxable: false,
    deliveryFee,
    freeDelivery: Object.freeze({ enabled: freeEnabled, threshold }),
    packagingFee,
    minimumOrderValue,
    maxLineQuantity,
    maxCartUnits,
    codEnabled
  }) as CommercePolicy;
}

/** Build a policy for tests / injection from plain values (validated through the same parser). */
export function buildCommercePolicy(overrides: Partial<Record<CommerceEnvKey, string>> = {}, nodeEnv = 'test'): CommercePolicy {
  const base = { ...DEVELOPMENT_EXAMPLE_VALUES, ...overrides } as RawCommerceEnv;
  const parsed = parseCommercePolicy(base, nodeEnv);
  return Object.freeze({ ...parsed, source: 'INJECTED' as const });
}

// ---------------------------------------------------------------------------------------------------- snapshot

export interface PricingSnapshot {
  snapshotVersion: number;
  policySource: PolicySource;
  currency: 'INR';
  tax: { mode: TaxMode; rounding: 'LINE_HALF_UP'; deliveryTaxable: boolean; packagingTaxable: boolean };
  deliveryFee: string;
  freeDelivery: { enabled: boolean; threshold: string | null; basis: 'ITEMS_SUBTOTAL' };
  packagingFee: string;
  minimumOrder: { enabled: boolean; requiredAmount: string; basis: 'ITEMS_SUBTOTAL' };
  quantityLimits: { maxLineQuantity: number; maxCartUnits: number };
  paymentMethods: { online: true; cod: boolean };
  /** SHA-256 of the canonical policy values (stable identity of the exact rules applied). */
  policyHash: string;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

export function canonicalJson(value: unknown): string {
  return canonical(value);
}

export function buildPricingSnapshot(policy: CommercePolicy): PricingSnapshot {
  const body = {
    snapshotVersion: POLICY_SNAPSHOT_VERSION,
    currency: policy.currency,
    tax: { mode: policy.taxMode, rounding: 'LINE_HALF_UP' as const, deliveryTaxable: policy.deliveryTaxable, packagingTaxable: policy.packagingTaxable },
    deliveryFee: policy.deliveryFee.toFixed(2),
    freeDelivery: { enabled: policy.freeDelivery.enabled, threshold: policy.freeDelivery.threshold ? policy.freeDelivery.threshold.toFixed(2) : null, basis: 'ITEMS_SUBTOTAL' as const },
    packagingFee: policy.packagingFee.toFixed(2),
    minimumOrder: { enabled: policy.minimumOrderValue.greaterThan(0), requiredAmount: policy.minimumOrderValue.toFixed(2), basis: 'ITEMS_SUBTOTAL' as const },
    quantityLimits: { maxLineQuantity: policy.maxLineQuantity, maxCartUnits: policy.maxCartUnits },
    paymentMethods: { online: true as const, cod: policy.codEnabled }
  };
  return {
    ...body,
    policySource: policy.source,
    policyHash: createHash('sha256').update(canonical(body)).digest('hex')
  };
}

// ---------------------------------------------------------------------------------------------------- provider registry

export class EnvironmentCommercePolicyProvider implements CommercePolicyProvider {
  private readonly policy: CommercePolicy;

  constructor(raw: RawCommerceEnv, nodeEnv: string) {
    this.policy = parseCommercePolicy(raw, nodeEnv);
  }

  getPolicy(): CommercePolicy {
    return this.policy;
  }
}

// Validated at import time, so an invalid or incomplete production configuration fails the process at startup.
let activeProvider: CommercePolicyProvider = new EnvironmentCommercePolicyProvider(process.env as RawCommerceEnv, process.env.NODE_ENV ?? 'development');

export function getCommercePolicy(): CommercePolicy {
  return activeProvider.getPolicy();
}

/** Test seam: inject a deterministic policy. Refused in production so it can never be used as a runtime bypass. */
export function setCommercePolicyProvider(provider: CommercePolicyProvider): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The commerce policy provider cannot be replaced in production');
  }
  activeProvider = provider;
}

export function resetCommercePolicyProvider(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The commerce policy provider cannot be replaced in production');
  }
  activeProvider = new EnvironmentCommercePolicyProvider(process.env as RawCommerceEnv, process.env.NODE_ENV ?? 'development');
}
