import { formatInr } from './money';
import type { CheckoutPreview } from './types';

/**
 * A canonical, DISPLAY-SAFE signature of everything the customer reviewed on the checkout screen: every server summary figure, the
 * server minimum-order state, and each line (product, variant, quantity, unit price, line total) - all taken verbatim from the
 * server preview. Amounts are normalised through the presentation formatter (two decimals, string-exact), so two server values that
 * display identically (for example 0.3 and 0.30000000000000004) compare equal, while ANY change the customer could see (a fee, the tax,
 * a discount, a line price or quantity, the net total) compares different even when another figure (such as the net total) happens to
 * stay the same. Nothing is summed, multiplied or reconstructed from line items; this is equality of server values only.
 */
export function previewSignature(preview: CheckoutPreview): string {
  const s = preview.summary;
  const money = [s.itemsSubtotal, s.totalTax, s.containerDepositTotal, s.packagingFee, s.deliveryFee, s.discountAmount, s.netAmount].map((v) => formatInr(v));
  const lines = preview.items.map((i) => [i.productId, i.variantId ?? '', String(i.quantity), formatInr(i.unitPrice), formatInr(i.totalPrice)].join(':'));
  const m = preview.minimumOrder;
  return JSON.stringify({ money, lines, minimum: [m.enabled, m.met, formatInr(m.requiredAmount)] });
}
