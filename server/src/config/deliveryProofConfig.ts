import dotenv from 'dotenv';

// Make sure a local .env is loaded before the configuration is validated (does not override variables already set).
dotenv.config();

/**
 * P9B Delivery Code configuration. The only setting is the HMAC secret ("pepper") that protects the stored code hashes: the database
 * alone is useless to an attacker without it. Production FAILS CLOSED (the secret must be set explicitly, at least 32 characters).
 * Outside production a clearly labelled development fallback is used so local setups keep working; it can never be used in production.
 * The secret is never logged, never returned by any API and never committed.
 */
export const DELIVERY_PROOF_SECRET_MIN_LENGTH = 32;

/** Development/test only. NOT a secret and NOT usable in production (production refuses to start without an explicit value). */
const DEVELOPMENT_FALLBACK = 'development-only-delivery-proof-secret-never-use-in-production';

export class DeliveryProofConfigError extends Error {
  constructor(message: string) {
    super(`Invalid delivery proof configuration: ${message}`);
    this.name = 'DeliveryProofConfigError';
  }
}

export interface DeliveryProofConfig {
  readonly secret: string;
  readonly secretSource: 'ENVIRONMENT' | 'DEVELOPMENT_FALLBACK';
}

export function parseDeliveryProofConfig(raw: Record<string, string | undefined>, nodeEnv: string): DeliveryProofConfig {
  const value = raw.DELIVERY_PROOF_SECRET;
  if (value === undefined || value.trim() === '') {
    if (nodeEnv === 'production') throw new DeliveryProofConfigError('DELIVERY_PROOF_SECRET must be set explicitly in production (at least 32 characters)');
    return { secret: DEVELOPMENT_FALLBACK, secretSource: 'DEVELOPMENT_FALLBACK' };
  }
  if (value.length < DELIVERY_PROOF_SECRET_MIN_LENGTH) {
    throw new DeliveryProofConfigError(`DELIVERY_PROOF_SECRET must be at least ${DELIVERY_PROOF_SECRET_MIN_LENGTH} characters`);
  }
  return { secret: value, secretSource: 'ENVIRONMENT' };
}

/** Evaluated when the module loads, so an application imported in production without the secret fails to start. */
export const deliveryProofConfig: DeliveryProofConfig = parseDeliveryProofConfig(process.env, process.env.NODE_ENV ?? 'development');
