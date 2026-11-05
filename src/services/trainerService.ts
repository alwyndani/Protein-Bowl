import { ApiClient } from './apiClient';

export interface Exercise { id?: string; name: string; sets: number; reps: string; restSeconds: number; notes?: string | null; videoUrl?: string | null }
export interface WorkoutDay { id?: string; dayOfWeek: string; title: string; focusArea: string; exercises: Exercise[] }
export interface WorkoutPlan {
  id: string; customerProfileId: string; title: string; goal: string; durationWeeks: number; status: string; notes: string | null; updatedAt: string; workoutDays: WorkoutDay[];
}
export interface PlanInput { title: string; goal: string; durationWeeks: number; notes?: string; days: WorkoutDay[] }
export interface WorkoutLog { id: string; workoutDayId: string | null; loggedOn: string; completed: boolean; perceivedEffort: number | null; bodyWeightKg: string | null; notes: string | null }
export interface TrainerClient { assignmentId: string; customerProfileId: string; fullName: string; plans: Array<{ id: string; title: string; status: string; updatedAt: string }> }
export interface TrainerAssignment { id: string; status: string; assignedAt: string; trainer: { id: string; email: string }; customerProfile: { id: string; fullName: string } }

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

/** Strips ids so a plan can be re-submitted as a replacement. */
export const toPlanInput = (p: WorkoutPlan): PlanInput => ({
  title: p.title, goal: p.goal, durationWeeks: p.durationWeeks, notes: p.notes ?? undefined,
  days: p.workoutDays.map((d) => ({ dayOfWeek: d.dayOfWeek, title: d.title, focusArea: d.focusArea, exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds, notes: e.notes ?? undefined, videoUrl: e.videoUrl ?? undefined })) }))
});

export class TrainerService {
  static clients() { return ApiClient.requestData<TrainerClient[]>('/trainer/clients'); }
  static plansFor(customerProfileId: string) { return ApiClient.requestData<WorkoutPlan[]>(`/trainer/clients/${encodeURIComponent(customerProfileId)}/plans`); }
  static createPlan(customerProfileId: string, input: PlanInput) { return ApiClient.requestData<WorkoutPlan>(`/trainer/clients/${encodeURIComponent(customerProfileId)}/plans`, json('POST', input)); }
  static updatePlan(planId: string, input: PlanInput) { return ApiClient.requestData<WorkoutPlan>(`/trainer/plans/${encodeURIComponent(planId)}`, json('PUT', input)); }
  static setStatus(planId: string, status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED') { return ApiClient.requestData<WorkoutPlan>(`/trainer/plans/${encodeURIComponent(planId)}/status`, json('POST', { status })); }
  static logs(planId: string) { return ApiClient.requestData<WorkoutLog[]>(`/trainer/plans/${encodeURIComponent(planId)}/logs`); }

  // SUPER_ADMIN
  static assignments() { return ApiClient.requestData<TrainerAssignment[]>('/trainer/admin/assignments'); }
  static assign(trainerUserId: string, customerEmail: string) { return ApiClient.requestData<TrainerAssignment>('/trainer/admin/assignments', json('POST', { trainerUserId, customerEmail })); }
  static endAssignment(id: string) { return ApiClient.requestData<TrainerAssignment>(`/trainer/admin/assignments/${encodeURIComponent(id)}/end`, json('POST', {})); }

  // CUSTOMER
  static myPlans() { return ApiClient.requestData<WorkoutPlan[]>('/trainer/my/plans'); }
  static myLogs(planId: string) { return ApiClient.requestData<WorkoutLog[]>(`/trainer/my/plans/${encodeURIComponent(planId)}/logs`); }
  static logProgress(planId: string, input: { workoutDayId?: string; completed: boolean; perceivedEffort?: number; bodyWeightKg?: number; notes?: string }) {
    return ApiClient.requestData<WorkoutLog>(`/trainer/my/plans/${encodeURIComponent(planId)}/logs`, json('POST', input));
  }
}
