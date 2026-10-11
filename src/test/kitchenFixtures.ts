import type { KitchenBranchRef, KitchenOrder, KitchenQueue, KitchenStatus, RoutingList, RoutingOrder } from '../services/kitchenTypes';

export const KB_A: KitchenBranchRef = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'kochi', name: 'Kochi Central' };
export const KB_B: KitchenBranchRef = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'kozhikode', name: 'Kozhikode Hub' };

let seq = 0;
export function kitchenOrder(over: Partial<KitchenOrder> = {}): KitchenOrder {
  const n = ++seq;
  return {
    id: `order-${n}`,
    orderNumber: `PB-261011-K${String(n).padStart(5, '0')}`,
    status: 'CONFIRMED',
    confirmedAt: '2026-10-11T09:00:00.000Z',
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    serverTime: '2026-10-11T09:10:00.000Z',
    branch: KB_A,
    items: [
      {
        id: `item-${n}`,
        title: 'Berry & Banana Classic',
        variantName: '1 jar',
        sku: 'SKU-1',
        quantity: 2,
        recipe: { name: 'Berry Bowl', servingSize: '1 jar', prepTimeMins: 10, cookTimeMins: 5, chefInstructions: 'Chill before serving', dietaryTag: 'veg', spiceLevel: null }
      }
    ],
    ...over
  };
}

export function kitchenQueue(sections: Partial<Record<KitchenStatus, KitchenOrder[]>> = {}, over: Partial<KitchenQueue> = {}): KitchenQueue {
  const mk = (status: KitchenStatus) => {
    const items = sections[status] ?? [];
    return { total: items.length, truncated: false, items };
  };
  return {
    serverTime: '2026-10-11T09:10:00.000Z',
    sectionLimit: 100,
    sections: { CONFIRMED: mk('CONFIRMED'), ACCEPTED: mk('ACCEPTED'), PREPARING: mk('PREPARING'), READY: mk('READY') },
    branches: [KB_A],
    selectedBranchIds: [KB_A.id],
    ...over
  };
}

export function routingOrder(over: Partial<RoutingOrder> = {}): RoutingOrder {
  const n = ++seq;
  return {
    id: `route-${n}`,
    orderNumber: `PB-261011-R${String(n).padStart(5, '0')}`,
    status: 'CONFIRMED',
    confirmedAt: '2026-10-11T09:00:00.000Z',
    kitchenBranch: null,
    deliveryArea: { city: 'Kochi', postalCode: '682001' },
    items: [{ id: `ri-${n}`, title: 'Sweet Potato Chicken Bowl', variantName: null, quantity: 1 }],
    ...over
  };
}

export function routingList(items: RoutingOrder[], over: Partial<RoutingList> = {}): RoutingList {
  return { serverTime: '2026-10-11T09:10:00.000Z', routing: 'unrouted', total: items.length, truncated: false, items, ...over };
}
