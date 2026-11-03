import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import { BranchFilter, branchWhere } from '../../authz/branchScope.js';

export const PO_STATUSES = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** Pure rule: what a purchase order may do next. */
export function canTransition(from: PoStatus, action: 'ORDER' | 'CANCEL' | 'RECEIVE'): boolean {
  if (action === 'ORDER') return from === 'DRAFT';
  if (action === 'CANCEL') return from === 'DRAFT' || from === 'ORDERED';
  return from === 'ORDERED' || from === 'PARTIALLY_RECEIVED';
}

/** Pure rule: remaining quantity a line can still receive (floating-point safe to 3 decimals). */
export function remainingQuantity(ordered: number, received: number): number {
  return Math.max(0, Math.round((ordered - received) * 1000) / 1000);
}

const newNumber = (prefix: string) => {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}-${randomBytes(3).toString('hex').toUpperCase()}`;
};

const poInclude = {
  supplier: { select: { id: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  lines: { include: { inventoryItem: { select: { id: true, name: true, sku: true, unit: true } } } }
} as const;

const actorOf = (userId: string) => ({ userId, roles: ['PROCUREMENT'] });

export class PurchasingService {
  // ---- Suppliers (global; not branch data) ----
  public static listSuppliers(includeInactive = false) {
    return prisma.supplier.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' }, take: 500 });
  }

  public static async createSupplier(userId: string, data: { name: string; contactName?: string; email?: string; phone?: string; address?: string }) {
    return prisma.$transaction(async (tx) => {
      const s = await tx.supplier.create({ data });
      await AuditService.record({ actor: actorOf(userId), action: 'SUPPLIER_CREATED', entity: 'Supplier', entityId: s.id }, tx);
      return s;
    });
  }

  public static async updateSupplier(
    userId: string,
    id: string,
    data: { name?: string; contactName?: string | null; email?: string | null; phone?: string | null; address?: string | null; isActive?: boolean }
  ) {
    const exists = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    return prisma.$transaction(async (tx) => {
      const s = await tx.supplier.update({ where: { id }, data });
      await AuditService.record({ actor: actorOf(userId), action: 'SUPPLIER_UPDATED', entity: 'Supplier', entityId: id, payload: { fields: Object.keys(data) } }, tx);
      return s;
    });
  }

  // ---- Inventory items ----
  public static async createItem(
    userId: string,
    data: { branchId: string; name: string; sku: string; category: string; unit: string; minReorderLevel: number; unitCost: number }
  ) {
    return prisma.$transaction(async (tx) => {
      const dup = await tx.inventoryItem.findFirst({ where: { branchId: data.branchId, sku: data.sku }, select: { id: true } });
      if (dup) throw new AppError('SKU already exists in this branch', 409, 'SKU_EXISTS');
      const item = await tx.inventoryItem.create({ data });
      await AuditService.record({ actor: actorOf(userId), action: 'INVENTORY_ITEM_CREATED', entity: 'InventoryItem', entityId: item.id, payload: { branchId: data.branchId } }, tx);
      return item;
    });
  }

  // ---- Purchase orders ----
  public static listOrders(filter: BranchFilter, status?: PoStatus) {
    return prisma.purchaseOrder.findMany({
      where: { ...(branchWhere(filter) as Prisma.PurchaseOrderWhereInput), ...(status ? { status } : {}) },
      include: poInclude,
      orderBy: { createdAt: 'desc' },
      take: 200
    });
  }

  public static async getOrder(id: string) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { ...poInclude, receipts: { include: { lines: true }, orderBy: { receivedAt: 'desc' } } }
    });
    if (!po) throw new AppError('Purchase order not found', 404, 'NOT_FOUND');
    return po;
  }

  public static async orderBranch(id: string): Promise<string> {
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { branchId: true } });
    if (!po) throw new AppError('Purchase order not found', 404, 'NOT_FOUND');
    return po.branchId;
  }

  public static async createOrder(
    userId: string,
    data: { branchId: string; supplierId: string; expectedOn?: Date; notes?: string; lines: Array<{ inventoryItemId: string; orderedQuantity: number; unitCost: number }> }
  ) {
    const ids = data.lines.map((l) => l.inventoryItemId);
    if (new Set(ids).size !== ids.length) throw new AppError('Duplicate item in order lines', 422, 'DUPLICATE_LINE');

    const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId }, select: { isActive: true } });
    if (!supplier || !supplier.isActive) throw new AppError('Supplier not available', 422, 'SUPPLIER_INVALID');
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: ids }, branchId: data.branchId }, select: { id: true } });
    if (items.length !== ids.length) throw new AppError('Every item must belong to the order branch', 422, 'ITEM_BRANCH_MISMATCH');

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const po = await tx.purchaseOrder.create({
            data: {
              poNumber: newNumber('PO'),
              branchId: data.branchId,
              supplierId: data.supplierId,
              expectedOn: data.expectedOn ?? null,
              notes: data.notes ?? null,
              createdByUserId: userId,
              lines: { create: data.lines }
            },
            include: poInclude
          });
          await AuditService.record({ actor: actorOf(userId), action: 'PURCHASE_ORDER_CREATED', entity: 'PurchaseOrder', entityId: po.id, payload: { branchId: data.branchId, lines: data.lines.length } }, tx);
          return po;
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 4) continue; // PO number collision
        throw e;
      }
    }
    throw new AppError('Could not allocate a purchase order number', 503, 'PO_NUMBER_UNAVAILABLE');
  }

  private static async lockOrder(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!po) throw new AppError('Purchase order not found', 404, 'NOT_FOUND');
    return po;
  }

  public static async markOrdered(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      const po = await this.lockOrder(tx, id);
      if (po.status === 'ORDERED') return po; // idempotent
      if (!canTransition(po.status as PoStatus, 'ORDER')) throw new AppError('Only a draft can be sent to the supplier', 409, 'INVALID_STATE');
      if (po.lines.length === 0) throw new AppError('Order has no lines', 422, 'EMPTY_ORDER');
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: 'ORDERED', orderedAt: new Date() }, include: poInclude });
      await AuditService.record({ actor: actorOf(userId), action: 'PURCHASE_ORDER_ORDERED', entity: 'PurchaseOrder', entityId: id }, tx);
      return updated;
    });
  }

  public static async cancel(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      const po = await this.lockOrder(tx, id);
      if (po.status === 'CANCELLED') return po;
      if (!canTransition(po.status as PoStatus, 'CANCEL')) throw new AppError('This order can no longer be cancelled', 409, 'INVALID_STATE');
      if (po.lines.some((l) => l.receivedQuantity > 0)) throw new AppError('Goods were already received', 409, 'ALREADY_RECEIVED');
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() }, include: poInclude });
      await AuditService.record({ actor: actorOf(userId), action: 'PURCHASE_ORDER_CANCELLED', entity: 'PurchaseOrder', entityId: id }, tx);
      return updated;
    });
  }

  /** Goods receipt: validates against what is still outstanding, writes receipt + stock movements + stock in ONE transaction. */
  public static async receive(userId: string, id: string, input: { notes?: string; lines: Array<{ purchaseOrderLineId: string; quantity: number }> }) {
    const ids = input.lines.map((l) => l.purchaseOrderLineId);
    if (new Set(ids).size !== ids.length) throw new AppError('Duplicate line in receipt', 422, 'DUPLICATE_LINE');

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const po = await this.lockOrder(tx, id);
          if (!canTransition(po.status as PoStatus, 'RECEIVE')) throw new AppError('Goods can only be received against an ordered purchase order', 409, 'INVALID_STATE');

          const byId = new Map(po.lines.map((l) => [l.id, l]));
          for (const l of input.lines) {
            const line = byId.get(l.purchaseOrderLineId);
            if (!line) throw new AppError('Line does not belong to this order', 422, 'LINE_NOT_FOUND');
            if (l.quantity > remainingQuantity(line.orderedQuantity, line.receivedQuantity)) {
              throw new AppError('Received quantity exceeds what is outstanding', 422, 'OVER_RECEIPT');
            }
          }

          const receipt = await tx.goodsReceipt.create({
            data: {
              purchaseOrderId: id,
              receiptNumber: newNumber('GR'),
              receivedByUserId: userId,
              notes: input.notes ?? null,
              lines: { create: input.lines.map((l) => ({ purchaseOrderLineId: l.purchaseOrderLineId, quantity: l.quantity, unitCost: byId.get(l.purchaseOrderLineId)!.unitCost })) }
            },
            include: { lines: true }
          });

          for (const l of input.lines) {
            const line = byId.get(l.purchaseOrderLineId)!;
            await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQuantity: { increment: l.quantity } } });
            await tx.stockMovement.create({
              data: { inventoryItemId: line.inventoryItemId, type: 'PURCHASE_RECEIPT', quantity: l.quantity, unitCost: line.unitCost, referenceNumber: receipt.receiptNumber, notes: `PO ${po.poNumber}`, createdBy: userId }
            });
            await tx.inventoryItem.update({ where: { id: line.inventoryItemId }, data: { quantityOnHand: { increment: l.quantity }, unitCost: line.unitCost } });
          }

          const fresh = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
          const complete = fresh.every((l) => remainingQuantity(l.orderedQuantity, l.receivedQuantity) === 0);
          await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED' } });
          await AuditService.record({ actor: actorOf(userId), action: 'GOODS_RECEIVED', entity: 'PurchaseOrder', entityId: id, payload: { receiptId: receipt.id, complete } }, tx);
          return receipt;
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 4) continue; // receipt number collision
        throw e;
      }
    }
    throw new AppError('Could not allocate a receipt number', 503, 'RECEIPT_NUMBER_UNAVAILABLE');
  }

  // ---- Stock & dashboard ----
  public static movements(filter: BranchFilter, inventoryItemId?: string) {
    return prisma.stockMovement.findMany({
      where: { inventoryItem: branchWhere(filter) as Prisma.InventoryItemWhereInput, ...(inventoryItemId ? { inventoryItemId } : {}) },
      include: { inventoryItem: { select: { id: true, name: true, unit: true, branchId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
  }

  public static async dashboard(filter: BranchFilter) {
    const where = branchWhere(filter) as Prisma.InventoryItemWhereInput;
    const poWhere = branchWhere(filter) as Prisma.PurchaseOrderWhereInput;
    const [items, openOrders, recent] = await Promise.all([
      prisma.inventoryItem.findMany({ where, select: { id: true, name: true, unit: true, quantityOnHand: true, minReorderLevel: true, branchId: true, expiryDate: true } }),
      prisma.purchaseOrder.groupBy({ by: ['status'], where: { ...poWhere, status: { in: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'] } }, _count: { _all: true } }),
      prisma.stockMovement.count({ where: { inventoryItem: where, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } })
    ]);
    const soon = Date.now() + 7 * 86400_000;
    return {
      itemCount: items.length,
      lowStock: items.filter((i) => i.quantityOnHand <= i.minReorderLevel).sort((a, b) => a.quantityOnHand - b.quantityOnHand).slice(0, 25),
      expiringSoon: items.filter((i) => i.expiryDate && i.expiryDate.getTime() <= soon).slice(0, 25),
      openOrders: Object.fromEntries(openOrders.map((g) => [g.status, g._count._all])),
      movementsLast7Days: recent
    };
  }
}
