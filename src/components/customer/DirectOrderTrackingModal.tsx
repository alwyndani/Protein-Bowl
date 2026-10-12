import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Search, Truck, MapPin, Loader2, AlertCircle, RefreshCw, PackageOpen } from 'lucide-react';
import { AccessibleDialog } from '../common/AccessibleDialog';
import { CancelOrderDialog } from './CancelOrderDialog';
import { OrderStatusBadges } from './OrderStatusBadges';
import { PaymentPanel } from './PaymentPanel';
import { DeliveryCodePanel } from './DeliveryCodePanel';
import { RefundNotice } from './RefundNotice';
import { OrderService } from '../../services/orderService';
import type { ApiOrder } from '../../services/commerceTypes';
import { formatInr, moneyToNumber } from '../../utils/money';
import { cancellationAvailable, orderStatusLabel } from '../../utils/orderLabels';
import { describeError, UserFacingError } from '../../utils/paymentErrors';

interface DirectOrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Order number (or id) to open directly, e.g. right after checkout or from a deep link. */
  initialOrderNumber?: string;
  /** Called when a request reports that the session is gone: the host shows the sign-in flow. */
  onSessionExpired?: () => void;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

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
 * Customer order history + order detail, backed ONLY by persisted server orders. Order status, payment status and refund status are
 * three separate states shown separately. Payment, cancellation and refund information all come from the server's derived fields.
 */
export const DirectOrderTrackingModal: React.FC<DirectOrderTrackingModalProps> = ({ isOpen, onClose, initialOrderNumber = '', onSessionExpired }) => {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<UserFacingError | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refreshingOrder, setRefreshingOrder] = useState(false);

  const handleLoadError = useCallback(
    (err: unknown): UserFacingError => {
      const info = describeError(err);
      if (info.action === 'SIGN_IN') onSessionExpired?.();
      return info;
    },
    [onSessionExpired]
  );

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
          // the list view is lighter than the detail view: always read the detail so the timeline and derived states are present
          try {
            const detail = await OrderService.getOrder(found.id);
            merged = list.map((o) => (o.id === detail.id ? detail : o));
          } catch {
            /* the list copy is still a trusted server copy */
          }
          selected = found.id;
        } else {
          try {
            const fetched = await OrderService.getOrder(initialOrderNumber);
            merged = [fetched, ...list];
            selected = fetched.id;
          } catch (lookup) {
            // a missing order and someone else's order are indistinguishable by design: always the same generic message
            setLookupError(handleLoadError(lookup).message);
          }
        }
      }

      setOrders(merged);
      setSelectedId(selected);
      setState('ready');
    } catch (err) {
      setOrders([]);
      setSelectedId(null);
      setError(handleLoadError(err));
      setState('error');
    }
  }, [initialOrderNumber, handleLoadError]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setCancelOpen(false);
      void load();
    }
  }, [isOpen, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? orders.filter((o) => o.orderNumber.toLowerCase().includes(q)) : orders;
  }, [orders, query]);

  const active = orders.find((o) => o.id === selectedId) || null;

  /** Publish a refreshed (trusted) order into the list. */
  const updateOrder = useCallback((fresh: ApiOrder) => {
    setOrders((prev) => (prev.some((o) => o.id === fresh.id) ? prev.map((o) => (o.id === fresh.id ? fresh : o)) : [fresh, ...prev]));
  }, []);

  const fetchActive = useCallback(() => OrderService.getOrder(selectedId ?? ''), [selectedId]);

  const refreshActive = async () => {
    if (!active || refreshingOrder) return;
    setRefreshingOrder(true);
    try {
      updateOrder(await OrderService.getOrder(active.id));
    } catch (err) {
      setLookupError(handleLoadError(err).message);
    } finally {
      setRefreshingOrder(false);
    }
  };

  if (!isOpen) return null;

  const showPayment = !!active && active.paymentMethod === 'ONLINE' && active.status !== 'CANCELLED' && !!active.payment && active.payment.state !== 'PAID';

  return (
    <AccessibleDialog
      label="Your orders"
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
      panelClassName="bg-stone-900 border border-stone-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden text-white focus:outline-none"
    >
      <div className="p-4 sm:p-5 border-b border-stone-800 bg-stone-950/90 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Truck className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="text-base sm:text-lg font-black text-white">Your orders</h3>
        </div>
        <button onClick={onClose} aria-label="Close" className="min-h-11 min-w-11 inline-flex items-center justify-center text-stone-400 hover:text-white bg-stone-800 rounded-full border border-stone-700 hover:bg-stone-700 transition-colors">
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
            {error && <p className="text-xs text-stone-500">{error.message}</p>}
            <button type="button" onClick={() => void load()} className="min-h-11 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold">
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
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white"
                />
              </label>
              <ul className="space-y-2" aria-label="Order history">
                {filtered.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(o.id)}
                      aria-current={selectedId === o.id ? 'true' : undefined}
                      data-testid={`history-order-${o.orderNumber}`}
                      className={`w-full min-h-11 text-left p-3 rounded-2xl border text-xs transition-colors ${selectedId === o.id ? 'border-cyan-500 bg-cyan-500/5' : 'border-stone-800 bg-stone-950/60 hover:border-stone-600'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-white">{o.orderNumber}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-800 border border-stone-700">{orderStatusLabel(o.status)}</span>
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
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-stone-500 uppercase tracking-wider">Order</div>
                      <div className="text-xl font-black text-white" data-testid="detail-order-number">{active.orderNumber}</div>
                      <div className="text-[11px] text-stone-500">Placed {new Date(active.createdAt).toLocaleString('en-IN')}</div>
                    </div>
                    <button type="button" onClick={() => void refreshActive()} disabled={refreshingOrder} data-testid="refresh-order" className="min-h-11 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold disabled:opacity-60">
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingOrder ? 'animate-spin' : ''}`} aria-hidden="true" />
                      Refresh
                    </button>
                  </div>

                  <OrderStatusBadges order={active} />

                  <RefundNotice order={active} />

                  {active.status === 'DISPATCHED' && active.paymentMethod === 'ONLINE' && (
                    <DeliveryCodePanel key={active.id} orderId={active.id} onSessionExpired={onSessionExpired} onVerified={() => void refreshActive()} />
                  )}

                  {showPayment && <PaymentPanel key={active.id} order={active} fetchOrder={fetchActive} onOrder={updateOrder} onSessionExpired={onSessionExpired} />}

                  {cancellationAvailable(active) && (
                    <div>
                      <button type="button" onClick={() => setCancelOpen(true)} data-testid="cancel-order-button" className="min-h-11 px-4 py-2 rounded-xl border border-red-500/50 text-red-300 hover:bg-red-950/40 text-xs font-bold">
                        Cancel order
                      </button>
                    </div>
                  )}

                  {active.timeline && active.timeline.length > 0 && (
                    <ol aria-label="Order timeline" className="space-y-1 text-[11px] text-stone-400">
                      {active.timeline.map((t, i) => (
                        <li key={`${t.toStatus}-${i}`}>
                          {orderStatusLabel(t.toStatus)} <span className="text-stone-600">· {new Date(t.at).toLocaleString('en-IN')}</span>
                        </li>
                      ))}
                    </ol>
                  )}

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

      {cancelOpen && active && <CancelOrderDialog order={active} onClose={() => setCancelOpen(false)} onOrder={updateOrder} onSessionExpired={onSessionExpired} />}
    </AccessibleDialog>
  );
};
