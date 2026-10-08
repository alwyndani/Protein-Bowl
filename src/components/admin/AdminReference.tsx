import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AdminService } from '../../services/adminService';
import type { BranchRecord, PermissionCatalogue } from '../../services/adminTypes';
import { AdminErrorInfo, describeAdminError } from './adminErrors';

/**
 * Reference data the workspace needs everywhere: the role catalogue (from the backend - nothing hard-coded here) and the
 * branch list. Loaded from the real APIs once the workspace has been authorized; reloadable after branch changes.
 */
interface ReferenceData {
  catalogue: PermissionCatalogue | null;
  branches: BranchRecord[];
  status: 'loading' | 'ready' | 'error';
  error: AdminErrorInfo | null;
  reload: () => void;
  reloadBranches: () => Promise<void>;
  /** Roles an administrator may assign/revoke (backend flag `assignableThroughAdminApi`). */
  assignableRoles: PermissionCatalogue['roles'];
  activeBranches: BranchRecord[];
}

const Ctx = createContext<ReferenceData | undefined>(undefined);

export function useAdminReference(): ReferenceData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminReference must be used inside <AdminReferenceProvider>');
  return ctx;
}

export const AdminReferenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [catalogue, setCatalogue] = useState<PermissionCatalogue | null>(null);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [status, setStatus] = useState<ReferenceData['status']>('loading');
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    Promise.all([AdminService.getPermissionCatalogue(), AdminService.listBranches({ pageSize: 100 })])
      .then(([cat, branchPage]) => {
        if (cancelled) return;
        setCatalogue(cat);
        setBranches(branchPage.items);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(describeAdminError(err));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const reloadBranches = useCallback(async () => {
    try {
      setBranches((await AdminService.listBranches({ pageSize: 100 })).items);
    } catch {
      /* the branch screen shows its own errors; stale reference data is refreshed on the next reload */
    }
  }, []);

  const value = useMemo<ReferenceData>(
    () => ({
      catalogue,
      branches,
      status,
      error,
      reload,
      reloadBranches,
      assignableRoles: (catalogue?.roles ?? []).filter((r) => r.assignableThroughAdminApi),
      activeBranches: branches.filter((b) => b.isActive)
    }),
    [catalogue, branches, status, error, reload, reloadBranches]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
