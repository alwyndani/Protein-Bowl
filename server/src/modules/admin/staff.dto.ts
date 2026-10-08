import { Prisma, RoleEnum } from '@prisma/client';
import { ROLE_SCOPE } from '../../authz/roleScopes.js';

/**
 * Safe projection of a staff account. Deliberately EXCLUDES: passwordHash, refresh tokens, invitation token/hash,
 * HRM salary/bank data, and anything about customers. Never `include` the User/HRM models wholesale for admin responses.
 */
export const staffUserSelect = {
  id: true,
  email: true,
  phone: true,
  status: true,
  isEmailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  roles: { select: { role: true }, orderBy: { assignedAt: 'asc' } },
  employeeProfile: {
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      designation: true,
      shiftTiming: true,
      assignedBranchId: true,
      assignedBranch: { select: { id: true, code: true, name: true, isActive: true } },
      branchAssignments: {
        select: { assignedAt: true, branch: { select: { id: true, code: true, name: true, isActive: true } } },
        orderBy: { assignedAt: 'asc' }
      }
    }
  },
  staffInvitations: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { expiresAt: true, usedAt: true, revokedAt: true, createdAt: true }
  }
} satisfies Prisma.UserSelect;

export type StaffUserRow = Prisma.UserGetPayload<{ select: typeof staffUserSelect }>;

export type InvitationState = 'NONE' | 'ACTIVE' | 'EXPIRED' | 'USED' | 'REVOKED';

export interface StaffBranchDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isPrimary: boolean;
}

export interface StaffDto {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  isEmailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{ role: RoleEnum; scope: string }>;
  employeeProfile: {
    id: string;
    employeeCode: string;
    fullName: string;
    designation: string;
    shiftTiming: string | null;
    primaryBranchId: string | null;
  } | null;
  branches: StaffBranchDto[];
  invitation: { state: InvitationState; expiresAt: Date | null };
}

function invitationState(inv: StaffUserRow['staffInvitations'][number] | undefined): { state: InvitationState; expiresAt: Date | null } {
  if (!inv) return { state: 'NONE', expiresAt: null };
  if (inv.usedAt) return { state: 'USED', expiresAt: inv.expiresAt };
  if (inv.revokedAt) return { state: 'REVOKED', expiresAt: inv.expiresAt };
  if (inv.expiresAt <= new Date()) return { state: 'EXPIRED', expiresAt: inv.expiresAt };
  return { state: 'ACTIVE', expiresAt: inv.expiresAt };
}

export function toStaffDto(row: StaffUserRow): StaffDto {
  const profile = row.employeeProfile;

  // Effective branches = assignment rows + the legacy primary branch (same union the authorization layer uses).
  const byId = new Map<string, StaffBranchDto>();
  for (const a of profile?.branchAssignments ?? []) {
    byId.set(a.branch.id, { ...a.branch, isPrimary: a.branch.id === profile?.assignedBranchId });
  }
  if (profile?.assignedBranch && !byId.has(profile.assignedBranch.id)) {
    byId.set(profile.assignedBranch.id, { ...profile.assignedBranch, isPrimary: true });
  }

  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    status: row.status,
    isEmailVerified: row.isEmailVerified,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    roles: row.roles.map((r) => ({ role: r.role, scope: ROLE_SCOPE[r.role] })),
    employeeProfile: profile
      ? {
          id: profile.id,
          employeeCode: profile.employeeCode,
          fullName: profile.fullName,
          designation: profile.designation,
          shiftTiming: profile.shiftTiming,
          primaryBranchId: profile.assignedBranchId
        }
      : null,
    branches: Array.from(byId.values()),
    invitation: invitationState(row.staffInvitations[0])
  };
}
