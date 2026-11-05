import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MessService } from '../../services/messService';
import { MessOperateService } from '../../services/messOperateService';
import type { MessDeliveryMonitor, MessRun, MessStop, MessStopFailureCode } from '../../services/messTypes';
import { usePolledResource } from '../../hooks/usePolledResource';
import { describeOperateError } from '../../utils/operateErrors';
import { useAuth } from '../../context/AuthContext';
import { useAdminReference } from './AdminReference';
import { useStepUp } from './StepUp';
import { Chip, EmptyState, Spinner, formatDate, inputClass, primaryButton, secondaryButton } from './adminUi';
import { CodeDialog, ConfirmDialog, ReasonDialog, SuccessNotice } from './operateUi';

const STOP_FAILURES: ReadonlyArray<{ code: MessStopFailureCode; label: string }> = [
  { code: 'SERVICE_POINT_CLOSED', label: 'Service point closed' },
  { code: 'RECIPIENT_UNAVAILABLE', label: 'Nobody available to receive' },
  { code: 'CODE_NOT_AVAILABLE', label: 'Handover code not available' },
  { code: 'UNABLE_TO_REACH', label: 'Unable to reach the service point' },
  { code: 'VEHICLE_ISSUE', label: 'Vehicle problem' },
  { code: 'QUANTITY_MISMATCH', label: 'Quantity does not match' },
  { code: 'OTHER', label: 'Other' }
];

const PROOF_HINT: Record<string, string> = {
  NOT_AVAILABLE: '',
  CODE_NOT_ISSUED: 'No resident has requested the code yet.',
  READY_FOR_VERIFICATION: 'A resident has the code. Ask them to read it to you.',
  LOCKED: 'Code entry is locked for a while after too many wrong codes.',
  CODE_BLOCKED: 'This code is blocked. A resident must generate a new one.',
  CODE_EXPIRED: 'The code expired. A resident must generate a new one.',
  VERIFIED: 'Handover confirmed.'
};
const STATUS_LABEL: Record<MessStop['status'], string> = { PENDING: 'Waiting for handover', FAILED: 'Problem reported', HANDED_OVER: 'Handed over', CLOSED_UNDELIVERED: 'Closed, not delivered' };
const RUN_LABEL: Record<MessRun['status'], string> = { AVAILABLE: 'Not claimed', CLAIMED: 'Claimed, not started', IN_TRANSIT: 'Out for delivery', COMPLETED: 'Completed', CLOSED: 'Closed' };

type Active =
  | { kind: 'claim'; run: MessRun }
  | { kind: 'takeover'; run: MessRun }
  | { kind: 'dispatch'; run: MessRun }
  | { kind: 'verify'; run: MessRun; stop: MessStop }
  | { kind: 'fail'; run: MessRun; stop: MessStop }
  | { kind: 'retry'; run: MessRun; stop: MessStop };

const toPolled = (err: unknown) => {
  const info = describeOperateError(err);
  return { action: info.kind === 'session-expired' ? ('SIGN_IN' as const) : ('NONE' as const), message: info.message };
};

const StopCard: React.FC<{ run: MessRun; stop: MessStop; operating: boolean; onAct: (a: Active) => void }> = ({ run, stop, operating, onAct }) => {
  const sp = stop.servicePoint;
  const canWork = operating && run.status === 'IN_TRANSIT' && (stop.status === 'PENDING' || stop.status === 'FAILED');
  const retriesLeft = stop.attempt.number < stop.attempt.max;
  const hint = PROOF_HINT[stop.proof.state];
  return (
    <li data-testid="operate-stop" data-stop-status={stop.status} className="bg-stone-950/60 border border-stone-800 rounded-xl p-3 space-y-1">
      <p className="text-xs font-bold text-white">
        {sp.name}
        {sp.gateLabel ? ` · ${sp.gateLabel}` : ''} · {stop.expectedQuantity} meal{stop.expectedQuantity === 1 ? '' : 's'}
      </p>
      <p className="text-[11px] text-stone-400">{[sp.addressLine, sp.city, sp.postalCode].filter(Boolean).join(', ')}</p>
      {sp.deliveryInstructions && <p className="text-[11px] text-stone-300">Instructions: {sp.deliveryInstructions}</p>}
      <div className="flex flex-wrap gap-2">
        <Chip tone={stop.status === 'HANDED_OVER' ? 'emerald' : stop.status === 'FAILED' ? 'amber' : 'neutral'}>{STATUS_LABEL[stop.status]}</Chip>
        <Chip>
          Attempt {stop.attempt.number} of {stop.attempt.max}
        </Chip>
        {stop.failureCode && stop.status === 'FAILED' && <Chip tone="amber">{STOP_FAILURES.find((f) => f.code === stop.failureCode)?.label ?? 'Other'}</Chip>}
      </div>
      {stop.status === 'FAILED' && stop.failureNote && <p className="text-[11px] text-stone-300">Note: {stop.failureNote}</p>}
      {stop.status === 'PENDING' && hint && <p className="text-[11px] text-stone-400">{hint}</p>}
      {canWork && (
        <div className="flex flex-wrap gap-2 pt-1" data-testid="stop-actions">
          {stop.status === 'PENDING' && (
            <>
              <button type="button" onClick={() => onAct({ kind: 'verify', run, stop })} aria-label={`Enter handover code for ${sp.name}`} data-testid="act-stop-verify" className={primaryButton}>
                Enter handover code
              </button>
              <button type="button" onClick={() => onAct({ kind: 'fail', run, stop })} aria-label={`Report a problem at ${sp.name}`} data-testid="act-stop-fail" className={secondaryButton}>
                Report a problem
              </button>
            </>
          )}
          {stop.status === 'FAILED' &&
            (retriesLeft ? (
              <button type="button" onClick={() => onAct({ kind: 'retry', run, stop })} aria-label={`Reopen ${sp.name} for another attempt`} data-testid="act-stop-retry" className={primaryButton}>
                Reopen for another attempt
              </button>
            ) : (
              <p data-testid="stop-attempt-limit" className="text-[11px] text-red-200">
                The maximum number of attempts was reached. Use the exceptional handover confirmation in the Kerala Mess section.
              </p>
            ))}
        </div>
      )}
    </li>
  );
};

const RunCard: React.FC<{ run: MessRun; onAct: (a: Active) => void }> = ({ run, onAct }) => {
  const adminOwned = run.operator === 'ADMIN';
  const driverOwned = !!run.driver && !adminOwned;
  /** The server decides eligibility; the screen only offers a takeover for the states the backend allows (CLAIMED / IN_TRANSIT). */
  const canTakeOver = run.status === 'CLAIMED' || run.status === 'IN_TRANSIT';
  return (
    <li data-testid="operate-run" data-run-status={run.status} className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-black text-white">
            {run.slot} · {run.mealDate}
          </p>
          <p className="text-[11px] text-stone-400">
            {run.mealCount} meals · {run.stopCount} service point{run.stopCount === 1 ? '' : 's'} · released {formatDate(run.releasedAt)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip tone={run.status === 'IN_TRANSIT' ? 'amber' : run.status === 'COMPLETED' ? 'emerald' : 'neutral'}>{RUN_LABEL[run.status]}</Chip>
            {adminOwned && <Chip tone="emerald">Operated by an administrator</Chip>}
            {driverOwned && (
              <Chip tone="amber">
                Driver: {run.driver!.name} ({run.driver!.employeeCode})
              </Chip>
            )}
          </div>
          {driverOwned && canTakeOver && !run.driver?.employeeId && (
            <p data-testid="driver-owned-note" className="text-[11px] text-amber-200">
              A driver owns this run, but the server did not say which employee. Refresh the list; the run cannot be taken over until it does.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2" data-testid="run-actions">
          {driverOwned && canTakeOver && !!run.driver?.employeeId && (
            <button type="button" onClick={() => onAct({ kind: 'takeover', run })} aria-label={`Take over the ${run.slot} run of ${run.mealDate} from the driver`} data-testid="act-run-takeover" className={primaryButton}>
              Take over from driver
            </button>
          )}
          {run.status === 'AVAILABLE' && (
            <button type="button" onClick={() => onAct({ kind: 'claim', run })} aria-label={`Claim the ${run.slot} run of ${run.mealDate}`} data-testid="act-run-claim" className={primaryButton}>
              Claim run
            </button>
          )}
          {run.status === 'CLAIMED' && adminOwned && (
            <button type="button" onClick={() => onAct({ kind: 'dispatch', run })} aria-label={`Start the ${run.slot} run of ${run.mealDate}`} data-testid="act-run-dispatch" className={primaryButton}>
              Start run
            </button>
          )}
        </div>
      </div>
      <ul className="space-y-2" aria-label="Service point stops">
        {run.stops.map((s) => (
          <StopCard key={s.id} run={run} stop={s} operating={adminOwned} onAct={onAct} />
        ))}
      </ul>
    </li>
  );
};

/** SUPER_ADMIN operation of Kerala Mess bulk delivery for ONE branch (claim, start, hand over with the resident's code, report a problem, reopen a stop). */
export const OperateMess: React.FC = () => {
  const reference = useAdminReference();
  const auth = useAuth();
  const { withStepUp } = useStepUp();
  const [branchId, setBranchId] = useState('');
  const poll = usePolledResource<MessDeliveryMonitor, ReturnType<typeof toPolled>>({
    fetcher: () => MessService.deliveryMonitor(branchId),
    resetKey: `mess-ops:${branchId}`,
    describeError: toPolled,
    enabled: !!branchId,
    onSessionExpired: () => void auth.logout(),
    serverTimeOf: (m) => m.serverTime
  });
  const [active, setActive] = useState<Active | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const data = poll.data;
  const done = (message: string) => {
    setNotice(message);
    setActive(null);
    void poll.refresh();
  };
  const common = { onClose: () => setActive(null), onDone: done, onStale: () => void poll.refresh() };
  const label = (r: MessRun) => `${r.slot} run of ${r.mealDate}`;

  const dialog = () => {
    if (!active) return null;
    switch (active.kind) {
      case 'claim': {
        const run = active.run;
        return (
          <ConfirmDialog
            {...common}
            title={`Claim the ${label(run)}`}
            body="You will operate this whole run: start it and hand over each service point's meals."
            confirmLabel="Claim run"
            perform={async () => {
              const r = await withStepUp((proof) => MessOperateService.claimRun(run.id, proof));
              return r.changed ? `The ${label(run)} is claimed.` : `No change: an administrator already operates the ${label(run)}.`;
            }}
          />
        );
      }
      case 'takeover': {
        const run = active.run;
        const driver = run.driver;
        return (
          <ReasonDialog
            {...common}
            title={`Take over the ${label(run)}`}
            intro={`This run belongs to ${driver?.name ?? 'a driver'}${driver ? ` (${driver.employeeCode})` : ''}. Taking it over moves it to the administrators; its status, timestamps and the stops already handed over are not changed.`}
            submitLabel="Take over"
            textLabel="Reason"
            textHint="Recorded in the audit log (3–1000 characters)."
            minLength={3}
            maxLength={1000}
            perform={async ({ text }) => {
              const expectedEmployeeId = driver?.employeeId;
              if (!expectedEmployeeId) throw new Error('missing driver employee id');
              const r = await withStepUp((proof) => MessOperateService.takeoverRun(run.id, { expectedEmployeeId, reason: text }, proof));
              return r.changed ? `The ${label(run)} is now operated by the administrators.` : `No change: the ${label(run)} was already taken over.`;
            }}
          />
        );
      }
      case 'dispatch': {
        const run = active.run;
        return (
          <ConfirmDialog
            {...common}
            title={`Start the ${label(run)}`}
            body="Confirm the meals have been collected and the run is leaving the kitchen."
            confirmLabel="Start run"
            perform={async () => {
              const r = await withStepUp((proof) => MessOperateService.dispatchRun(run.id, proof));
              return r.changed ? `The ${label(run)} is out for delivery.` : `No change: the ${label(run)} was already started.`;
            }}
          />
        );
      }
      case 'verify': {
        const { run, stop } = active;
        return (
          <CodeDialog
            {...common}
            title={`Confirm handover at ${stop.servicePoint.name}`}
            intro="Ask a resident of the service point for the 6-digit handover code shown in their meal calendar. The handover is only confirmed when the server accepts the code."
            codeLabel="Handover code"
            submitLabel="Confirm handover"
            perform={async (code) => {
              const r = await withStepUp((proof) => MessOperateService.verifyStop(run.id, stop.id, code, proof));
              return r.changed ? `Handover at ${stop.servicePoint.name} was confirmed.` : `No change: ${stop.servicePoint.name} was already handed over.`;
            }}
          />
        );
      }
      case 'fail': {
        const { run, stop } = active;
        return (
          <ReasonDialog
            {...common}
            title={`Report a problem at ${stop.servicePoint.name}`}
            intro="Use this when the meals could not be handed over. Nothing is refunded or compensated; the stop can be reopened for another attempt."
            submitLabel="Report problem"
            codes={STOP_FAILURES}
            textLabel="Note"
            textHint="Required for Other (at least 3 characters)."
            minLength={0}
            maxLength={1000}
            noteRequiredFor={['OTHER']}
            perform={async ({ code, text }) => {
              const r = await withStepUp((proof) => MessOperateService.failStop(run.id, stop.id, code as MessStopFailureCode, text || undefined, proof));
              return r.changed ? `A problem was reported at ${stop.servicePoint.name}.` : `No change: a problem was already reported at ${stop.servicePoint.name}.`;
            }}
          />
        );
      }
      case 'retry': {
        const { run, stop } = active;
        return (
          <ConfirmDialog
            {...common}
            title={`Reopen ${stop.servicePoint.name}`}
            body={`Reopens the stop for attempt ${stop.attempt.number + 1} of ${stop.attempt.max}. A resident will need to request a new handover code.`}
            confirmLabel="Reopen stop"
            perform={async () => {
              const r = await withStepUp((proof) => MessOperateService.retryStop(run.id, stop.id, proof));
              return r.changed ? `${stop.servicePoint.name} is open for another attempt.` : `No change: ${stop.servicePoint.name} is already open.`;
            }}
          />
        );
      }
    }
  };

  return (
    <section aria-label="Kerala Mess delivery operations" data-testid="operate-mess" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-stone-400 max-w-xl">Claim and run a Kerala Mess delivery run yourself. Runs of the last few days are listed; the exceptional handover confirmation remains in the Kerala Mess section.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="operate-mess-branch" className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">
              Branch
            </label>
            <select id="operate-mess-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
              <option value="">Select a branch…</option>
              {reference.activeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => void poll.refresh()} disabled={!branchId} className={secondaryButton} data-testid="operate-mess-refresh">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {!branchId && <EmptyState message="Choose a branch to see its Kerala Mess runs." />}
      <SuccessNotice message={notice} testId="operate-mess-notice" />
      {branchId && poll.stale && (
        <p role="alert" data-testid="operate-mess-stale" className="text-xs text-amber-200 bg-amber-950/50 border border-amber-700 rounded-xl px-3 py-2">
          {poll.loadError?.message ?? 'The list could not be refreshed.'} What you see may be out of date.
        </p>
      )}
      {branchId && poll.loadState === 'loading' && !data && <Spinner label="Loading runs…" />}
      {branchId && poll.loadState === 'error' && !data && (
        <div role="alert" data-testid="operate-mess-load-error" className="flex items-center justify-between gap-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
          <span>{poll.loadError?.message ?? 'The runs could not be loaded.'}</span>
          <button type="button" onClick={() => void poll.refresh()} className="font-bold underline">
            Retry
          </button>
        </div>
      )}
      {data && (data.runs.length === 0 ? <EmptyState message="No Kerala Mess runs for this branch in the last few days." /> : <ul className="space-y-3" aria-label="Kerala Mess runs">{data.runs.map((r) => <RunCard key={r.id} run={r} onAct={setActive} />)}</ul>)}
      {dialog()}
    </section>
  );
};
