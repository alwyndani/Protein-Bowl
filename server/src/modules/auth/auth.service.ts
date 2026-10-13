import { prisma } from '../../config/database.js';
import { hashPassword, comparePassword, hashToken, generateRandomToken } from '../../utils/hash.js';
import { generateAccessToken } from '../../utils/jwt.js';
import { generateServerReferralCode } from '../../utils/referralCode.js';
import { AppError } from '../../middleware/error.middleware.js';
import { RegisterDto, LoginDto } from './auth.validator.js';
import { RoleEnum } from '@prisma/client';
import { AuditService, AuditContext } from '../audit/audit.service.js';

/** Lifetime of a refresh token (web cookie and mobile body alike: one session model). */
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** P11A: the customer mobile app accepts an account ONLY when every role it holds is the literal CUSTOMER (staff and legacy MESS_CUSTOMER are refused). */
export function isCustomerAppAccount(roles: readonly RoleEnum[]): boolean {
  return roles.length > 0 && roles.every((r) => r === RoleEnum.CUSTOMER);
}

export interface MobileAuthOptions {
  /** Refuse (403 CUSTOMER_APP_ONLY) any account that is not a pure CUSTOMER, BEFORE a session or token is created. */
  customerOnly?: boolean;
  context?: AuditContext;
}

export class AuthService {
  private static async refuseNonCustomer(user: { id: string; roles: Array<{ role: RoleEnum }> }, stage: 'login' | 'refresh', context?: AuditContext): Promise<never> {
    const roles = user.roles.map((r) => r.role);
    await AuditService.recordSafe({
      actor: { userId: user.id, roles },
      action: 'MOBILE_AUTH_CUSTOMER_APP_REFUSED',
      entity: 'User',
      entityId: user.id,
      payload: { stage },
      context
    });
    throw new AppError('This app is for customer accounts only.', 403, 'CUSTOMER_APP_ONLY');
  }

  /**
   * Revoke every active refresh session of a user (used on deactivation / role change / security events).
   * Existing access tokens stop working immediately anyway (authenticateToken checks the database); this ends refresh.
   */
  static async revokeAllRefreshTokens(userId: string): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return result.count;
  }

  /**
   * Helper to format User payload without sensitive hashes.
   */
  private static sanitizeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: user.roles?.map((r: any) => r.role) || [],
      customerProfile: user.customerProfile || null,
      employeeProfile: user.employeeProfile || null,
      createdAt: user.createdAt
    };
  }

  /**
   * Register a new public customer user.
   */
  static async register(dto: RegisterDto) {
    const existingUser = await prisma.user.findUnique({
      where: { email: dto.email }
    });

    if (existingUser) {
      throw new AppError('Email address is already registered', 409, 'EMAIL_EXISTS');
    }

    const passwordHash = await hashPassword(dto.password);
    const referralCode = generateServerReferralCode('PB');

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          phone: dto.phone || null,
          roles: {
            create: {
              role: dto.requestedRole
            }
          },
          customerProfile: {
            create: {
              fullName: dto.fullName,
              referralCode,
              referredByCode: dto.referredByCode || null
            }
          }
        },
        include: {
          roles: true,
          customerProfile: true
        }
      });
      return user;
    });

    const userRoles = newUser.roles.map(r => r.role);
    const accessToken = generateAccessToken({
      userId: newUser.id,
      email: newUser.email,
      roles: userRoles
    });

    // Generate & Hash Refresh Token
    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await prisma.refreshToken.create({
      data: {
        userId: newUser.id,
        tokenHash,
        expiresAt
      }
    });

    return {
      user: this.sanitizeUser(newUser),
      accessToken,
      rawRefreshToken,
      refreshTokenExpiresAt: expiresAt
    };
  }

  /**
   * Authenticate user with credentials.
   */
  static async login(dto: LoginDto, opts: MobileAuthOptions = {}) {
    const include = { roles: true, customerProfile: true, employeeProfile: true } as const;
    let user = await prisma.user.findUnique({ where: { email: dto.email }, include });
    // Staff emails are stored lowercase; tolerate a differently-cased login without ever matching a different account.
    if (!user && dto.email !== dto.email.toLowerCase()) {
      user = await prisma.user.findUnique({ where: { email: dto.email.toLowerCase() }, include });
    }

    if (!user || !user.passwordHash) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await comparePassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'ACTIVE' || user.deletedAt) {
      throw new AppError('Account is not active. Please contact support.', 403, 'ACCOUNT_INACTIVE');
    }

    // P11A: the customer mobile app never establishes a session for a non-customer account (checked after the password, before any token exists).
    if (opts.customerOnly && !isCustomerAppAccount(user.roles.map((r) => r.role))) {
      await this.refuseNonCustomer(user, 'login', opts.context);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const userRoles = user.roles.map(r => r.role);
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      roles: userRoles
    });

    // Generate & Hash Refresh Token
    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    return {
      user: this.sanitizeUser(user),
      accessToken,
      rawRefreshToken,
      refreshTokenExpiresAt: expiresAt
    };
  }

  /**
   * Rotate Refresh Token (Revoke old token, issue new token pair).
   */
  static async rotateRefreshToken(rawRefreshToken: string, context?: AuditContext, opts: Pick<MobileAuthOptions, 'customerOnly'> = {}) {
    if (!rawRefreshToken) {
      throw new AppError('Refresh token required', 401, 'TOKEN_REQUIRED');
    }

    const incomingHash = hashToken(rawRefreshToken);
    const existingToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: incomingHash },
      include: {
        user: {
          include: {
            roles: true,
            customerProfile: true,
            employeeProfile: true
          }
        }
      }
    });

    // Re-use attack detection: If token exists but was already revoked, revoke all user tokens for security!
    if (existingToken && existingToken.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: existingToken.userId },
        data: { revokedAt: new Date() }
      });
      throw new AppError('Invalid session state. Refresh token reused.', 401, 'TOKEN_REUSED');
    }

    if (!existingToken || existingToken.expiresAt < new Date()) {
      throw new AppError('Invalid or expired refresh token', 401, 'TOKEN_INVALID');
    }

    // Inactive / suspended / soft-deleted users must never receive new tokens: end all their sessions.
    const tokenOwner = existingToken.user;
    if (tokenOwner.deletedAt || tokenOwner.status !== 'ACTIVE') {
      await this.revokeAllRefreshTokens(tokenOwner.id);
      await AuditService.recordSafe({
        actor: { userId: tokenOwner.id, roles: tokenOwner.roles.map((r) => r.role) },
        action: 'AUTH_REFRESH_DENIED_INACTIVE',
        entity: 'User',
        entityId: tokenOwner.id,
        payload: { status: tokenOwner.status, softDeleted: !!tokenOwner.deletedAt },
        context
      });
      throw new AppError('Your session is no longer valid. Please sign in again.', 401, 'ACCOUNT_INACTIVE');
    }

    // P11A: a mobile session whose owner is no longer a pure customer fails safely; nothing is rotated or revoked here.
    if (opts.customerOnly && !isCustomerAppAccount(tokenOwner.roles.map((r) => r.role))) {
      await this.refuseNonCustomer(tokenOwner, 'refresh', context);
    }

    // Issue new token pair
    const user = existingToken.user;
    const userRoles = user.roles.map(r => r.role);
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      roles: userRoles
    });

    const newRawRefreshToken = generateRandomToken();
    const newTokenHash = hashToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    // P11A: revoking the old token and creating the new one is ONE transaction, so a failure between the two can never leave the
    // session without a valid refresh token (and the old token is never revoked without a successor).
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: existingToken.id },
        data: { revokedAt: new Date() }
      });
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt
        }
      });
    });

    return {
      accessToken: newAccessToken,
      rawRefreshToken: newRawRefreshToken,
      refreshTokenExpiresAt: expiresAt
    };
  }

  /**
   * Logout (Revoke refresh token session).
   */
  static async logout(rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const incomingHash = hashToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash: incomingHash, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
  }

  /**
   * Fetch current authenticated user details.
   */
  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: true,
        customerProfile: true,
        employeeProfile: true
      }
    });

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    return this.sanitizeUser(user);
  }
}
