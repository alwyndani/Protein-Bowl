import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateRandomToken } from '../utils/hash.js';
import { webBaseUrl } from '../modules/email/mailer.js';

/**
 * The emailed reset link (used by web AND mobile users: the mobile app asks the same endpoint) must open the web reset page with the token in the URL
 * FRAGMENT, in a form the page accepts. Pure checks: no database, no mail provider.
 */
const ROOT = path.join(process.cwd(), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('password-reset link', () => {
  const service = read('server/src/modules/auth/passwordReset.service.ts');
  const page = read('src/components/auth/ResetPasswordPage.tsx');
  const main = read('src/main.tsx');

  it('the email links to <web origin>/reset-password#token=<token> (fragment: never sent to servers or written to access logs)', () => {
    expect(service).toContain('${webBaseUrl()}/reset-password#token=${rawToken}');
    expect(service).not.toMatch(/reset-password\?token=/);
  });

  it('that path is exactly the route the web app renders on its own (no app shell, no auth restoration)', () => {
    expect(page).toContain("RESET_PASSWORD_PATH = '/reset-password'");
    expect(main).toMatch(/isResetPasswordRoute\(window\.location\.pathname\)/);
  });

  it('the page reads the token from the fragment and scrubs it from the address bar', () => {
    expect(page).toMatch(/window\.location\.hash/);
    expect(page).toMatch(/new URLSearchParams\(hash\)\.get\('token'\)/);
    expect(page).toMatch(/history\.replaceState/);
  });

  it('a generated token matches the page\'s and the API\'s accepted token format', () => {
    const token = generateRandomToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,256}$/); // the reset-password body schema
  });

  it('the base URL is an origin without a trailing slash (so the link has exactly one slash before the path)', () => {
    const base = webBaseUrl();
    expect(base).toMatch(/^https?:\/\/[^/]+$/);
  });

  it('mobile uses the same endpoint and never builds or opens a link itself', () => {
    const mobile = read('apps/mobile/src/auth/sessionManager.ts');
    expect(mobile).toContain("'/auth/forgot-password'");
    expect(mobile).not.toMatch(/reset-password|Linking\./);
  });
});
