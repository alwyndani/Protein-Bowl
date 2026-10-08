import React, { useEffect, useRef } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import type { AdminErrorInfo } from './adminErrors';

/** Shared, deliberately small building blocks for the Super Admin workspace (existing dark stone/amber styling). */

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div role="status" className="flex items-center justify-center gap-3 py-10 text-stone-300 text-sm">
    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

export const ErrorNotice: React.FC<{ error: AdminErrorInfo | null; onRetry?: () => void; onDismiss?: () => void }> = ({ error, onRetry, onDismiss }) => {
  if (!error || error.kind === 'cancelled') return null;
  return (
    <div role="alert" className="flex items-start gap-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p data-testid="admin-error-message">{error.message}</p>
        {error.code && error.kind !== 'validation' && <p className="text-[10px] text-red-300/70 mt-0.5">Code: {error.code}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-bold underline">
            Retry
          </button>
        )}
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="font-bold underline">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="text-center text-sm text-stone-400 py-10 border border-dashed border-stone-800 rounded-2xl">{message}</div>
);

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  SUSPENDED: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  DEACTIVATED: 'bg-stone-700/40 text-stone-300 border-stone-600'
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] ?? STATUS_STYLES.DEACTIVATED}`}>{status}</span>
);

export const Chip: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'amber' | 'emerald' }> = ({ children, tone = 'neutral' }) => {
  const tones = {
    neutral: 'bg-stone-800 text-stone-200 border-stone-700',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
  };
  return <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${tones[tone]}`}>{children}</span>;
};

export const Pagination: React.FC<{ page: number; totalPages: number; total: number; onPage: (page: number) => void; disabled?: boolean }> = ({ page, totalPages, total, onPage, disabled }) => (
  <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-xs text-stone-400">
    <span data-testid="pagination-summary">
      {total} result{total === 1 ? '' : 's'} · page {page} of {Math.max(totalPages, 1)}
    </span>
    <div className="flex items-center gap-2">
      <button type="button" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className="p-1.5 rounded-lg bg-stone-800 border border-stone-700 disabled:opacity-40">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page" className="p-1.5 rounded-lg bg-stone-800 border border-stone-700 disabled:opacity-40">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </nav>
);

export const Field: React.FC<{ label: string; error?: string; hint?: string; htmlFor: string; children: React.ReactNode }> = ({ label, error, hint, htmlFor, children }) => (
  <div className="space-y-1">
    <label htmlFor={htmlFor} className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
      {label}
    </label>
    {children}
    {hint && !error && <p className="text-[11px] text-stone-500">{hint}</p>}
    {error && (
      <p role="alert" className="text-[11px] text-red-300">
        {error}
      </p>
    )}
  </div>
);

export const inputClass =
  'w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-sm text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500 disabled:opacity-50';

export const primaryButton =
  'inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-4 py-2 rounded-xl text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryButton =
  'inline-flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700 font-bold px-4 py-2 rounded-xl text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50 disabled:cursor-not-allowed';
export const dangerButton =
  'inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-black px-4 py-2 rounded-xl text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50 disabled:cursor-not-allowed';

/** Accessible modal dialog: role=dialog, aria-modal, labelled, Escape closes, focus moves in and returns on close. */
export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; closeDisabled?: boolean; wide?: boolean }> = ({ title, onClose, children, closeDisabled, wide }) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-modal-close])');
    (first ?? ref.current)?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !closeDisabled) {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto" onKeyDown={onKeyDown}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`bg-stone-900 border border-stone-800 rounded-3xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto shadow-2xl text-white focus:outline-none`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-stone-800">
          <h2 id={titleId} className="text-base font-black">
            {title}
          </h2>
          <button type="button" data-modal-close onClick={onClose} disabled={closeDisabled} aria-label="Close dialog" className="p-2 rounded-full bg-stone-800 border border-stone-700 hover:bg-stone-700 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
