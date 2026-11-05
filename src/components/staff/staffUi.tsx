import React, { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from '../../services/apiClient';

export const errorText = (e: unknown): string =>
  e instanceof ApiRequestError ? (e.status === 403 ? 'You are not allowed to do that.' : e.message) : 'Something went wrong. Please try again.';

/** Loads data once and on demand; failures are shown, never swallowed. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load };
}

export const Notice: React.FC<{ error?: string | null; ok?: string | null }> = ({ error, ok }) => (
  <>
    {error && <p role="alert" className="text-xs text-red-200 bg-red-950/60 border border-red-500/40 rounded-xl px-3 py-2">{error}</p>}
    {ok && <p role="status" className="text-xs text-emerald-200 bg-emerald-950/60 border border-emerald-500/40 rounded-xl px-3 py-2">{ok}</p>}
  </>
);

export const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-3 ${className}`}>
    {title && <h2 className="text-sm font-black uppercase tracking-wider text-amber-300">{title}</h2>}
    {children}
  </section>
);

export const inputCls = 'w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500';
export const btnCls = 'bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-black text-xs rounded-lg px-3 py-2';
export const ghostBtnCls = 'border border-stone-700 hover:border-amber-500/50 disabled:opacity-50 text-stone-200 font-bold text-xs rounded-lg px-3 py-2';

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-[11px] font-bold text-stone-400 space-y-1"><span>{label}</span>{children}</label>
);
