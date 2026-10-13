/**
 * Normalised API failure. The server's `message` text is deliberately NOT kept: the UI renders only mapped copy
 * (src/copy/errorCopy.ts), never raw server text, stack traces or provider messages.
 */
export type ApiErrorKind =
  | 'http' // the server answered with a non-2xx status
  | 'network' // no answer: offline / DNS / connection failure
  | 'timeout' // the request exceeded the client timeout
  | 'malformed'; // a 2xx (or error) answer that is not the expected JSON envelope

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    public readonly status: number,
    public readonly code: string,
    /** Seconds from a Retry-After header, when present (429). */
    public readonly retryAfterSeconds?: number
  ) {
    super(`${kind}:${status}:${code}`);
    this.name = 'ApiError';
  }

  /** The request may not have reached (or been fully processed by) the server: its outcome is UNKNOWN. */
  get ambiguous(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'malformed' || this.status >= 500;
  }

  /** Safe to offer a retry button (never an automatic retry of a non-idempotent request). */
  get retryable(): boolean {
    return this.ambiguous || this.status === 429;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
