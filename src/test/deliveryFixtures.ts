import type {
  DeliveryAreaOrder,
  DeliveryBranchRef,
  DeliveryMonitor,
  DeliveryMonitorOrder,
  DeliveryOwnedOrder,
  DriverQueue
} from '../services/deliveryTypes';

export const DB_A: DeliveryBranchRef = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'kochi', name: 'Kochi Central' };
export const DB_B: DeliveryBranchRef = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'kozhikode', name: 'Kozhikode Hub' };

let seq = 0;
const item = (n: number) => ({ id: `item-${n}`, title: 'Sweet Potato Chicken Bowl', variantName: 'Large', quantity: 2 });

export function areaOrder(over: Partial<DeliveryAreaOrder> = {}): DeliveryAreaOrder {
  const n = ++seq;
  return {
    id: `order-${n}`,
    orderNumber: `PB-261011-D${String(n).padStart(5, '0')}`,
    status: 'READY',
    readyAt: '2026-10-11T09:00:00.000Z',
    kitchenBranch: DB_A,
    area: { city: 'Kochi', postalCode: '682001' },
    items: [item(n)],
    ...over
  };
}

export function ownedOrder(over: Partial<DeliveryOwnedOrder> = {}): DeliveryOwnedOrder {
  const base = areaOrder();
  return {
    ...base,
    delivery: {
      firstName: 'Asha',
      phone: '+91 98765 43210',
      address: { line1: '12 Marine Drive', line2: 'Flat 4B', city: 'Kochi', state: 'Kerala', postalCode: '682001' },
      instructions: 'Leave with the security guard'
    },
    assignment: { state: 'ASSIGNED', pickupTime: null, issueReported: false, attemptNumber: 1, maxAttempts: 3 },
    proof: null,
    ...over
  };
}

export function outOrder(over: Partial<DeliveryOwnedOrder> = {}): DeliveryOwnedOrder {
  return ownedOrder({ status: 'DISPATCHED', assignment: { state: 'IN_TRANSIT', pickupTime: '2026-10-11T09:05:00.000Z', issueReported: false, attemptNumber: 1, maxAttempts: 3 }, proof: { state: 'READY_FOR_VERIFICATION', lockedUntil: null }, ...over });
}

export function driverQueue(sections: { available?: DeliveryAreaOrder[]; mine?: DeliveryOwnedOrder[]; out?: DeliveryOwnedOrder[] } = {}, over: Partial<DriverQueue> = {}): DriverQueue {
  const mk = <T,>(items: T[] = []) => ({ total: items.length, truncated: false, items });
  return {
    serverTime: '2026-10-11T09:10:00.000Z',
    sectionLimit: 100,
    sections: { available: mk(sections.available), mine: mk(sections.mine), outForDelivery: mk(sections.out) },
    branches: [DB_A],
    selectedBranchIds: [DB_A.id],
    ...over
  };
}

export function monitorOrder(over: Partial<DeliveryMonitorOrder> = {}): DeliveryMonitorOrder {
  const base = areaOrder();
  const merged = { ...base, assignment: { state: null, driver: null, pickupTime: null, attemptNumber: 1 }, exception: null, proofState: null, canRetry: false, maxAttempts: 3, retryPending: false, ...over };
  // derived flags follow the assignment unless a test sets them explicitly
  if (over.canRetry === undefined) merged.canRetry = merged.status === 'DISPATCHED' && merged.assignment.state === 'FAILED' && merged.assignment.attemptNumber < merged.maxAttempts;
  if (over.retryPending === undefined) merged.retryPending = merged.status === 'DISPATCHED' && merged.assignment.state === 'ASSIGNED';
  return merged;
}

export function deliveryMonitor(
  sections: { unclaimed?: DeliveryMonitorOrder[]; assigned?: DeliveryMonitorOrder[]; dispatched?: DeliveryMonitorOrder[]; exceptions?: DeliveryMonitorOrder[] } = {},
  over: Partial<DeliveryMonitor> = {}
): DeliveryMonitor {
  const mk = <T,>(items: T[] = []) => ({ total: items.length, truncated: false, items });
  return {
    serverTime: '2026-10-11T09:10:00.000Z',
    sectionLimit: 100,
    sections: { unclaimed: mk(sections.unclaimed), assigned: mk(sections.assigned), dispatched: mk(sections.dispatched), exceptions: mk(sections.exceptions) },
    branch: DB_A,
    readOnly: false,
    ...over
  };
}

export const DRIVER_1 = { employeeId: '11111111-1111-4111-8111-111111111111', employeeCode: 'DRV-001', fullName: 'Ravi Kumar' };
export const DRIVER_2 = { employeeId: '22222222-2222-4222-8222-222222222222', employeeCode: 'DRV-002', fullName: 'Meera Nair' };
