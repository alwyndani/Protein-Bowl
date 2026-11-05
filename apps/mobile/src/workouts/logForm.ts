import { ApiError } from '../api/ApiError';
import { messageForError } from '../copy/errorCopy';
import type { LogInput } from './types';

export interface LogFormValues {
  workoutDayId: string | null;
  completed: boolean;
  effort: string;
  weight: string;
  notes: string;
}

export interface LogFormErrors {
  effort?: string;
  weight?: string;
  notes?: string;
}

/** Mirrors the server logSchema: effort int 1..10, weight 20..500 kg, notes <= 500 chars; all optional. */
export function validateLog(v: LogFormValues): { ok: true; body: LogInput } | { ok: false; errors: LogFormErrors } {
  const errors: LogFormErrors = {};
  const body: LogInput = { completed: v.completed };
  if (v.workoutDayId) body.workoutDayId = v.workoutDayId;

  const effort = v.effort.trim();
  if (effort) {
    if (!/^\d{1,2}$/.test(effort) || Number(effort) < 1 || Number(effort) > 10) errors.effort = 'Enter a whole number from 1 to 10.';
    else body.perceivedEffort = Number(effort);
  }
  const weight = v.weight.trim();
  if (weight) {
    const n = Number(weight);
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(weight) || !Number.isFinite(n) || n < 20 || n > 500) errors.weight = 'Enter a weight from 20 to 500 kg.';
    else body.bodyWeightKg = n;
  }
  const notes = v.notes.trim();
  if (notes.length > 500) errors.notes = 'Notes can be at most 500 characters.';
  else if (notes) body.notes = notes;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, body };
}

/** Customer-safe copy. A 409 here means the plan is no longer active; never raw server text. */
export function workoutMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.status === 409) return 'This plan is no longer active, so progress cannot be logged.';
    if (error.status === 404) return 'We could not find that plan. It may have changed - please refresh.';
  }
  return messageForError(error, 'generic');
}
