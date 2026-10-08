import React, { useState } from 'react';
import { ClipboardList, Lock, MapPin, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AdminReferenceProvider } from './AdminReference';
import { StepUpProvider } from './StepUp';
import { StaffManagement } from './StaffManagement';
import { StaffDetail } from './StaffDetail';
import { BranchManagement } from './BranchManagement';
import { AuditLog } from './AuditLog';
import { PermissionsView } from './PermissionsView';
import { Spinner } from './adminUi';

type Section = 'staff' | 'branches' | 'audit' | 'permissions';

const NAV: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: 'staff', label: 'Staff', icon: <Users className="w-4 h-4" aria-hidden="true" /> },
  { id: 'branches', label: 'Branches', icon: <MapPin className="w-4 h-4" aria-hidden="true" /> },
  { id: 'audit', label: 'Audit log', icon: <ClipboardList className="w-4 h-4" aria-hidden="true" /> },
  { id: 'permissions', label: 'Roles & permissions', icon: <ShieldCheck className="w-4 h-4" aria-hidden="true" /> }
];

export const AccessDenied: React.FC = () => (
  <div role="alert" className="max-w-xl mx-auto my-16 text-center bg-stone-900/70 border border-stone-800 rounded-3xl p-8 text-white space-y-3">
    <Lock className="w-8 h-8 text-amber-400 mx-auto" aria-hidden="true" />
    <h1 className="text-xl font-black">Not authorized</h1>
    <p className="text-sm text-stone-400">The Super Admin workspace is only available to Super Admin accounts. If you believe you should have access, contact the platform owner.</p>
  </div>
);

/**
 * Super Admin workspace (platform administration). The gate below is UX only: the backend authorizes every request.
 * No admin API is called - and no admin data is rendered - until the session has resolved AND holds SUPER_ADMIN.
 * The reference-data and step-up providers are mounted only inside the authorized branch, so a logout / role change
 * unmounts them (discarding the in-memory step-up proof).
 */
export const AdminWorkspace: React.FC = () => {
  const auth = useAuth();

  if (auth.isLoading) return <Spinner label="Checking your access…" />;
  const authorized = auth.isAuthenticated && !!auth.user?.roles?.includes('SUPER_ADMIN');
  if (!authorized) return <AccessDenied />;

  return (
    <AdminReferenceProvider>
      <StepUpProvider>
        <AdminShell />
      </StepUpProvider>
    </AdminReferenceProvider>
  );
};

const AdminShell: React.FC = () => {
  const [section, setSection] = useState<Section>('staff');
  const [staffId, setStaffId] = useState<string | null>(null);

  const go = (next: Section) => {
    setSection(next);
    setStaffId(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-white" data-testid="admin-workspace">
      <div className="mb-5">
        <p className="text-[11px] font-black uppercase tracking-wider text-rose-300">Platform administration</p>
        <h1 className="text-2xl sm:text-3xl font-black">Super Admin workspace</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[13rem_1fr] gap-5">
        <nav aria-label="Administration sections" className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                section === item.id ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900/70 text-stone-300 border-stone-800 hover:border-amber-500/40'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <main className="min-w-0">
          {section === 'staff' && (staffId ? <StaffDetail staffId={staffId} onBack={() => setStaffId(null)} /> : <StaffManagement onOpen={setStaffId} />)}
          {section === 'branches' && <BranchManagement />}
          {section === 'audit' && <AuditLog />}
          {section === 'permissions' && <PermissionsView />}
        </main>
      </div>
    </div>
  );
};
