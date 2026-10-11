import React, { useEffect, useRef } from 'react';

/**
 * Reusable customer dialog (modelled on the accessible admin Modal, without touching it):
 * role=dialog + aria-modal, an accessible name, Escape closes (unless closeDisabled), focus moves in on open, Tab stays inside, and
 * focus returns to the previously focused element on close. The overlay/panel styling is passed in so existing screens keep their look.
 */
interface AccessibleDialogProps {
  /** Accessible name when there is no visible title element. */
  label?: string;
  /** id of a visible title element inside the dialog (preferred over `label`). */
  labelledBy?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  children: React.ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const AccessibleDialog: React.FC<AccessibleDialogProps> = ({ label, labelledBy, onClose, closeDisabled, overlayClassName, panelClassName, children }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }
    return () => previouslyFocused?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // an inner dialog closes alone
      if (!closeDisabled) onClose();
      return;
    }
    if (e.key === 'Tab' && panelRef.current) {
      e.stopPropagation();
      const items = Array.prototype.slice.call(panelRef.current.querySelectorAll(FOCUSABLE)) as HTMLElement[];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className={overlayClassName ?? 'fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto'} onKeyDown={onKeyDown}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} tabIndex={-1} className={panelClassName ?? 'bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl text-white focus:outline-none'}>
        {children}
      </div>
    </div>
  );
};
