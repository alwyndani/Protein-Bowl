/**
 * Typed, single-flight loader for Razorpay Checkout (https://checkout.razorpay.com/v1/checkout.js).
 * - loads at most once (a shared cached promise; concurrent callers share one script tag);
 * - detects an already-present window.Razorpay;
 * - resolves ONLY after the script's load event confirmed the constructor exists (never opens checkout early);
 * - on failure removes the failed script tag and clears the cache so a retry loads a fresh one;
 * - holds no secrets: the URL is a constant and the public key id comes from our backend per payment session.
 */
export const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailureResponse {
  error?: { code?: string; description?: string; reason?: string; metadata?: { order_id?: string; payment_id?: string } };
}

export interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
  theme?: { color?: string };
}

export interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void): void;
}

export type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export class RazorpayLoadError extends Error {
  constructor(message = 'Razorpay Checkout could not be loaded') {
    super(message);
    this.name = 'RazorpayLoadError';
  }
}

let pending: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined') return Promise.reject(new RazorpayLoadError());
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (pending) return pending;

  pending = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_URL;
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    const fail = () => {
      script.remove(); // a failed tag must never linger (it would block a clean retry)
      pending = null;
      reject(new RazorpayLoadError());
    };
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else fail();
    };
    script.onerror = fail;
    // an earlier tag that never finished is replaced rather than duplicated
    document.querySelectorAll('script[data-razorpay-checkout]').forEach((el) => el.remove());
    document.head.appendChild(script);
  });
  return pending;
}

/** Test seam: forget the cached load. Not used by application code. */
export function resetRazorpayLoaderForTests(): void {
  pending = null;
  document.querySelectorAll('script[data-razorpay-checkout]').forEach((el) => el.remove());
}
