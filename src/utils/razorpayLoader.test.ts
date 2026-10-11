import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRazorpay, RAZORPAY_CHECKOUT_URL, RazorpayLoadError, resetRazorpayLoaderForTests } from './razorpayLoader';

const tags = () => Array.from(document.querySelectorAll('script[data-razorpay-checkout]')) as HTMLScriptElement[];
class Ctor {}

beforeEach(() => {
  delete window.Razorpay;
  resetRazorpayLoaderForTests();
});
afterEach(() => {
  delete window.Razorpay;
  resetRazorpayLoaderForTests();
});

describe('Razorpay checkout.js loader', () => {
  it('loads from the official URL exactly once for concurrent callers (one shared promise, one script tag)', async () => {
    const [a, b, c] = [loadRazorpay(), loadRazorpay(), loadRazorpay()];
    expect(tags()).toHaveLength(1);
    expect(tags()[0].src).toBe(RAZORPAY_CHECKOUT_URL);
    expect(RAZORPAY_CHECKOUT_URL).toBe('https://checkout.razorpay.com/v1/checkout.js');
    window.Razorpay = Ctor as never;
    tags()[0].dispatchEvent(new Event('load'));
    expect(await a).toBe(Ctor);
    expect(await b).toBe(Ctor);
    expect(await c).toBe(Ctor);
    expect(tags()).toHaveLength(1);
  });

  it('resolves ONLY after the load event: checkout can never be started before the script is ready', async () => {
    let settled = false;
    void loadRazorpay().then(() => (settled = true));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    window.Razorpay = Ctor as never;
    tags()[0].dispatchEvent(new Event('load'));
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(true);
  });

  it('uses an already-present window.Razorpay without adding any script tag', async () => {
    window.Razorpay = Ctor as never;
    expect(await loadRazorpay()).toBe(Ctor);
    expect(tags()).toHaveLength(0);
  });

  it('a load error removes the failed tag and clears the cache, so a retry loads a FRESH single tag', async () => {
    const first = loadRazorpay();
    tags()[0].dispatchEvent(new Event('error'));
    await expect(first).rejects.toBeInstanceOf(RazorpayLoadError);
    expect(tags()).toHaveLength(0);

    const second = loadRazorpay();
    expect(tags()).toHaveLength(1);
    window.Razorpay = Ctor as never;
    tags()[0].dispatchEvent(new Event('load'));
    expect(await second).toBe(Ctor);
  });

  it('a script that loads but does not define Razorpay is treated as a failure', async () => {
    const p = loadRazorpay();
    tags()[0].dispatchEvent(new Event('load')); // no window.Razorpay
    await expect(p).rejects.toBeInstanceOf(RazorpayLoadError);
    expect(tags()).toHaveLength(0);
  });

  it('the loader carries no secret: it only knows the public script URL', () => {
    const src = loadRazorpay.toString() + RAZORPAY_CHECKOUT_URL;
    expect(src).not.toMatch(/secret|key_id|rzp_/i);
    void loadRazorpay().catch(() => undefined);
  });
});
