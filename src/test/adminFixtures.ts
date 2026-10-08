import type {
  AuditEntry,
  BranchRecord,
  InvitationHandoff,
  Paginated,
  PermissionCatalogue,
  StaffBranchEntry,
  StaffMember
} from '../services/adminTypes';

export const BRANCH_A_ID = '11111111-1111-4111-8111-111111111111';
export const BRANCH_B_ID = '22222222-2222-4222-8222-222222222222';
export const BRANCH_CLOSED_ID = '33333333-3333-4333-8333-333333333333';

export function page<T>(items: T[], over: Partial<Paginated<T>> = {}): Paginated<T> {
  return { items, page: 1, pageSize: 20, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / 20)), ...over };
}

export function branch(over: Partial<BranchRecord> = {}): BranchRecord {
  return {
    id: BRANCH_A_ID,
    code: 'kochi-central',
    name: 'Kochi Central',
    address: '1 Marine Drive',
    city: 'Kochi',
    latitude: 9.97,
    longitude: 76.28,
    isActive: true,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    staffCount: 3,
    ...over
  };
}

export const BRANCHES: BranchRecord[] = [
  branch(),
  branch({ id: BRANCH_B_ID, code: 'kozhikode', name: 'Kozhikode Hub', city: 'Kozhikode', staffCount: 1 }),
  branch({ id: BRANCH_CLOSED_ID, code: 'closed', name: 'Closed Branch', isActive: false, staffCount: 0 })
];

export function staffBranch(over: Partial<StaffBranchEntry> = {}): StaffBranchEntry {
  return { id: BRANCH_A_ID, code: 'kochi-central', name: 'Kochi Central', isActive: true, isPrimary: true, ...over };
}

export function staff(over: Partial<StaffMember> = {}): StaffMember {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'asha.chef@proteinbowl.test',
    phone: '+91 98765 43210',
    status: 'ACTIVE',
    isEmailVerified: false,
    lastLoginAt: '2026-10-07T08:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    roles: [{ role: 'CHEF', scope: 'BRANCH' }],
    employeeProfile: { id: 'ep-1', employeeCode: 'EMP-CHEF-101', fullName: 'Asha Kitchen', designation: 'Sous Chef', shiftTiming: '06:00-14:00', primaryBranchId: BRANCH_A_ID },
    branches: [staffBranch()],
    invitation: { state: 'USED', expiresAt: '2026-09-04T08:00:00.000Z' },
    ...over
  };
}

export const STAFF_B_ID = '55555555-5555-4555-8555-555555555555';

export const STAFF_LIST: StaffMember[] = [
  staff(),
  staff({
    id: STAFF_B_ID,
    email: 'ravi.pos@proteinbowl.test',
    roles: [{ role: 'POS', scope: 'BRANCH' }],
    employeeProfile: { id: 'ep-2', employeeCode: 'EMP-POS-102', fullName: 'Ravi Counter', designation: 'Cashier', shiftTiming: null, primaryBranchId: BRANCH_B_ID },
    branches: [staffBranch({ id: BRANCH_B_ID, code: 'kozhikode', name: 'Kozhikode Hub' })]
  })
];

export function catalogue(): PermissionCatalogue {
  return {
    note: 'Descriptive only. Authorization is always enforced by the backend, never by the client.',
    roles: [
      { role: 'SUPER_ADMIN', scope: 'GLOBAL', permissions: ['staff:admin', 'audit:read', 'branch:read', 'branch:write'], assignableThroughAdminApi: false },
      { role: 'MD', scope: 'GLOBAL_READ', permissions: ['kds:read', 'branch:read'], assignableThroughAdminApi: true },
      { role: 'CHEF', scope: 'BRANCH', permissions: ['kds:read', 'kds:write'], assignableThroughAdminApi: true },
      { role: 'POS', scope: 'BRANCH', permissions: ['pos:read', 'pos:write'], assignableThroughAdminApi: true },
      { role: 'DELIVERY', scope: 'BRANCH_SELF', permissions: ['delivery:read', 'delivery:write'], assignableThroughAdminApi: true },
      { role: 'NUTRITIONIST', scope: 'ASSIGNMENT', permissions: [], assignableThroughAdminApi: true }
    ]
  };
}

export const SECRET_LINK_TOKEN = 'deadbeef'.repeat(8);

export function handoff(over: Partial<InvitationHandoff> = {}): InvitationHandoff {
  return {
    deliveryMode: 'manual',
    sentByEmail: false,
    expiresAt: '2026-10-11T08:00:00.000Z',
    setupLink: `http://localhost:3000/staff/accept-invite#token=${SECRET_LINK_TOKEN}`,
    note: 'No email was sent. Give this one-time link to the staff member through a secure channel. It is shown only once and expires automatically.',
    ...over
  };
}

export function audit(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'audit-1',
    createdAt: '2026-10-08T09:00:00.000Z',
    action: 'STAFF_CREATED',
    entity: 'User',
    entityId: '44444444-4444-4444-8444-444444444444',
    actor: { userId: 'admin-1', email: 'root@proteinbowl.test', role: 'SUPER_ADMIN' },
    ipAddress: '10.0.0.1',
    userAgent: 'vitest',
    payload: { roles: ['CHEF'], status: 'PENDING', password: '[REDACTED]' },
    ...over
  };
}
