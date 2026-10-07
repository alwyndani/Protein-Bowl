import { prisma } from '../../config/database.js';

export class FMCGService {
  public static async getBatches() {
    return await prisma.fMCGBatch.findMany({ orderBy: { manufactureDate: 'desc' } });
  }

  public static async createBatch(data: {
    productName: string;
    quantityProduced: number;
    qcStatus?: string;
    expiryDate: string;
  }) {
    const batchCode = `FMCG-B${Date.now().toString().slice(-6)}`;
    return await prisma.fMCGBatch.create({
      data: {
        batchCode,
        productName: data.productName,
        quantityProduced: data.quantityProduced,
        qcStatus: data.qcStatus || 'PASSED',
        expiryDate: new Date(data.expiryDate)
      }
    });
  }

  public static async getChallans() {
    return await prisma.dispatchChallan.findMany({ orderBy: { dispatchDate: 'desc' } });
  }
}
