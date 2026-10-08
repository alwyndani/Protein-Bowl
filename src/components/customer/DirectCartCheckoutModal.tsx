import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  ShoppingBag,
  MapPin,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  PackageOpen,
  RefreshCw
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { AddressService, CustomerAddressItem } from '../../services/addressService';
import { OrderService } from '../../services/orderService';
import type { ApiOrder, CheckoutPreview } from '../../services/commerceTypes';
import { formatInr, moneyToNumber } from '../../utils/money';

interface DirectCartCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTracking?: (orderNumber: string) => void;
}

type Step = 'cart' | 'address' | 'review' | 'success';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface NewAddressForm {
  title: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

const EMPTY_ADDRESS_FORM: NewAddressForm = {
  title: 'Home',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: 'Kerala',
  postalCode: '',
  isDefault: false
};

function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return `IK-${c.randomUUID()}`;
  return `IK-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const SummaryRow: React.FC<{ label: string; value: number; strong?: boolean; hideWhenZero?: boolean }> = ({ label, value, strong, hideWhenZero }) => {
  if (hideWhenZero && value === 0) return null;
  return (
    <div className={`flex justify-between ${strong ? 'text-white font-black text-base pt-2 border-t border-stone-800' : 'text-stone-300 text-xs'}`}>
      <span>{label}</span>
      <span data-testid={`summary-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{formatInr(value)}</span>
    </div>
  );
};

export const DirectCartCheckoutModal: React.FC<DirectCartCheckoutModalProps> = ({ isOpen, onClose, onOpenTracking }) => {
  const cart = useCart();
  const [step, setStep] = useState<Step>('cart');

  // Address step
  const [addresses, setAddresses] = useState<CustomerAddressItem[]>([]);
  const [addressState, setAddressState] = useState<LoadState>('idle');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [addressForm, setAddressForm] = useState<NewAddressForm>(EMPTY_ADDRESS_FORM);
  const [savingAddress, setSavingAddress] = useState(false);

  // Review step (server-authoritative preview)
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewState, setPreviewState] = useState<LoadState>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Order submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<ApiOrder | null>(null);
  // Synchronous double-submit guard + the idempotency key reused for retries of the SAME submission.
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const resetFlow = useCallback(() => {
    setStep('cart');
    setPreview(null);
    setPreviewState('idle');
    setPreviewError(null);
    setSubmitError(null);
    setPlacedOrder(null);
    setShowNewAddress(false);
    setAddressForm(EMPTY_ADDRESS_FORM);
    idempotencyKeyRef.current = null;
  }, []);

  // Each time the modal opens: start from the cart step and re-sync with the server cart.
  useEffect(() => {
    if (isOpen) {
      resetFlow();
      void cart.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadAddresses = useCallback(async () => {
    setAddressState('loading');
    setAddressError(null);
    try {
      const list = await AddressService.getAddresses();
      setAddresses(list);
      setSelectedAddressId((current) => {
        if (current && list.some((a) => a.id === current)) return current;
        return (list.find((a) => a.isDefault) || list[0])?.id ?? null;
      });
      setShowNewAddress(list.length === 0);
      setAddressState('ready');
    } catch (err) {
      setAddressError(errMessage(err, 'Could not load your addresses'));
      setAddressState('error');
    }
  }, []);

  const loadPreview = useCallback(async (addressId: string) => {
    setPreviewState('loading');
    setPreviewError(null);
    try {
      const result = await OrderService.checkoutPreview({ addressId });
      setPreview(result);
      setPreviewState('ready');
    } catch (err) {
      setPreview(null);
      setPreviewError(errMessage(err, 'Could not calculate your order total'));
      setPreviewState('error');
    }
  }, []);

  const goToAddress = () => {
    setStep('address');
    void loadAddresses();
  };

  const goToReview = () => {
    if (!selectedAddressId) return;
    setSubmitError(null);
    setStep('review');
    void loadPreview(selectedAddressId);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingAddress) return;
    setSavingAddress(true);
    setAddressError(null);
    try {
      const created = await AddressService.createAddress({
        title: addressForm.title.trim() || 'Home',
        addressLine1: addressForm.addressLine1.trim(),
        addressLine2: addressForm.addressLine2.trim() || undefined,
        city: addressForm.city.trim(),
        state: addressForm.state.trim() || 'Kerala',
        postalCode: addressForm.postalCode.trim(),
        isDefault: addressForm.isDefault || addresses.length === 0
      });
      setAddresses((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
      setSelectedAddressId(created.id);
      setShowNewAddress(false);
      setAddressForm(EMPTY_ADDRESS_FORM);
    } catch (err) {
      setAddressError(errMessage(err, 'Could not save this address'));
    } finally {
      setSavingAddress(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (submittingRef.current || !selectedAddressId || previewState !== 'ready') return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
    try {
      const order = await OrderService.createOrder({
        addressId: selectedAddressId,
        idempotencyKey: idempotencyKeyRef.current
      });
      setPlacedOrder(order);
      setStep('success');
      idempotencyKeyRef.current = null; // a new key for any future order
      void cart.refresh(); // the server consumed the cart in the order transaction
    } catch (err) {
      // Keep the same idempotency key so a retry can never create a duplicate order.
      setSubmitError(errMessage(err, 'We could not place your order. Please try again.'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const items = cart.cart?.items ?? [];
  const cartBusy = cart.isMutating;

  const stepLabels: Array<{ id: Step; label: string }> = [
    { id: 'cart', label: 'Cart' },
    { id: 'address', label: 'Address' },
    { id: 'review', label: 'Review' }
  ];

  return (
    <div role="dialog" aria-label="Cart and checkout" className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden text-white">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-800 bg-stone-950/90 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">{step === 'success' ? 'Order placed' : 'Your cart & checkout'}</h3>
              {step !== 'success' && (
                <div className="flex items-center gap-2 text-[11px] mt-0.5">
                  {stepLabels.map((s, i) => (
                    <span key={s.id} className={step === s.id ? 'text-amber-400 font-black' : 'text-stone-500'}>
                      {i + 1}. {s.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full border border-stone-700 hover:bg-stone-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* ---------------- CART STEP ---------------- */}
          {step === 'cart' && (
            <>
              {cart.status === 'loading' && !cart.cart && (
                <div role="status" className="flex items-center justify-center gap-3 py-12 text-stone-300 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading your cart…</span>
                </div>
              )}

              {cart.status === 'error' && (
                <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm text-stone-200">We could not load your cart.</p>
                  {cart.error && <p className="text-xs text-stone-500">{cart.error}</p>}
                  <button type="button" onClick={() => void cart.refresh()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Try again
                  </button>
                </div>
              )}

              {cart.mutationError && (
                <div role="alert" className="flex items-center justify-between gap-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
                  <span>{cart.mutationError}</span>
                  <button type="button" onClick={cart.dismissMutationError} className="font-bold underline">
                    Dismiss
                  </button>
                </div>
              )}

              {cart.status === 'ready' && items.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-stone-400">
                  <PackageOpen className="w-8 h-8" />
                  <p className="text-sm">Your cart is empty.</p>
                  <button type="button" onClick={onClose} className="text-xs font-bold text-amber-400 underline">
                    Continue shopping
                  </button>
                </div>
              )}

              {items.length > 0 && cart.cart && (
                <>
                  <ul className="space-y-3">
                    {items.map((item) => (
                      <li key={item.id} data-testid={`cart-item-${item.id}`} className="bg-stone-950/70 border border-stone-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black text-white truncate">{item.name}</div>
                          {item.variantName && <div className="text-[11px] text-stone-400">{item.variantName}</div>}
                          <div className="text-[11px] text-stone-500">{formatInr(item.unitPrice)} each</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={cartBusy || item.quantity <= 1}
                              onClick={() => void cart.updateQuantity(item.id, item.quantity - 1)}
                              aria-label={`Decrease quantity of ${item.name}`}
                              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 disabled:opacity-40"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-black" data-testid={`qty-${item.id}`}>{item.quantity}</span>
                            <button
                              type="button"
                              disabled={cartBusy}
                              onClick={() => void cart.updateQuantity(item.id, item.quantity + 1)}
                              aria-label={`Increase quantity of ${item.name}`}
                              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 disabled:opacity-40"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="w-20 text-right text-sm font-black text-amber-400">{formatInr(item.subtotal)}</div>
                          <button
                            type="button"
                            disabled={cartBusy}
                            onClick={() => void cart.removeItem(item.id)}
                            aria-label={`Remove ${item.name}`}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-950/50 disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="bg-stone-950/70 border border-stone-800 rounded-2xl p-4 space-y-1.5">
                    <SummaryRow label="Items subtotal" value={cart.cart.itemsSubtotal} />
                    <SummaryRow label="Container deposit" value={cart.cart.containerDepositTotal} hideWhenZero />
                    <p className="text-[11px] text-stone-500 pt-1">Tax, delivery and any fees are calculated by the server on the review step.</p>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      disabled={cartBusy}
                      onClick={() => void cart.clear()}
                      className="text-xs font-bold text-stone-400 hover:text-red-300 underline disabled:opacity-40"
                    >
                      Clear cart
                    </button>
                    <button
                      type="button"
                      disabled={cartBusy}
                      onClick={goToAddress}
                      className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-5 py-3 rounded-2xl text-sm flex items-center gap-2 disabled:opacity-60"
                    >
                      Continue to delivery
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ---------------- ADDRESS STEP ---------------- */}
          {step === 'address' && (
            <>
              {addressState === 'loading' && (
                <div role="status" className="flex items-center justify-center gap-3 py-10 text-stone-300 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading your addresses…</span>
                </div>
              )}

              {addressError && (
                <div role="alert" className="bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                  <span>{addressError}</span>
                  {addressState === 'error' && (
                    <button type="button" onClick={() => void loadAddresses()} className="font-bold underline">
                      Retry
                    </button>
                  )}
                </div>
              )}

              {addressState === 'ready' && addresses.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-xs font-black uppercase tracking-wider text-stone-400 mb-1">Delivery address</legend>
                  {addresses.map((a) => (
                    <label
                      key={a.id}
                      className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer ${
                        selectedAddressId === a.id ? 'border-amber-500 bg-amber-500/5' : 'border-stone-800 bg-stone-950/60'
                      }`}
                    >
                      <input type="radio" name="delivery-address" checked={selectedAddressId === a.id} onChange={() => setSelectedAddressId(a.id)} className="mt-1" />
                      <span className="text-xs text-stone-300">
                        <span className="block font-black text-white">
                          {a.title}
                          {a.isDefault && <span className="ml-2 text-[10px] text-emerald-400">Default</span>}
                        </span>
                        {a.addressLine1}
                        {a.addressLine2 ? `, ${a.addressLine2}` : ''}, {a.city}, {a.state} - {a.postalCode}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {addressState === 'ready' && !showNewAddress && (
                <button type="button" onClick={() => setShowNewAddress(true)} className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add a new address
                </button>
              )}

              {addressState === 'ready' && showNewAddress && (
                <form onSubmit={handleSaveAddress} className="space-y-3 bg-stone-950/60 border border-stone-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-400">
                    <MapPin className="w-3.5 h-3.5" /> New address
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="block">
                      <span className="block mb-1 text-stone-400">Label</span>
                      <input value={addressForm.title} onChange={(e) => setAddressForm({ ...addressForm, title: e.target.value })} className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white" />
                    </label>
                    <label className="block">
                      <span className="block mb-1 text-stone-400">Address line 1</span>
                      <input required minLength={3} value={addressForm.addressLine1} onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })} className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white" />
                    </label>
                    <label className="block">
                      <span className="block mb-1 text-stone-400">Address line 2 (optional)</span>
                      <input value={addressForm.addressLine2} onChange={(e) => setAddressForm({ ...addressForm, addressLine2: e.target.value })} className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white" />
                    </label>
                    <label className="block">
                      <span className="block mb-1 text-stone-400">City</span>
                      <input required minLength={2} value={addressForm.city} onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })} className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white" />
                    </label>
                    <label className="block">
                      <span className="block mb-1 text-stone-400">State</span>
                      <input value={addressForm.state} onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })} className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white" />
                    </label>
                    <label className="block">
                      <span className="block mb-1 text-stone-400">Postal code</span>
                      <input required minLength={4} value={addressForm.postalCode} onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })} className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white" />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-300">
                    <input type="checkbox" checked={addressForm.isDefault} onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })} />
                    Make this my default address
                  </label>
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={savingAddress} className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-4 py-2 rounded-xl text-xs disabled:opacity-60">
                      {savingAddress ? 'Saving…' : 'Save address'}
                    </button>
                    {addresses.length > 0 && (
                      <button type="button" onClick={() => setShowNewAddress(false)} className="text-xs text-stone-400 underline">
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              )}

              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setStep('cart')} className="text-xs font-bold text-stone-400 flex items-center gap-1">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to cart
                </button>
                <button
                  type="button"
                  disabled={!selectedAddressId || addressState !== 'ready'}
                  onClick={goToReview}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-5 py-3 rounded-2xl text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  Review order
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ---------------- REVIEW STEP ---------------- */}
          {step === 'review' && (
            <>
              {previewState === 'loading' && (
                <div role="status" className="flex items-center justify-center gap-3 py-10 text-stone-300 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Calculating your total…</span>
                </div>
              )}

              {previewState === 'error' && (
                <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm text-stone-200">We could not calculate your order total.</p>
                  {previewError && <p className="text-xs text-stone-500">{previewError}</p>}
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => selectedAddressId && void loadPreview(selectedAddressId)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Try again
                    </button>
                    <button type="button" onClick={() => setStep('cart')} className="text-xs font-bold text-stone-400 underline">
                      Back to cart
                    </button>
                  </div>
                </div>
              )}

              {previewState === 'ready' && preview && (
                <>
                  <ul className="space-y-2">
                    {preview.items.map((line, idx) => (
                      <li key={`${line.productId}-${line.variantId ?? 'base'}-${idx}`} className="flex items-center justify-between gap-3 text-xs bg-stone-950/60 border border-stone-800 rounded-xl px-3 py-2">
                        <span className="text-stone-200">
                          {line.title}
                          {line.variantName ? ` — ${line.variantName}` : ''} <span className="text-stone-500">× {line.quantity}</span>
                        </span>
                        <span className="font-bold text-white">{formatInr(line.totalPrice)}</span>
                      </li>
                    ))}
                  </ul>

                  {preview.deliveryAddress && (
                    <div className="flex items-start gap-2 text-xs text-stone-300 bg-stone-950/60 border border-stone-800 rounded-xl px-3 py-2">
                      <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <span className="block font-black text-white">{preview.deliveryAddress.recipientName}</span>
                        {preview.deliveryAddress.addressLine1}
                        {preview.deliveryAddress.addressLine2 ? `, ${preview.deliveryAddress.addressLine2}` : ''}, {preview.deliveryAddress.city},{' '}
                        {preview.deliveryAddress.state} - {preview.deliveryAddress.postalCode}
                      </span>
                    </div>
                  )}

                  <div className="bg-stone-950/70 border border-stone-800 rounded-2xl p-4 space-y-1.5" data-testid="checkout-summary">
                    <SummaryRow label="Items subtotal" value={preview.summary.itemsSubtotal} />
                    <SummaryRow label="Tax" value={preview.summary.totalTax} />
                    <SummaryRow label="Container deposit" value={preview.summary.containerDepositTotal} hideWhenZero />
                    <SummaryRow label="Packaging" value={preview.summary.packagingFee} hideWhenZero />
                    <SummaryRow label="Delivery" value={preview.summary.deliveryFee} />
                    <SummaryRow label="Discount" value={preview.summary.discountAmount} hideWhenZero />
                    <SummaryRow label="Total" value={preview.summary.netAmount} strong />
                  </div>

                  <div className="flex items-start gap-2 text-[11px] text-stone-400 bg-stone-950/60 border border-stone-800 rounded-xl px-3 py-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Totals are calculated by our server. Online payment is not available yet: your order will be placed with payment status <strong>PENDING</strong> and you will not be charged now.
                    </span>
                  </div>

                  {submitError && (
                    <div role="alert" className="bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-2xl px-4 py-3">
                      {submitError}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button type="button" disabled={submitting} onClick={() => setStep('address')} className="text-xs font-bold text-stone-400 flex items-center gap-1 disabled:opacity-40">
                      <ArrowLeft className="w-3.5 h-3.5" /> Change address
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handlePlaceOrder()}
                      className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-5 py-3 rounded-2xl text-sm flex items-center gap-2 disabled:opacity-60"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {submitting ? 'Placing order…' : 'Place order'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ---------------- SUCCESS STEP ---------------- */}
          {step === 'success' && placedOrder && (
            <div className="space-y-4" data-testid="order-confirmation">
              <div className="flex flex-col items-center text-center gap-2 py-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                <h4 className="text-lg font-black">Thank you — your order has been received</h4>
                <p className="text-xs text-stone-400">
                  Order number <strong className="text-white" data-testid="order-number">{placedOrder.orderNumber}</strong>
                </p>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-stone-800 border border-stone-700 text-stone-200">
                    Status: <strong data-testid="order-status">{placedOrder.status}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-stone-800 border border-stone-700 text-stone-200">
                    Payment: <strong data-testid="order-payment-status">{placedOrder.paymentStatus}</strong>
                  </span>
                </div>
              </div>

              <ul className="space-y-2">
                {placedOrder.items.map((it) => (
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
                <SummaryRow label="Items subtotal" value={moneyToNumber(placedOrder.totalAmount)} />
                <SummaryRow label="Tax" value={moneyToNumber(placedOrder.taxAmount)} />
                <SummaryRow label="Container deposit" value={moneyToNumber(placedOrder.containerDepositTotal)} hideWhenZero />
                <SummaryRow label="Packaging" value={moneyToNumber(placedOrder.packagingFee)} hideWhenZero />
                <SummaryRow label="Delivery" value={moneyToNumber(placedOrder.deliveryFee)} />
                <SummaryRow label="Discount" value={moneyToNumber(placedOrder.discountAmount)} hideWhenZero />
                <SummaryRow label="Total" value={moneyToNumber(placedOrder.netAmount)} strong />
              </div>

              {placedOrder.deliveryAddress && (
                <div className="flex items-start gap-2 text-xs text-stone-300">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{placedOrder.deliveryAddress}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={onClose} className="text-xs font-bold text-stone-400 underline">
                  Continue shopping
                </button>
                {onOpenTracking && (
                  <button
                    type="button"
                    onClick={() => onOpenTracking(placedOrder.orderNumber)}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-5 py-2.5 rounded-2xl text-sm"
                  >
                    View order
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
