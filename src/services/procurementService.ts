import { ApiClient } from './apiClient';

export interface Branch { id: string; code: string; name: string }
export interface InventoryItem { id: string; branchId: string; name: string; sku: string; category: string; unit: string; quantityOnHand: number; minReorderLevel: number; unitCost: string; expiryDate: string | null; branch?: Branch }
export interface Supplier { id: string; name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; isActive: boolean }
export interface PoLine { id: string; orderedQuantity: number; receivedQuantity: number; unitCost: string; inventoryItem: { id: string; name: string; sku: string; unit: string } }
export interface PurchaseOrder { id: string; poNumber: string; status: string; expectedOn: string | null; notes: string | null; createdAt: string; supplier: { id: string; name: string }; branch: Branch; lines: PoLine[] }
export interface ProcurementDashboard {
  itemCount: number; movementsLast7Days: number; openOrders: Record<string, number>;
  lowStock: Array<{ id: string; name: string; unit: string; quantityOnHand: number; minReorderLevel: number }>;
  expiringSoon: Array<{ id: string; name: string; expiryDate: string | null }>;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (branchId?: string, extra: Record<string, string | undefined> = {}) => {
  const p = new URLSearchParams();
  if (branchId) p.set('branchId', branchId);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export class ProcurementService {
  static dashboard(branchId?: string) { return ApiClient.requestData<ProcurementDashboard>(`/procurement/dashboard${qs(branchId)}`); }
  static items(branchId?: string) { return ApiClient.requestData<InventoryItem[]>(`/procurement/items${qs(branchId)}`); }
  static createItem(input: { branchId: string; name: string; sku: string; category: string; unit: string; minReorderLevel: number; unitCost: number }) {
    return ApiClient.requestData<InventoryItem>('/procurement/items', json('POST', input));
  }
  static stockMovement(input: { inventoryItemId: string; type: string; quantity: number; unitCost: number; notes?: string }) {
    return ApiClient.requestData('/procurement/stock-movement', json('POST', input));
  }
  static suppliers() { return ApiClient.requestData<Supplier[]>('/procurement/suppliers?includeInactive=true'); }
  static createSupplier(input: { name: string; contactName?: string; email?: string; phone?: string; address?: string }) { return ApiClient.requestData<Supplier>('/procurement/suppliers', json('POST', input)); }
  static setSupplierActive(id: string, isActive: boolean) { return ApiClient.requestData<Supplier>(`/procurement/suppliers/${encodeURIComponent(id)}`, json('PATCH', { isActive })); }
  static orders(branchId?: string, status?: string) { return ApiClient.requestData<PurchaseOrder[]>(`/procurement/purchase-orders${qs(branchId, { status })}`); }
  static createOrder(input: { branchId: string; supplierId: string; notes?: string; lines: Array<{ inventoryItemId: string; orderedQuantity: number; unitCost: number }> }) {
    return ApiClient.requestData<PurchaseOrder>('/procurement/purchase-orders', json('POST', input));
  }
  static orderAction(id: string, action: 'order' | 'cancel') { return ApiClient.requestData<PurchaseOrder>(`/procurement/purchase-orders/${encodeURIComponent(id)}/${action}`, json('POST', {})); }
  static receive(id: string, lines: Array<{ purchaseOrderLineId: string; quantity: number }>, notes?: string) {
    return ApiClient.requestData(`/procurement/purchase-orders/${encodeURIComponent(id)}/receive`, json('POST', { lines, notes }));
  }
  /** The signed-in staff member's branches (server-authoritative). */
  static async myBranches(): Promise<Branch[]> {
    const me = await ApiClient.requestData<{ branches?: Branch[] }>('/staff/me');
    return me.branches ?? [];
  }
}
