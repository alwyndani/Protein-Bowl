import { prisma } from '../../config/database.js';

export class ProcurementService {
  public static async getInventoryItems(branchId?: string) {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    return await prisma.inventoryItem.findMany({ where, include: { branch: true }, orderBy: { name: 'asc' } });
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

      const adjustment = data.type === 'PURCHASE_RECEIPT' || data.type === 'TRANSFER_IN' ? data.quantity : -data.quantity;
      await tx.inventoryItem.update({
        where: { id: data.inventoryItemId },
        data: { quantityOnHand: { increment: adjustment } }
      });

      return movement;
    });
  }
}
