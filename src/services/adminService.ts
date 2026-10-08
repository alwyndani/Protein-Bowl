import { ApiClient } from './apiClient';
import type {
  AuditEntry,
  AuditQuery,
  BranchListQuery,
  BranchRecord,
  ChangeResult,
  CreateBranchInput,
  CreateStaffInput,
  InvitationHandoff,
  Paginated,
  PermissionCatalogue,
  StaffBranchEntry,
  StaffListQuery,
  StaffMember,
  StaffWithInvitation,
  StepUpProof,
  UpdateBranchInput,
  UpdateStaffInput
} from './adminTypes';

/** Header carrying the password step-up proof; attached ONLY to requests that require it. */
export const STEP_UP_HEADER = 'X-Step-Up-Token';

function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.append(key, String(value));
  }
  const text = qs.toString();
  return text ? `?${text}` : '';
}

function proofOptions(proof?: string): RequestInit {
  return proof ? { headers: { [STEP_UP_HEADER]: proof } } : {};
}

function json(method: string, body?: unknown, proof?: string): RequestInit {
  const base = proofOptions(proof);
  return { ...base, method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };
}

/** Raw handoff as returned by the API (includes the one-time token). */
interface RawHandoff extends InvitationHandoff {
  setupToken?: string;
}

/** Keep only what the UI needs: the link. The standalone raw token is dropped immediately and never retained. */
function sanitizeHandoff(raw: RawHandoff): InvitationHandoff {
  return {
    deliveryMode: raw.deliveryMode,
    sentByEmail: raw.sentByEmail,
    expiresAt: raw.expiresAt,
    setupLink: raw.setupLink,
    note: raw.note
  };
}

function sanitizeWithInvitation(raw: { staff: StaffMember; invitation: RawHandoff }): StaffWithInvitation {
  return { staff: raw.staff, invitation: sanitizeHandoff(raw.invitation) };
}

/**
 * Typed client for the P6B administration API. Every method throws ApiRequestError on failure (never a fake success).
 * Authorization is enforced by the backend; this client only carries the bearer token (via ApiClient) and, for sensitive
 * actions, the in-memory step-up proof supplied by the caller.
 */
export class AdminService {
  // ------------------------------------------------------------ step-up
  public static async stepUp(password: string): Promise<StepUpProof> {
    return await ApiClient.requestData<StepUpProof>('/admin/step-up', json('POST', { password }));
  }

  // ------------------------------------------------------------ catalogue
  public static async getPermissionCatalogue(): Promise<PermissionCatalogue> {
    return await ApiClient.requestData<PermissionCatalogue>('/staff/permissions');
  }

  // ------------------------------------------------------------ staff
  public static async listStaff(query: StaffListQuery = {}): Promise<Paginated<StaffMember>> {
    return await ApiClient.requestData<Paginated<StaffMember>>(
      `/admin/staff${toQuery({ page: query.page, pageSize: query.pageSize, q: query.q?.trim(), status: query.status, role: query.role, branchId: query.branchId })}`
    );
  }

  public static async getStaff(id: string): Promise<StaffMember> {
    return await ApiClient.requestData<StaffMember>(`/admin/staff/${id}`);
  }

  public static async createStaff(input: CreateStaffInput, proof: string): Promise<StaffWithInvitation> {
    return sanitizeWithInvitation(await ApiClient.requestData('/admin/staff', json('POST', input, proof)));
  }

  public static async updateStaff(id: string, input: UpdateStaffInput): Promise<StaffMember> {
    return await ApiClient.requestData<StaffMember>(`/admin/staff/${id}`, json('PATCH', input));
  }

  public static async reissueInvitation(id: string, proof: string): Promise<StaffWithInvitation> {
    return sanitizeWithInvitation(await ApiClient.requestData(`/admin/staff/${id}/invitation`, json('POST', undefined, proof)));
  }

  // ------------------------------------------------------------ roles
  public static async assignRole(id: string, role: string, proof: string): Promise<ChangeResult<StaffMember>> {
    const r = await ApiClient.requestData<{ changed: boolean; staff: StaffMember }>(`/admin/staff/${id}/roles`, json('POST', { role }, proof));
    return { changed: r.changed, value: r.staff };
  }

  public static async revokeRole(id: string, role: string, proof: string): Promise<ChangeResult<StaffMember>> {
    const r = await ApiClient.requestData<{ changed: boolean; staff: StaffMember }>(`/admin/staff/${id}/roles/${encodeURIComponent(role)}`, json('DELETE', undefined, proof));
    return { changed: r.changed, value: r.staff };
  }

  // ------------------------------------------------------------ branches of a staff member
  public static async assignBranch(id: string, branchId: string, proof: string): Promise<ChangeResult<StaffBranchEntry[]>> {
    const r = await ApiClient.requestData<{ changed: boolean; branches: StaffBranchEntry[] }>(`/admin/staff/${id}/branches`, json('POST', { branchId }, proof));
    return { changed: r.changed, value: r.branches };
  }

  public static async revokeBranch(id: string, branchId: string, proof: string): Promise<ChangeResult<StaffBranchEntry[]>> {
    const r = await ApiClient.requestData<{ changed: boolean; branches: StaffBranchEntry[] }>(`/admin/staff/${id}/branches/${branchId}`, json('DELETE', undefined, proof));
    return { changed: r.changed, value: r.branches };
  }

  // ------------------------------------------------------------ status
  public static async deactivateStaff(id: string, input: { reason: string; status: 'DEACTIVATED' | 'SUSPENDED' }, proof: string): Promise<ChangeResult<StaffMember>> {
    const r = await ApiClient.requestData<{ changed: boolean; staff: StaffMember }>(`/admin/staff/${id}/deactivate`, json('POST', input, proof));
    return { changed: r.changed, value: r.staff };
  }

  public static async activateStaff(id: string, input: { reason: string }, proof: string): Promise<ChangeResult<StaffMember>> {
    const r = await ApiClient.requestData<{ changed: boolean; staff: StaffMember }>(`/admin/staff/${id}/activate`, json('POST', input, proof));
    return { changed: r.changed, value: r.staff };
  }

  // ------------------------------------------------------------ branch administration
  public static async listBranches(query: BranchListQuery = {}): Promise<Paginated<BranchRecord>> {
    return await ApiClient.requestData<Paginated<BranchRecord>>(
      `/admin/branches${toQuery({ page: query.page, pageSize: query.pageSize, isActive: query.isActive, q: query.q?.trim() })}`
    );
  }

  public static async getBranch(id: string): Promise<BranchRecord> {
    return await ApiClient.requestData<BranchRecord>(`/admin/branches/${id}`);
  }

  public static async createBranch(input: CreateBranchInput): Promise<BranchRecord> {
    return await ApiClient.requestData<BranchRecord>('/admin/branches', json('POST', input));
  }

  public static async updateBranch(id: string, input: UpdateBranchInput): Promise<BranchRecord> {
    return await ApiClient.requestData<BranchRecord>(`/admin/branches/${id}`, json('PATCH', input));
  }

  // ------------------------------------------------------------ audit
  public static async listAudit(query: AuditQuery = {}): Promise<Paginated<AuditEntry>> {
    return await ApiClient.requestData<Paginated<AuditEntry>>(
      `/admin/audit${toQuery({ page: query.page, pageSize: query.pageSize, actorUserId: query.actorUserId, action: query.action, entity: query.entity, entityId: query.entityId, from: query.from, to: query.to })}`
    );
  }

  // ------------------------------------------------------------ public: invitation acceptance
  public static async acceptInvitation(token: string, password: string): Promise<void> {
    await ApiClient.requestData<{ activated: boolean }>('/auth/staff/accept-invite', json('POST', { token, password }));
  }
}
