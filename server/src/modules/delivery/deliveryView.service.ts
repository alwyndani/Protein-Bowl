import { prisma } from '../../config/database.js';
import { MAX_DELIVERY_ATTEMPTS } from './deliveryAttemptPolicy.js';

/**
 * P9C customer-facing delivery state. These are DTO/UI-derived labels ONLY (they are never stored and are not OrderStatus values).
 * The customer never receives the failure reason, any note, the driver, security counters or proof internals - only the label and the attempt number.
 */
export type CustomerDeliveryState = 'ON_THE_WAY' | 'DELIVERY_ISSUE' | 'RETRY_PLANNED' | 'UNDELIVERABLE_REFUND_PENDING' | 'DELIVERED';

export interface CustomerDeliveryView {
  state: CustomerDeliveryState;
  attemptNumber: number;
  maxAttempts: number;
}

export class DeliveryViewService {
  /** Two queries for many orders. Orders without a delivery story (everything before DISPATCHED) get no entry. */
  public static async deriveForOrders(orders: Array<{ id: string; status: string; orderType?: string }>): Promise<Map<string, CustomerDeliveryView>> {
    const out = new Map<string, CustomerDeliveryView>();
    const live = orders.filter((o) => (o.status === 'DISPATCHED' || o.status === 'DELIVERED') && (o.orderType === undefined || o.orderType === 'DIRECT'));
    const cancelled = orders.filter((o) => o.status === 'CANCELLED');
    const assignments = live.length
      ? await prisma.deliveryAssignment.findMany({ where: { orderId: { in: live.map((o) => o.id) } }, select: { orderId: true, status: true, attemptNumber: true } })
      : [];
    for (const o of live) {
      const a = assignments.find((x) => x.orderId === o.id);
      if (o.status === 'DELIVERED') {
        out.set(o.id, { state: 'DELIVERED', attemptNumber: a?.attemptNumber ?? 1, maxAttempts: MAX_DELIVERY_ATTEMPTS });
        continue;
      }
      if (!a) continue;
      const state: CustomerDeliveryState = a.status === 'FAILED' ? 'DELIVERY_ISSUE' : a.status === 'ASSIGNED' ? 'RETRY_PLANNED' : 'ON_THE_WAY';
      out.set(o.id, { state, attemptNumber: a.attemptNumber, maxAttempts: MAX_DELIVERY_ATTEMPTS });
    }
    if (cancelled.length) {
      const undeliverable = await prisma.deliveryAttempt.findMany({
        where: { orderId: { in: cancelled.map((o) => o.id) }, outcome: 'UNDELIVERABLE_CANCELLED' },
        select: { orderId: true, attemptNumber: true }
      });
      for (const u of undeliverable) out.set(u.orderId, { state: 'UNDELIVERABLE_REFUND_PENDING', attemptNumber: u.attemptNumber, maxAttempts: MAX_DELIVERY_ATTEMPTS });
    }
    return out;
  }
}
