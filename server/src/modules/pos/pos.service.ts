import { prisma } from '../../config/database.js';

export class POSService {
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

  public static async getBranchTransactions(branchId: string) {
    return await prisma.pOSTransaction.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' }
    });
  }
}
