import { ApiError } from '../api/ApiError';
import { messageForError } from '../copy/errorCopy';

/** Customer-safe copy for the health and diet flows. Raw server text and codes are never shown. */
export function wellnessMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.code === 'HEALTH_PROFILE_INCOMPLETE') return 'Height, weight, goal and activity level are needed together before health details can be saved.';
    if (error.status === 404) return 'We could not find that. It may have changed - please refresh.';
    if (error.status === 400 && error.code !== 'INVALID_CLIENT_CONTRACT') return 'That is no longer possible because the plan has changed. Please refresh.';
  }
  return messageForError(error, 'generic');
}
