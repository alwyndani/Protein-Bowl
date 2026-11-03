import { describe, it, expect } from 'vitest';
import { APPROVED_BACKEND_ROLES, BACKEND_ROLE_FOR_UI_ROLE, RETIRED_BACKEND_ROLES, UI_ROLE_FOR_BACKEND_ROLE, isApprovedBackendRole } from './approvedRoles';

describe('approved roles (web)', () => {
  it('has exactly the six canonical backend identifiers', () => {
    expect([...APPROVED_BACKEND_ROLES]).toEqual(['CUSTOMER', 'CHEF', 'NUTRITIONIST', 'TRAINER', 'PROCUREMENT', 'SUPER_ADMIN']);
  });

  it('maps every approved backend role to one UI role and back (explicit, bijective)', () => {
    expect(Object.keys(UI_ROLE_FOR_BACKEND_ROLE).sort()).toEqual([...APPROVED_BACKEND_ROLES].sort());
    for (const b of APPROVED_BACKEND_ROLES) expect(BACKEND_ROLE_FOR_UI_ROLE[UI_ROLE_FOR_BACKEND_ROLE[b]]).toBe(b);
    expect(new Set(Object.values(UI_ROLE_FOR_BACKEND_ROLE)).size).toBe(6);
  });

  it('retired roles are never approved and have no UI mapping', () => {
    for (const r of RETIRED_BACKEND_ROLES) {
      expect(isApprovedBackendRole(r)).toBe(false);
      expect(Object.keys(UI_ROLE_FOR_BACKEND_ROLE)).not.toContain(r);
    }
    for (const retiredUi of ['md', 'delivery', 'pos', 'bakery_fmcg', 'tepache_erp', 'swiggy_zomato', 'mess_customer'] as const) {
      expect(BACKEND_ROLE_FOR_UI_ROLE[retiredUi as keyof typeof BACKEND_ROLE_FOR_UI_ROLE]).toBeUndefined();
    }
  });
});
