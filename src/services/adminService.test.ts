import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError } from './apiClient';
import { AdminService, STEP_UP_HEADER } from './adminService';
import { BRANCH_A_ID, SECRET_LINK_TOKEN, handoff, page, staff } from '../test/adminFixtures';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('AdminService (HTTP contract)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    ApiClient.setAccessToken('admin-access-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    ApiClient.setAccessToken(null);
  });

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    return { url: String(url), init: init as RequestInit & { headers: Record<string, string> } };
  };

  it('listStaff sends search, status, role, branch and pagination as SERVER query parameters and omits empty ones', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: page([]) }));
    await AdminService.listStaff({ page: 2, pageSize: 20, q: '  asha ', status: 'ACTIVE', role: 'CHEF', branchId: BRANCH_A_ID });
    const { url, init } = lastCall();
    const params = new URL(url).searchParams;
    expect(new URL(url).pathname).toMatch(/\/admin\/staff$/);
    expect(Object.fromEntries(params)).toEqual({ page: '2', pageSize: '20', q: 'asha', status: 'ACTIVE', role: 'CHEF', branchId: BRANCH_A_ID });
    expect(init.headers.Authorization).toBe('Bearer admin-access-token');
    expect(init.headers[STEP_UP_HEADER]).toBeUndefined();

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: page([]) }));
    await AdminService.listStaff({ page: 1, q: '', status: '', role: '' });
    expect(Object.fromEntries(new URL(lastCall().url).searchParams)).toEqual({ page: '1' });
  });

  it('read-only calls (list, detail, audit, branches, catalogue) never carry a step-up header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: page([]) }));
    await AdminService.getStaff('s1');
    await AdminService.listAudit({ page: 1, action: 'STAFF_CREATED' });
    await AdminService.listBranches({ pageSize: 100 });
    await AdminService.getPermissionCatalogue();
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit & { headers: Record<string, string> }).headers[STEP_UP_HEADER]).toBeUndefined();
    }
    expect(String(fetchMock.mock.calls[1][0])).toContain('action=STAFF_CREATED');
  });

  it('createStaff attaches the proof only as the X-Step-Up-Token header, never in the body, and drops the raw setupToken', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { staff: staff(), invitation: { ...handoff(), setupToken: SECRET_LINK_TOKEN } } }, 201)
    );
    const result = await AdminService.createStaff({ fullName: 'Asha', email: 'a@b.co', designation: 'Chef', roles: ['CHEF'], branchIds: [BRANCH_A_ID] }, 'PROOF-1');
    const { url, init } = lastCall();
    expect(url).toMatch(/\/admin\/staff$/);
    expect(init.method).toBe('POST');
    expect(init.headers[STEP_UP_HEADER]).toBe('PROOF-1');
    expect(String(init.body)).not.toContain('PROOF-1');
    expect(result.invitation.setupLink).toContain('#token=');
    expect(Object.keys(result.invitation)).not.toContain('setupToken');
    expect(JSON.stringify(result)).not.toMatch(/"setupToken"/);
  });

  it('updateStaff (profile edit) is a PATCH WITHOUT step-up', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: staff() }));
    await AdminService.updateStaff('s1', { phone: '+91 90000 00000' });
    const { url, init } = lastCall();
    expect(url).toMatch(/\/admin\/staff\/s1$/);
    expect(init.method).toBe('PATCH');
    expect(init.headers[STEP_UP_HEADER]).toBeUndefined();
  });

  it('role, branch, status and reissue calls all send the step-up header with the right method/endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { changed: true, staff: staff(), branches: [], invitation: handoff() } }));
    await AdminService.assignRole('s1', 'POS', 'P');
    await AdminService.revokeRole('s1', 'POS', 'P');
    await AdminService.assignBranch('s1', BRANCH_A_ID, 'P');
    await AdminService.revokeBranch('s1', BRANCH_A_ID, 'P');
    await AdminService.deactivateStaff('s1', { reason: 'left', status: 'DEACTIVATED' }, 'P');
    await AdminService.activateStaff('s1', { reason: 'back' }, 'P');
    await AdminService.reissueInvitation('s1', 'P');

    const seen = fetchMock.mock.calls.map(([u, i]) => `${(i as RequestInit).method} ${String(u).replace(/^.*\/api\/v1/, '')}`);
    expect(seen).toEqual([
      'POST /admin/staff/s1/roles',
      'DELETE /admin/staff/s1/roles/POS',
      'POST /admin/staff/s1/branches',
      `DELETE /admin/staff/s1/branches/${BRANCH_A_ID}`,
      'POST /admin/staff/s1/deactivate',
      'POST /admin/staff/s1/activate',
      'POST /admin/staff/s1/invitation'
    ]);
    for (const call of fetchMock.mock.calls) expect((call[1] as { headers: Record<string, string> }).headers[STEP_UP_HEADER]).toBe('P');
  });

  it('stepUp posts the password to /admin/step-up and returns only the server proof', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { stepUpToken: 'jwt', expiresInSeconds: 300 } }));
    const proof = await AdminService.stepUp('pw-123456789!');
    expect(lastCall().url).toMatch(/\/admin\/step-up$/);
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ password: 'pw-123456789!' });
    expect(proof).toEqual({ stepUpToken: 'jwt', expiresInSeconds: 300 });
  });

  it('a wrong step-up password (401 STEP_UP_FAILED) is surfaced directly and does NOT trigger a session refresh/retry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error: 'STEP_UP_FAILED', message: 'bad' }, 401));
    await expect(AdminService.stepUp('nope')).rejects.toMatchObject({ code: 'STEP_UP_FAILED', status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('acceptInvitation posts token + password to the public accept endpoint and returns nothing secret', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { activated: true } }));
    const result = await AdminService.acceptInvitation(SECRET_LINK_TOKEN, 'Str0ng-Passw0rd!x');
    expect(lastCall().url).toMatch(/\/auth\/staff\/accept-invite$/);
    expect(lastCall().init.method).toBe('POST');
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ token: SECRET_LINK_TOKEN, password: 'Str0ng-Passw0rd!x' });
    expect(result).toBeUndefined();
  });

  it('failures throw ApiRequestError carrying the server error code and HTTP status (never a fake success)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error: 'LAST_ROLE', message: 'x' }, 409));
    const err = await AdminService.revokeRole('s1', 'CHEF', 'P').catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ code: 'LAST_ROLE', status: 409 });
  });
});
