import { prisma } from '../../config/database.js';
import { hashPassword, comparePassword, hashToken, generateRandomToken } from '../../utils/hash.js';
import { generateAccessToken } from '../../utils/jwt.js';
import { generateServerReferralCode } from '../../utils/referralCode.js';
import { AppError } from '../../middleware/error.middleware.js';
import { RegisterDto, LoginDto } from './auth.validator.js';
import { RoleEnum } from '@prisma/client';

export class AuthService {
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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
      rawRefreshToken
    };
  }

  /**
   * Authenticate user with credentials.
   */
  static async login(dto: LoginDto) {
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        roles: true,
        customerProfile: true,
        employeeProfile: true
      }
    });

    if (!user || !user.passwordHash) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await comparePassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError('Account is not active. Please contact support.', 403, 'ACCOUNT_INACTIVE');
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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
      rawRefreshToken
    };
  }

  /**
   * Rotate Refresh Token (Revoke old token, issue new token pair).
   */
  static async rotateRefreshToken(rawRefreshToken: string) {
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

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() }
    });

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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newTokenHash,
        expiresAt
      }
    });

    return {
      accessToken: newAccessToken,
      rawRefreshToken: newRawRefreshToken
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
