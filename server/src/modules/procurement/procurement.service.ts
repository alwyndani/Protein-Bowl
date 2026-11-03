import { prisma } from '../../config/database.js';
import { BranchFilter, branchWhere } from '../../authz/branchScope.js';
import { AppError } from '../../middleware/error.middleware.js';

export class ProcurementService {
  /** Inventory for the branches in `filter` (computed by the authorization layer; never "all" for branch-scoped staff). */
  public static async getInventoryItems(filter: BranchFilter) {
    return await prisma.inventoryItem.findMany({
      where: branchWhere(filter),
      include: { branch: { select: { id: true, code: true, name: true } } },
      orderBy: { name: 'asc' }
    });
  }

  /** Branch an inventory item belongs to (null when it does not exist) - used to authorize writes. */
  public static async findItemBranch(inventoryItemId: string): Promise<string | null> {
    const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId }, select: { branchId: true } });
    return item?.branchId ?? null;
  }

  public static async recordStockMovement(data: {
    inventoryItemId: string;
    type: string;
    quantity: number;
    unitCost: number;
    notes?: string;
    createdBy?: string;
  }) {
    return await prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          inventoryItemId: data.inventoryItemId,
          type: data.type,
          quantity: data.quantity,
          unitCost: data.unitCost,
          notes: data.notes,
          createdBy: data.createdBy
        }
      });

      const increase = data.type === 'PURCHASE_RECEIPT' || data.type === 'TRANSFER_IN';
      if (increase) {
        await tx.inventoryItem.update({ where: { id: data.inventoryItemId }, data: { quantityOnHand: { increment: data.quantity } } });
      } else {
        // Stock can never go negative: the conditional update is atomic with the movement row (rolled back together).
        const res = await tx.inventoryItem.updateMany({
          where: { id: data.inventoryItemId, quantityOnHand: { gte: data.quantity } },
          data: { quantityOnHand: { decrement: data.quantity } }
        });
        if (res.count === 0) throw new AppError('Insufficient stock', 409, 'INSUFFICIENT_STOCK');
      }

      return movement;
    });
  }
}
