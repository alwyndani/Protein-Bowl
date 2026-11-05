import React, { useEffect, useState } from 'react';
import { DietService } from '../../services/dietService';
import type { CustomerProfile, DietPlanRequest, RecipeItem } from '../../types';
import { NutritionistDashboard } from './NutritionistDashboard';

/** Subset of what the API returns for a diet request (explicit selects server-side; unknown fields are ignored). */
interface ApiRequest {
  id: string;
  goal: string;
  status: string;
  planType: string | null;
  durationDays: number;
  dietaryPreference: string | null;
  cuisinePreference: string | null;
  grainPreference: string | null;
  spiceLevel: string | null;
  allergiesExclusions: string | null;
  customQuery: string | null;
  addonSlots: string[];
  preferredCategories: string[];
  calculatedPrice: number | null;
  revisionNotes: string | null;
  createdAt: string;
  customerProfile: {
    id: string;
    fullName: string;
    user?: { email?: string | null; phone?: string | null };
    healthBiometrics?: { bmi?: number; targetCalories?: number } | null;
  };
}

const STATUS_MAP: Record<string, DietPlanRequest['status']> = {
  SUBMITTED: 'pending_review',
  ASSIGNED: 'under_review',
  IN_REVIEW: 'under_review',
  PLAN_CREATED: 'plan_ready',
  REVISION_REQUESTED: 'revision_requested',
  COMPLETED: 'approved',
  REJECTED: 'rejected'
};

export function toUiRequest(r: ApiRequest): DietPlanRequest {
  const bio = r.customerProfile.healthBiometrics;
  return {
    id: r.id,
    customerId: r.customerProfile.id,
    customerName: r.customerProfile.fullName,
    customerEmail: r.customerProfile.user?.email ?? '',
    customerPhone: r.customerProfile.user?.phone ?? '',
    bmi: bio?.bmi ?? 0,
    goal: r.goal as DietPlanRequest['goal'],
    targetCalories: bio?.targetCalories ?? 0,
    planType: (r.planType ?? 'Standard') as DietPlanRequest['planType'],
    durationDays: r.durationDays,
    preferredCategories: r.preferredCategories ?? [],
    dietaryPreference: (r.dietaryPreference ?? '') as DietPlanRequest['dietaryPreference'],
    cuisinePreference: r.cuisinePreference ?? '',
    grainPreference: r.grainPreference ?? '',
    spiceLevel: (r.spiceLevel ?? 'Medium') as DietPlanRequest['spiceLevel'],
    allergiesExclusions: r.allergiesExclusions ?? '',
    customQuery: r.customQuery ?? undefined,
    addonSlots: r.addonSlots ?? [],
    status: STATUS_MAP[r.status] ?? 'under_review',
    revisionNotes: r.revisionNotes ?? undefined,
    calculatedPrice: r.calculatedPrice ?? undefined,
    createdAt: r.createdAt
  };
}

/** Maps the audited health-profile response to the fields the dashboard displays. Nothing is invented: absent stays absent. */
export function toProfile(api: Record<string, any> | null | undefined): CustomerProfile | undefined {
  const b = api?.healthBiometrics;
  if (!api || !b) return undefined;
  return {
    heightCm: b.heightCm,
    weightKg: b.weightKg,
    targetWeightKg: b.targetWeightKg ?? undefined,
    bmiCategory: b.bmiCategory,
    // The server recalculates every derived figure from the saved inputs and omits the calorie figures when they cannot be calculated:
    // an absent figure is shown as "Not provided", never as a number. `calculation` says why.
    calculation: b.calculation ?? undefined,
    bmr: b.bmr || undefined,
    maintenanceCalories: b.maintenanceCalories || undefined,
    calorieDeficitSurplus: b.bmr ? (b.calorieDeficitSurplus ?? undefined) : undefined,
    waterRequirementL: b.waterRequirementL ?? undefined,
    idealBodyWeightKg: b.idealBodyWeightKg ?? undefined,
    leanBodyMassKg: b.leanBodyMassKg ?? undefined,
    circumferences: b.circumferences ?? undefined,
    limbCircumferences: b.limbCircumferences ?? undefined,
    medicalConditions: b.medicalConditions ?? [],
    currentMedications: b.currentMedications ?? undefined,
    supplements: b.supplements ?? [],
    bloodTestResults: b.bloodTestResults ?? undefined
  } as unknown as CustomerProfile;
}

const box = 'bg-white border border-stone-200 rounded-2xl p-4';

/** NUTRITIONIST workspace: real queue, race-safe claim, audited health-profile access, then the plan builder. */
export const NutritionistWorkspace: React.FC<{ onOpenMenuModal: (recipe: RecipeItem) => void }> = ({ onOpenMenuModal }) => {
  const [unassigned, setUnassigned] = useState<ApiRequest[]>([]);
  const [claimed, setClaimed] = useState<ApiRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [u, c] = await Promise.all([DietService.getUnassignedQueue(), DietService.getClaimedQueue()]);
      setUnassigned(Array.isArray(u) ? u : []);
      setClaimed(Array.isArray(c) ? c : []);
      setError(null);
    } catch {
      setError('We could not load your queue. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const active = claimed.find((r) => r.id === selectedId) ?? claimed[0];
  useEffect(() => {
    if (!active) { setProfile(undefined); return; }
    let cancelled = false;
    setProfile(undefined);
    setProfileError(null);
    DietService.getAuthorizedHealthProfile(active.id)
      .then((p) => { if (!cancelled) setProfile(toProfile(p)); })
      .catch(() => { if (!cancelled) setProfileError('The health profile could not be loaded.'); });
    return () => { cancelled = true; };
  }, [active?.id]);

  const claim = async (id: string) => {
    if (claimingId) return;
    setClaimingId(id);
    const res = await DietService.claimRequest(id);
    setClaimingId(null);
    if (res.success) setSelectedId(id);
    await load(); // refresh first: a successful reload clears older errors
    if (!res.success) {
      setError(res.httpStatus === 409 ? 'Another nutritionist claimed that request first.' : 'The request could not be claimed.');
    }
  };

  if (loading) return <p role="status" className="max-w-4xl mx-auto p-12 text-center text-stone-500">Loading your queue…</p>;

  return (
    <div className="space-y-4" data-testid="nutritionist-workspace">
      <div className="max-w-7xl mx-auto px-4 pt-4 space-y-3">
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        <section className={box} aria-label="Unclaimed requests">
          <h2 className="text-xs font-black uppercase tracking-wider text-stone-500 mb-2">New requests waiting ({unassigned.length})</h2>
          {unassigned.length === 0 && <p className="text-sm text-stone-500">No unclaimed requests.</p>}
          <ul className="divide-y divide-stone-100">
            {unassigned.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span><b>{r.customerProfile.fullName}</b> · {r.goal} · {r.durationDays} days{r.allergiesExclusions ? ` · allergies: ${r.allergiesExclusions}` : ''}</span>
                <button disabled={claimingId !== null} onClick={() => void claim(r.id)} className="bg-teal-800 hover:bg-teal-900 disabled:opacity-60 text-white text-xs font-black rounded-lg px-3 py-2">
                  {claimingId === r.id ? 'Claiming…' : 'Claim'}
                </button>
              </li>
            ))}
          </ul>
        </section>
        {profileError && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{profileError}</p>}
      </div>

      <NutritionistDashboard
        requests={claimed.map(toUiRequest)}
        customerProfile={profile}
        onUpdatePlan={() => { void load(); }}
        onOpenMenuModal={onOpenMenuModal}
        onSelectRequest={setSelectedId}
      />
    </div>
  );
};
