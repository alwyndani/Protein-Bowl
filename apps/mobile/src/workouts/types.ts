/** Shapes served by GET/POST /trainer/my/* (server trainer.service.ts). Display-only; nothing here is computed locally. */
export type PlanStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export interface WorkoutExercise {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface WorkoutDay {
  id: string;
  dayOfWeek: DayOfWeek;
  title: string;
  focusArea: string | null;
  exercises: WorkoutExercise[];
}

export interface WorkoutPlan {
  id: string;
  title: string;
  goal: string | null;
  durationWeeks: number | null;
  notes: string | null;
  status: PlanStatus;
  workoutDays: WorkoutDay[];
}

export interface WorkoutLog {
  id: string;
  workoutPlanId: string;
  workoutDayId: string | null;
  loggedOn: string;
  completed: boolean;
  perceivedEffort: number | null;
  /** Prisma Decimal: serialised as a string (or number); shown as served. */
  bodyWeightKg: string | number | null;
  notes: string | null;
}

/** Body of POST /trainer/my/plans/:id/logs (strict on the server; no other keys exist). */
export interface LogInput {
  workoutDayId?: string;
  completed: boolean;
  perceivedEffort?: number;
  bodyWeightKg?: number;
  notes?: string;
}
