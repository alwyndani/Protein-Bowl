import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { AppError } from './error.middleware.js';
import { AuditService } from '../modules/audit/audit.service.js';

/**
 * P11A: contract guards for the dedicated customer-mobile auth routes (/auth/mobile/*), which return the refresh token in the response BODY.
 *
 * NEITHER guard is client attestation or authentication: headers are forgeable by any non-browser caller, who must still hold valid
 * credentials / a valid refresh token. They exist to (a) keep an ordinary browser from ever using the token-body contract, so the web
 * cookie boundary stays intact, and (b) identify the contract and enforce a configurable minimum app version.
 */

/** Browser-oriented request context. React Native fetch (credentials: 'omit') sends none of these. */
const BROWSER_HEADERS = ['origin', 'cookie', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'] as const;

export function rejectBrowserContext(req: Request, _res: Response, next: NextFunction) {
  for (const name of BROWSER_HEADERS) {
    if (req.headers[name] !== undefined) {
      return next(new AppError('This endpoint is for the customer mobile app only.', 403, 'MOBILE_ROUTE_NOT_FOR_BROWSERS'));
    }
  }
  next();
}

export interface MobileClientInfo {
  version: string;
  platform: 'android' | 'ios';
}

const CLIENT_PATTERN = /^protein-bowl-mobile\/(\d{1,4})\.(\d{1,4})\.(\d{1,4}) \((android|ios)\)$/;

/** Strict parse of "protein-bowl-mobile/1.2.3 (android)". Anything else (prerelease, extra text, wrong case) is null. */
export function parseMobileClient(header: unknown): MobileClientInfo | null {
  if (typeof header !== 'string' || header.length > 64) return null;
  const m = CLIENT_PATTERN.exec(header);
  if (!m) return null;
  return { version: `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}`, platform: m[4] as 'android' | 'ios' };
}

/** Numeric MAJOR.MINOR.PATCH comparison: negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function requireMobileClientContract(req: Request, _res: Response, next: NextFunction) {
  const client = parseMobileClient(req.headers['x-pb-client']);
  if (!client) return next(new AppError('Unsupported or missing client contract.', 400, 'INVALID_CLIENT_CONTRACT'));
  const min = env.MOBILE_MIN_APP_VERSION;
  if (min && compareVersions(client.version, min) < 0) {
    // Best-effort security signal. Only the declared version is recorded: never a credential, token or request body.
    void AuditService.recordSafe({
      action: 'MOBILE_AUTH_VERSION_REFUSED',
      entity: 'MobileClient',
      payload: { clientVersion: client.version, platform: client.platform, minimumVersion: min },
      context: AuditService.contextFromRequest(req)
    });
    return next(new AppError('This version of the app is no longer supported. Please update the app.', 426, 'APP_VERSION_UNSUPPORTED'));
  }
  (req as Request & { mobileClient?: MobileClientInfo }).mobileClient = client;
  next();
}

/** Mobile auth responses carry a refresh token: never cacheable, and no cookie is ever set or read on these routes. */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}
