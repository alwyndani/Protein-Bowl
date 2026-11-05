import { ApiClient } from './apiClient';
import type { MessRun, MessStopFailureCode } from './messTypes';

/** Header carrying the password step-up proof. */
const STEP_UP_HEADER = 'X-Step-Up-Token';
const withProof = (proof: string) => ({ headers: { [STEP_UP_HEADER]: proof } });

export interface MessRunResult {
  changed: boolean;
}
export interface MessTakeoverInput {
  /** The driver THIS screen showed owning the run (monitor `driver.employeeId`); a mismatch is a 409 instead of an overwrite. */
  expectedEmployeeId: string;
  reason: string;
}
export interface MessStopResult {
  changed: boolean;
  run: MessRun;
}

/**
 * SUPER_ADMIN operation of Kerala Mess bulk delivery (mounted by the backend at /api/v1/admin/mess/delivery/runs/...).
 * Every write takes the password step-up proof as a REQUIRED argument and sends it only as X-Step-Up-Token. The run list is the existing SUPER_ADMIN monitor
 * (MessService.deliveryMonitor). The handover code travels only in the body of verifyStop() and is never stored, logged or returned. Nothing is retried automatically.
 *
 * takeoverRun() moves a run a legacy driver owns to the administrators. It sends the driver's employee id exactly as the SUPER_ADMIN monitor reported it
 * (expectedEmployeeId); the server compares it under the run lock and refuses a stale or wrong id with 409 RUN_OWNER_CHANGED.
 */
export class MessOperateService {
  private static run(runId: string, tail: string): string {
    return `/admin/mess/delivery/runs/${encodeURIComponent(runId)}${tail}`;
  }
  private static stop(runId: string, stopId: string, tail: string): string {
    return this.run(runId, `/stops/${encodeURIComponent(stopId)}${tail}`);
  }

  public static async claimRun(runId: string, proof: string): Promise<MessRunResult> {
    return await ApiClient.requestData<MessRunResult>(this.run(runId, '/claim'), { method: 'POST', body: JSON.stringify({}), ...withProof(proof) });
  }

  public static async dispatchRun(runId: string, proof: string): Promise<MessRunResult> {
    return await ApiClient.requestData<MessRunResult>(this.run(runId, '/dispatch'), { method: 'POST', body: JSON.stringify({}), ...withProof(proof) });
  }

  public static async takeoverRun(runId: string, input: MessTakeoverInput, proof: string): Promise<MessStopResult> {
    return await ApiClient.requestData<MessStopResult>(this.run(runId, '/takeover'), {
      method: 'POST',
      body: JSON.stringify({ expectedEmployeeId: input.expectedEmployeeId, reason: input.reason.trim() }),
      ...withProof(proof)
    });
  }

  /** The code is sent ONLY in this body. */
  public static async verifyStop(runId: string, stopId: string, code: string, proof: string): Promise<MessStopResult> {
    return await ApiClient.requestData<MessStopResult>(this.stop(runId, stopId, '/verify'), { method: 'POST', body: JSON.stringify({ code }), ...withProof(proof) });
  }

  public static async failStop(runId: string, stopId: string, reasonCode: MessStopFailureCode, note: string | undefined, proof: string): Promise<MessStopResult> {
    const n = note?.trim();
    return await ApiClient.requestData<MessStopResult>(this.stop(runId, stopId, '/fail'), { method: 'POST', body: JSON.stringify(n ? { reasonCode, note: n } : { reasonCode }), ...withProof(proof) });
  }

  public static async retryStop(runId: string, stopId: string, proof: string): Promise<MessStopResult> {
    return await ApiClient.requestData<MessStopResult>(this.stop(runId, stopId, '/retry'), { method: 'POST', body: JSON.stringify({}), ...withProof(proof) });
  }
}
