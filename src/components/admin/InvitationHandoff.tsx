import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, MailX } from 'lucide-react';
import type { InvitationHandoff as Handoff } from '../../services/adminTypes';
import { formatDate, inputClass, primaryButton, secondaryButton } from './adminUi';

/**
 * One-time manual invitation hand-off.
 *
 * The setup link (which embeds the secret token) exists ONLY in the props/state of the component tree that is currently
 * showing it. It is never written to localStorage / sessionStorage / cookies, never logged, and disappears the moment the
 * panel is dismissed or the page is reloaded - after that the only way to get a link is to reissue the invitation.
 */
export const InvitationHandoffPanel: React.FC<{ handoff: Handoff; staffLabel: string; reissued?: boolean; onDismiss: () => void }> = ({ handoff, staffLabel, reissued, onDismiss }) => {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handoff.setupLink);
      setCopied('copied');
    } catch {
      setCopied('failed'); // clipboard unavailable: the link stays selectable in the field below
    }
  };

  return (
    <section aria-label="Invitation hand-off" className="space-y-4">
      <div role="alert" className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 rounded-2xl px-4 py-3 text-amber-100">
        <MailX className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm">
          <p className="font-black uppercase tracking-wide" data-testid="no-email-banner">
            NO EMAIL WAS SENT
          </p>
          <p className="text-xs mt-1">{handoff.note}</p>
        </div>
      </div>

      <p className="text-sm text-stone-200">
        {reissued ? 'A NEW invitation was issued for ' : 'Invitation created for '}
        <strong className="text-white">{staffLabel}</strong>. {reissued && 'Any previous invitation link no longer works. '}Give the staff member this one-time link through a secure channel. It expires {formatDate(handoff.expiresAt)}.
      </p>

      <div className="space-y-2">
        <label htmlFor="invitation-link" className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
          One-time invitation link
        </label>
        <input id="invitation-link" readOnly value={handoff.setupLink} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono text-xs`} />
        <div className="flex items-center gap-3">
          <button type="button" onClick={copy} className={primaryButton}>
            {copied === 'copied' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied === 'copied' ? 'Copied' : 'Copy invitation link'}
          </button>
          {copied === 'failed' && <span className="text-xs text-amber-300">Could not copy automatically — select the link above and copy it manually.</span>}
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-stone-400">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
        <p>This link is shown only once. After you dismiss this panel (or reload the page) it cannot be displayed again — you would need to reissue the invitation.</p>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={onDismiss} className={secondaryButton}>
          I have handed it over — dismiss
        </button>
      </div>
    </section>
  );
};
