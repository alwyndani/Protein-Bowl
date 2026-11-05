import React, { useEffect, useState } from 'react';
import { Field, Modal, inputClass, primaryButton, secondaryButton } from './adminUi';
import type { OperateErrorInfo } from '../../utils/operateErrors';
import { useOperateAction } from './useOperateAction';

/** Shared building blocks of the SUPER_ADMIN delivery-operation dialogs. Every dialog performs ONE step-up-protected request and reports success only after the server confirms it. */

export const OperateErrorNotice: React.FC<{ error: OperateErrorInfo | null; onDismiss?: () => void }> = ({ error, onDismiss }) => {
  if (!error) return null;
  return (
    <div role="alert" data-testid="operate-error" className="flex items-start justify-between gap-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
      <span>{error.message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="font-bold underline shrink-0">
          Dismiss
        </button>
      )}
    </div>
  );
};

export const SuccessNotice: React.FC<{ message: string | null; testId: string }> = ({ message, testId }) =>
  message ? (
    <p role="status" data-testid={testId} className="text-xs text-emerald-200 bg-emerald-950/50 border border-emerald-800 rounded-xl px-3 py-2">
      {message}
    </p>
  ) : null;

interface DialogBase {
  onClose: () => void;
  /** Called ONLY after the server confirmed the action. */
  onDone: (message: string) => void;
  /** Called when the failure means the screen is out of date. */
  onStale: () => void;
}

function useStaleOnError(error: OperateErrorInfo | null, onStale: () => void) {
  useEffect(() => {
    if (error?.refresh) onStale();
  }, [error, onStale]);
}

/** A plain confirmation for an action that needs no input (start a delivery / claim or start a run / resume). */
export const ConfirmDialog: React.FC<
  DialogBase & {
    title: string;
    body: string;
    confirmLabel: string;
    /** Performs the step-up-protected request; resolves with the message to show ONLY once the server confirmed. */
    perform: () => Promise<string>;
  }
> = ({ title, body, confirmLabel, perform, onClose, onDone, onStale }) => {
  const { run, pending, error, clearError } = useOperateAction();
  useStaleOnError(error, onStale);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const outcome = await run(perform);
    if (outcome.ok) onDone(outcome.value);
  };
  return (
    <Modal title={title} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-xs text-stone-300">{body}</p>
        <p className="text-[11px] text-stone-400">You will be asked to confirm your password. The server decides the outcome; nothing here changes the order's payment.</p>
        <OperateErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButton} data-testid="operate-confirm">
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** A reason (and optionally a structured code + note) for takeover / failure / retry. */
export const ReasonDialog: React.FC<
  DialogBase & {
    title: string;
    intro: string;
    submitLabel: string;
    /** When given, the administrator must pick one of these codes. */
    codes?: ReadonlyArray<{ code: string; label: string }>;
    codeLabel?: string;
    /** Free-text label and rules. */
    textLabel: string;
    textHint: string;
    minLength: number;
    maxLength: number;
    /** A note is required for these codes (e.g. OTHER); otherwise optional when `minLength` is 0. */
    noteRequiredFor?: readonly string[];
    perform: (input: { code: string; text: string }) => Promise<string>;
  }
> = ({ title, intro, submitLabel, codes, codeLabel, textLabel, textHint, minLength, maxLength, noteRequiredFor, perform, onClose, onDone, onStale }) => {
  const { run, pending, error, clearError } = useOperateAction();
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  useStaleOnError(error, onStale);

  const trimmed = text.trim();
  const needsText = minLength > 0 || (!!code && !!noteRequiredFor?.includes(code));
  const requiredMin = minLength > 0 ? minLength : 3;
  const textOk = needsText ? trimmed.length >= requiredMin : true;
  const codeOk = !codes || !!code;
  const valid = textOk && codeOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const outcome = await run(() => perform({ code, text: trimmed }));
    if (outcome.ok) onDone(outcome.value);
  };

  return (
    <Modal title={title} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-xs text-stone-300">{intro}</p>
        {codes && (
          <Field label={codeLabel ?? 'Reason'} htmlFor="operate-code" error={touched && !codeOk ? 'Choose a reason.' : undefined}>
            <select id="operate-code" value={code} onChange={(e) => setCode(e.target.value)} disabled={pending} className={inputClass} aria-invalid={touched && !codeOk}>
              <option value="">Select…</option>
              {codes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={textLabel} htmlFor="operate-text" hint={textHint} error={touched && !textOk ? `Enter at least ${requiredMin} characters.` : undefined}>
          <textarea id="operate-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={maxLength} rows={3} disabled={pending} className={inputClass} aria-invalid={touched && !textOk} />
        </Field>
        <OperateErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButton} data-testid="operate-submit">
            {pending ? 'Working…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** Entry of the customer's / resident's 6-digit code. The digits are cleared from state the moment they are submitted and are never stored or logged. */
export const CodeDialog: React.FC<
  DialogBase & {
    title: string;
    intro: string;
    codeLabel: string;
    submitLabel: string;
    perform: (code: string) => Promise<string>;
  }
> = ({ title, intro, codeLabel, submitLabel, perform, onClose, onDone, onStale }) => {
  const { run, pending, error, clearError } = useOperateAction();
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  useStaleOnError(error, onStale);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (value.replace(/\D/g, '').length !== 6) {
      setLocalError('Enter the 6-digit code.');
      return;
    }
    setLocalError(null);
    const submitted = value;
    setValue(''); // the code never outlives the submit
    const outcome = await run(() => perform(submitted));
    if (outcome.ok) onDone(outcome.value);
  };

  return (
    <Modal title={title} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-xs text-stone-300">{intro}</p>
        <Field label={codeLabel} htmlFor="operate-code-input" error={localError ?? undefined}>
          <input
            id="operate-code-input"
            data-testid="operate-code-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9 -]*"
            autoComplete="off"
            maxLength={8}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d\s-]/g, ''))}
            disabled={pending}
            placeholder="123 456"
            className={`${inputClass} text-lg tracking-widest`}
            aria-invalid={!!localError}
          />
        </Field>
        <OperateErrorNotice error={error} onDismiss={clearError} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButton} data-testid="operate-submit">
            {pending ? 'Working…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};
