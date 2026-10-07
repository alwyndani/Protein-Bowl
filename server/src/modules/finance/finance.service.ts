import { prisma } from '../../config/database.js';

export class FinanceService {
  public static async getTransactions() {
    return await prisma.financialTransaction.findMany({ orderBy: { createdAt: 'desc' } });
  }

  public static async createVoucher(data: {
    accountType: string;
    amount: number;
    category: string;
    description: string;
    branchId?: string;
  }) {
    const voucherNumber = `VOUCH-${Date.now().toString().slice(-6)}`;
    return await prisma.financialTransaction.create({
      data: {
        voucherNumber,
        accountType: data.accountType,
        amount: data.amount,
        category: data.category,
        description: data.description,
        branchId: data.branchId
      }
    });
  }
}
