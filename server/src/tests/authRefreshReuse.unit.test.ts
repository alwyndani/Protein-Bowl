import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Database-free regression tests for refresh-token rotation, reuse detection and logout (prisma is replaced by an in-memory double).
 * Real end-to-end behaviour is covered by the DB-backed p11a.test.ts and authHardening.deferred.test.ts.
 */
const db = vi.hoisted(() => {
  const refreshToken = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn()
  };
  const tx = { refreshToken };
  return { refreshToken, prisma: { refreshToken, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock('../config/database.js', () => ({ prisma: db.prisma }));
const audit = vi.hoisted(() => ({ recordSafe: vi.fn(async () => undefined) }));
vi.mock('../modules/audit/audit.service.js', () => ({ AuditService: audit }));

import { AuthService } from '../modules/auth/auth.service.js';
import { hashToken } from '../utils/hash.js';

const future = new Date(Date.now() + 3600_000);
function stored(over: Record<string, unknown> = {}) {
  return {
    id: 'rt1',
    userId: 'u1',
    tokenHash: hashToken('raw-1'),
    revokedAt: null,
    expiresAt: future,
    user: { id: 'u1', email: 'a@b.test', status: 'ACTIVE', deletedAt: null, roles: [{ role: 'CUSTOMER' }], customerProfile: null, employeeProfile: null },
    ...over
  };
}

describe('refresh token rotation and reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    db.refreshToken.create.mockResolvedValue({});
  });

  it('a normal refresh claims the old token with a compare-and-set (revokedAt must be null) and issues one successor', async () => {
    db.refreshToken.findUnique.mockResolvedValue(stored());
    const out = await AuthService.rotateRefreshToken('raw-1');
    expect(out.rawRefreshToken).toBeTruthy();
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({ where: { id: 'rt1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(db.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('replaying an already revoked (rotated or logged-out) token => TOKEN_REUSED, every ACTIVE session of the user is revoked, nothing is issued', async () => {
    db.refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date() }));
    await expect(AuthService.rotateRefreshToken('raw-1')).rejects.toMatchObject({ statusCode: 401, errorCode: 'TOKEN_REUSED' });
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(db.refreshToken.create).not.toHaveBeenCalled();
    expect(audit.recordSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_REFRESH_TOKEN_REUSED', entityId: 'u1', payload: {} }));
  });

  it('a concurrent second refresh that loses the compare-and-set is a replay: no successor token, sessions revoked, TOKEN_REUSED', async () => {
    db.refreshToken.findUnique.mockResolvedValue(stored()); // both requests read the token as still active
    db.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 }); // the other request already revoked it
    db.refreshToken.updateMany.mockResolvedValueOnce({ count: 3 }); // revokeAllRefreshTokens
    await expect(AuthService.rotateRefreshToken('raw-1')).rejects.toMatchObject({ statusCode: 401, errorCode: 'TOKEN_REUSED' });
    expect(db.refreshToken.create).not.toHaveBeenCalled();
    expect(db.refreshToken.updateMany).toHaveBeenLastCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it('an unknown token is TOKEN_INVALID and revokes nothing', async () => {
    db.refreshToken.findUnique.mockResolvedValue(null);
    await expect(AuthService.rotateRefreshToken('nope')).rejects.toMatchObject({ errorCode: 'TOKEN_INVALID' });
    expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('logout revokes only the presented token (by hash, only if still active); no token means no query', async () => {
    db.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    await AuthService.logout('raw-1');
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({ where: { tokenHash: hashToken('raw-1'), revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    db.refreshToken.updateMany.mockClear();
    await AuthService.logout(undefined);
    expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
