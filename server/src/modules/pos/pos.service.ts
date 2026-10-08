import { prisma } from '../../config/database.js';
import { BranchFilter, branchWhere } from '../../authz/branchScope.js';

export class POSService {
  public static async branchExists(branchId: string): Promise<boolean> {
    return (await prisma.kitchenBranch.count({ where: { id: branchId } })) > 0;
  }

  public static async recordTransaction(data: {
    branchId: string;
    cashierId?: string;
    totalAmount: number;
    paymentMethod: string;
    cashReceived?: number;
    changeGiven?: number;
  }) {
    const transactionNumber = `POS-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    return await prisma.pOSTransaction.create({
      data: {
        branchId: data.branchId,
        cashierId: data.cashierId,
        transactionNumber,
        totalAmount: data.totalAmount,
        paymentMethod: data.paymentMethod,
        cashReceived: data.cashReceived,
        changeGiven: data.changeGiven,
        receiptUrl: `/receipts/${transactionNumber}.pdf`
      }
    });
  }

  /** Transactions for the branches in `filter` (computed by the authorization layer). */
  public static async getBranchTransactions(filter: BranchFilter) {
    return await prisma.pOSTransaction.findMany({
      where: branchWhere(filter),
      orderBy: { createdAt: 'desc' }
    });
  }
}
