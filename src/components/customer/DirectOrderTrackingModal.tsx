import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Search, Truck, MapPin, Loader2, AlertCircle, RefreshCw, PackageOpen } from 'lucide-react';
import { OrderService } from '../../services/orderService';
import type { ApiOrder } from '../../services/commerceTypes';
import { formatInr, moneyToNumber } from '../../utils/money';

interface DirectOrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Order number (or id) to open directly, e.g. right after checkout. */
  initialOrderNumber?: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const Row: React.FC<{ label: string; value: number; strong?: boolean; hideWhenZero?: boolean }> = ({ label, value, strong, hideWhenZero }) => {
  if (hideWhenZero && value === 0) return null;
  return (
    <div className={`flex justify-between ${strong ? 'text-white font-black text-base pt-2 border-t border-stone-800' : 'text-stone-300 text-xs'}`}>
      <span>{label}</span>
      <span>{formatInr(value)}</span>
    </div>
  );
};

/**
 * Customer order history + order detail, backed ONLY by persisted server orders.
 * The status shown is exactly what the server stores - no simulated progression.
 */
export const DirectOrderTrackingModal: React.FC<DirectOrderTrackingModalProps> = ({ isOpen, onClose, initialOrderNumber = '' }) => {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    setLookupError(null);
    try {
      const list = await OrderService.getMyOrders();
      let merged = list;
      let selected: string | null = list[0]?.id ?? null;

      if (initialOrderNumber) {
        const found = list.find((o) => o.orderNumber === initialOrderNumber || o.id === initialOrderNumber);
        if (found) {
          selected = found.id;
        } else {
          try {
            const fetched = await OrderService.getOrder(initialOrderNumber);
            merged = [fetched, ...list];
            selected = fetched.id;
          } catch (lookup) {
            setLookupError(errMessage(lookup, 'Order not found'));
          }
        }
      }

      setOrders(merged);
      setSelectedId(selected);
      setState('ready');
    } catch (err) {
      setOrders([]);
      setSelectedId(null);
      setError(errMessage(err, 'Could not load your orders'));
      setState('error');
    }
  }, [initialOrderNumber]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      void load();
    }
  }, [isOpen, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? orders.filter((o) => o.orderNumber.toLowerCase().includes(q)) : orders;
  }, [orders, query]);

  const active = orders.find((o) => o.id === selectedId) || null;

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-label="Your orders" className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden text-white">
        <div className="p-4 sm:p-5 border-b border-stone-800 bg-stone-950/90 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Truck className="w-5 h-5" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-white">Your orders</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full border border-stone-700 hover:bg-stone-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto">
          {state === 'loading' && (
            <div role="status" className="flex items-center justify-center gap-3 py-16 text-stone-300 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading your orders…</span>
            </div>
          )}

          {state === 'error' && (
            <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-stone-200">We could not load your orders.</p>
              {error && <p className="text-xs text-stone-500">{error}</p>}
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold">
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </button>
            </div>
          )}

          {state === 'ready' && lookupError && (
            <div role="alert" className="mb-4 bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs rounded-2xl px-4 py-3">
              {lookupError}
            </div>
          )}

          {state === 'ready' && orders.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-stone-400">
              <PackageOpen className="w-8 h-8" />
              <p className="text-sm">You have not placed any orders yet.</p>
            </div>
          )}

          {state === 'ready' && orders.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              <div className="md:col-span-2 space-y-3">
                <label className="relative block">
                  <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    aria-label="Search orders by number"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by order number"
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white"
                  />
                </label>
                <ul className="space-y-2" aria-label="Order history">
                  {filtered.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(o.id)}
                        data-testid={`history-order-${o.orderNumber}`}
                        className={`w-full text-left p-3 rounded-2xl border text-xs transition-colors ${
                          selectedId === o.id ? 'border-cyan-500 bg-cyan-500/5' : 'border-stone-800 bg-stone-950/60 hover:border-stone-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-white">{o.orderNumber}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-800 border border-stone-700">{o.status}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1 text-stone-400">
                          <span>{new Date(o.createdAt).toLocaleDateString('en-IN')}</span>
                          <span className="font-bold text-amber-400">{formatInr(o.netAmount)}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 && <li className="text-xs text-stone-500 px-1">No orders match that number.</li>}
                </ul>
              </div>

              <div className="md:col-span-3">
                {active ? (
                  <div className="space-y-4" data-testid="order-detail">
                    <div>
                      <div className="text-[11px] text-stone-500 uppercase tracking-wider">Order</div>
                      <div className="text-xl font-black text-white" data-testid="detail-order-number">{active.orderNumber}</div>
                      <div className="text-[11px] text-stone-500">Placed {new Date(active.createdAt).toLocaleString('en-IN')}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-200">
                        Order status: <strong data-testid="detail-status">{active.status}</strong>
                      </span>
                      <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200">
                        Payment status: <strong data-testid="detail-payment-status">{active.paymentStatus}</strong>
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500">Further status updates will appear here when the order is processed.</p>

                    <ul className="space-y-2">
                      {active.items.map((it) => (
                        <li key={it.id} className="flex items-center justify-between gap-3 text-xs bg-stone-950/60 border border-stone-800 rounded-xl px-3 py-2">
                          <span className="text-stone-200">
                            {it.itemTitle}
                            {it.variantName ? ` — ${it.variantName}` : ''} <span className="text-stone-500">× {it.quantity}</span>
                          </span>
                          <span className="font-bold text-white">{formatInr(it.totalPrice)}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="bg-stone-950/70 border border-stone-800 rounded-2xl p-4 space-y-1.5">
                      <Row label="Items subtotal" value={moneyToNumber(active.totalAmount)} />
                      <Row label="Tax" value={moneyToNumber(active.taxAmount)} />
                      <Row label="Container deposit" value={moneyToNumber(active.containerDepositTotal)} hideWhenZero />
                      <Row label="Packaging" value={moneyToNumber(active.packagingFee)} hideWhenZero />
                      <Row label="Delivery" value={moneyToNumber(active.deliveryFee)} />
                      <Row label="Discount" value={moneyToNumber(active.discountAmount)} hideWhenZero />
                      <Row label="Total" value={moneyToNumber(active.netAmount)} strong />
                    </div>

                    {(active.deliveryAddressSnapshot || active.deliveryAddress) && (
                      <div className="flex items-start gap-2 text-xs text-stone-300">
                        <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          {active.deliveryAddressSnapshot?.recipientName && <span className="block font-black text-white">{active.deliveryAddressSnapshot.recipientName}</span>}
                          {active.deliveryAddress}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-stone-500">Select an order to see its details.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
