/**
 * Frontend types for the P6B administration API (/api/v1/admin/*, /api/v1/staff/*, /api/v1/auth/staff/accept-invite).
 * They mirror the backend DTOs exactly. None of these types carries a password hash, token hash, salary or health data.
 */

export type StaffStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type InvitationState = 'NONE' | 'ACTIVE' | 'EXPIRED' | 'USED' | 'REVOKED';
export type RoleScopeName = 'GLOBAL' | 'GLOBAL_READ' | 'ASSIGNMENT' | 'BRANCH' | 'BRANCH_SELF' | 'CUSTOMER';

export interface StaffRoleEntry {
  role: string;
  scope: RoleScopeName;
}

export interface StaffBranchEntry {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isPrimary: boolean;
}

export interface StaffMember {
  id: string;
  email: string;
  phone: string | null;
  status: StaffStatus;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: StaffRoleEntry[];
  employeeProfile: {
    id: string;
    employeeCode: string;
    fullName: string;
    designation: string;
    shiftTiming: string | null;
    primaryBranchId: string | null;
  } | null;
  branches: StaffBranchEntry[];
  invitation: { state: InvitationState; expiresAt: string | null };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StaffListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: StaffStatus | '';
  role?: string;
  branchId?: string;
}

export interface CreateStaffInput {
  email: string;
  fullName: string;
  phone?: string;
  designation: string;
  employeeCode?: string;
  shiftTiming?: string;
  roles: string[];
  branchIds: string[];
}

export interface UpdateStaffInput {
  fullName?: string;
  phone?: string | null;
  designation?: string;
  shiftTiming?: string | null;
}

/**
 * Manual invitation hand-off. The raw one-time token is deliberately NOT part of this type: the service keeps only the
 * setup link (which embeds the token) and the UI holds it in transient component state - never in storage.
 */
export interface InvitationHandoff {
  deliveryMode: 'manual';
  sentByEmail: false;
  expiresAt: string;
  setupLink: string;
  note: string;
}

export interface StaffWithInvitation {
  staff: StaffMember;
  invitation: InvitationHandoff;
}

export interface ChangeResult<T> {
  changed: boolean;
  value: T;
}

export interface StepUpProof {
  stepUpToken: string;
  expiresInSeconds: number;
}

export interface BranchRecord {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  staffCount: number;
}

export interface BranchListQuery {
  page?: number;
  pageSize?: number;
  isActive?: boolean;
  q?: string;
}

export interface CreateBranchInput {
  code: string;
  name: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateBranchInput {
  name?: string;
  address?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { userId: string | null; email: string | null; role: string | null };
  ipAddress: string | null;
  userAgent: string | null;
  payload: unknown;
}

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  actorUserId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

export interface PermissionCatalogue {
  note: string;
  roles: Array<{
    role: string;
    scope: RoleScopeName;
    permissions: string[];
    assignableThroughAdminApi: boolean;
  }>;
}
