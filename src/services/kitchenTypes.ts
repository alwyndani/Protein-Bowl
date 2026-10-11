/** P8 kitchen types: exactly what the Chef API returns (an explicit allow-list: no customer, money, payment or address data). */
export const KITCHEN_STATUSES = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY'] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

export interface KitchenRecipe {
  name: string;
  servingSize: string;
  prepTimeMins: number;
  cookTimeMins: number;
  chefInstructions: string | null;
  dietaryTag: string;
  spiceLevel: string | null;
}

export interface KitchenItem {
  id: string;
  title: string;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  recipe: KitchenRecipe | null;
}

export interface KitchenBranchRef {
  id: string;
  code: string;
  name: string;
}

export interface KitchenOrder {
  id: string;
  orderNumber: string;
  status: KitchenStatus;
  confirmedAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  serverTime: string;
  branch: KitchenBranchRef | null;
  items: KitchenItem[];
}

export interface KitchenSection {
  total: number;
  truncated: boolean;
  items: KitchenOrder[];
}

export interface KitchenQueue {
  serverTime: string;
  sectionLimit: number;
  sections: Record<KitchenStatus, KitchenSection>;
  /** The branches the SERVER authorized for this account (the only ones the branch selector may offer). */
  branches: KitchenBranchRef[];
  selectedBranchIds: string[];
}

export type KitchenAction = 'accept' | 'start-preparing' | 'mark-ready';

export interface KitchenActionResult {
  changed: boolean;
  order: KitchenOrder;
}

// ---- SUPER_ADMIN routing
export type RoutingFilter = 'unrouted' | 'routed' | 'all';

export interface RoutingOrder {
  id: string;
  orderNumber: string;
  status: string;
  confirmedAt: string | null;
  kitchenBranch: KitchenBranchRef | null;
  /** City and postal code only. */
  deliveryArea: { city: string | null; postalCode: string | null };
  items: Array<{ id: string; title: string; variantName: string | null; quantity: number }>;
}

export interface RoutingList {
  serverTime: string;
  routing: RoutingFilter;
  total: number;
  truncated: boolean;
  items: RoutingOrder[];
}

export interface RoutingAssignInput {
  branchId: string;
  /** The branch the admin saw (null = unrouted). */
  expectedBranchId: string | null;
  reason: string;
}

export interface RoutingAssignResult {
  changed: boolean;
  orderId: string;
  orderNumber: string;
  status: string;
  previousBranchId: string | null;
  kitchenBranch: KitchenBranchRef;
}
