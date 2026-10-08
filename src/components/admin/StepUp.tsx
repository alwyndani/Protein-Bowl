import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiRequestError } from '../../services/apiClient';
import { AdminService } from '../../services/adminService';
import { describeAdminError, StepUpCancelledError } from './adminErrors';
import { ErrorNotice, Field, Modal, inputClass, primaryButton, secondaryButton } from './adminUi';
import type { AdminErrorInfo } from './adminErrors';

/**
 * Password step-up for sensitive administrative actions.
 *
 * The proof returned by POST /admin/step-up lives ONLY in this component's memory (a ref). It is never written to
 * localStorage / sessionStorage / cookies, never logged, never decoded or extended client-side. It is discarded on logout,
 * session change, unmount (page reload loses it naturally) and immediately when the backend rejects it.
 * The expiry used here is only the lifetime the SERVER reported - a hint to avoid sending a proof we know is dead.
 */
interface StepUpApi {
  /** Run a sensitive request with a valid proof, prompting for the password first when none is available. */
  withStepUp: <T>(action: (proof: string) => Promise<T>) => Promise<T>;
  hasProof: boolean;
  discardProof: () => void;
}

const StepUpContext = createContext<StepUpApi | undefined>(undefined);

export function useStepUp(): StepUpApi {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error('useStepUp must be used inside <StepUpProvider>');
  return ctx;
}

interface Proof {
  token: string;
  expiresAtMs: number;
}

interface PendingPrompt {
  promise: Promise<string>;
  resolve: (proof: string) => void;
  reject: (err: unknown) => void;
}

export const StepUpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const proofRef = useRef<Proof | null>(null);
  const promptRef = useRef<PendingPrompt | null>(null);
  const [hasProof, setHasProof] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const discardProof = useCallback(() => {
    proofRef.current = null;
    setHasProof(false);
  }, []);

  const cancelPrompt = useCallback(() => {
    promptRef.current?.reject(new StepUpCancelledError());
    promptRef.current = null;
    setDialogOpen(false);
  }, []);

  // Session change / logout -> the proof must not outlive the session that earned it.
  const userId = auth.user?.id ?? null;
  useEffect(() => {
    discardProof();
    cancelPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, auth.isAuthenticated]);

  // Unmount -> gone (reload also loses it: it only ever existed in memory).
  useEffect(
    () => () => {
      proofRef.current = null;
      promptRef.current?.reject(new StepUpCancelledError());
      promptRef.current = null;
    },
    []
  );

  const requestProof = useCallback((): Promise<string> => {
    const current = proofRef.current;
    if (current && Date.now() < current.expiresAtMs) return Promise.resolve(current.token);
    if (current) discardProof(); // server-reported lifetime elapsed

    if (promptRef.current) return promptRef.current.promise; // share one dialog between concurrent requests

    let resolve!: (p: string) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promptRef.current = { promise, resolve, reject };
    setDialogOpen(true);
    return promise;
  }, [discardProof]);

  const withStepUp = useCallback(
    async <T,>(action: (proof: string) => Promise<T>): Promise<T> => {
      const proof = await requestProof();
      try {
        return await action(proof);
      } catch (err) {
        // The backend refused the proof (expired / revoked / bound to another credential): drop it now.
        // We do NOT silently re-verify the password; the administrator must confirm again when they retry.
        if (err instanceof ApiRequestError && (err.code === 'STEP_UP_REQUIRED' || err.status === 401)) discardProof();
        throw err;
      }
    },
    [requestProof, discardProof]
  );

  const onVerified = useCallback((token: string, expiresInSeconds: number) => {
    proofRef.current = { token, expiresAtMs: Date.now() + expiresInSeconds * 1000 };
    setHasProof(true);
    promptRef.current?.resolve(token);
    promptRef.current = null;
    setDialogOpen(false);
  }, []);

  const value = useMemo<StepUpApi>(() => ({ withStepUp, hasProof, discardProof }), [withStepUp, hasProof, discardProof]);

  return (
    <StepUpContext.Provider value={value}>
      {children}
      {dialogOpen && <StepUpDialog onVerified={onVerified} onCancel={cancelPrompt} />}
    </StepUpContext.Provider>
  );
};

/** Password confirmation dialog. The password is held in local state only until submit, then cleared. */
export const StepUpDialog: React.FC<{ onVerified: (token: string, expiresInSeconds: number) => void; onCancel: () => void }> = ({ onVerified, onCancel }) => {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AdminErrorInfo | null>(null);
  const submitting = useRef(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || password.length === 0) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const proof = await AdminService.stepUp(password);
      setPassword('');
      onVerified(proof.stepUpToken, proof.expiresInSeconds);
    } catch (err) {
      setPassword('');
      setError(describeAdminError(err));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <Modal title="Confirm your password" onClose={onCancel} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4" aria-label="Password confirmation">
        <div className="flex items-start gap-3 text-xs text-stone-300">
          <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
          <p>This action changes access or accounts. Re-enter your Super Admin password to continue. The confirmation is kept in memory for a few minutes only.</p>
        </div>
        <Field label="Current password" htmlFor="stepup-password">
          <input
            id="stepup-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            className={inputClass}
          />
        </Field>
        <ErrorNotice error={error} />
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={pending} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending || password.length === 0} className={primaryButton}>
            {pending ? 'Verifying…' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
