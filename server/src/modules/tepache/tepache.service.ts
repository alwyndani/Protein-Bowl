import { prisma } from '../../config/database.js';

export class TepacheService {
  public static async getTanks() {
    return await prisma.tepacheTank.findMany({ orderBy: { tankCode: 'asc' } });
  }

  public static async updateTankTelemetry(tankId: string, data: { phLevel?: number; brixLevel?: number; temperatureC?: number; status?: string }) {
    return await prisma.tepacheTank.update({
      where: { id: tankId },
      data: {
        phLevel: data.phLevel,
        brixLevel: data.brixLevel,
        temperatureC: data.temperatureC,
        status: data.status
      }
    });
  }

  public static async recordBottleReturn(customerProfileId?: string, partnerName?: string, bottlesReturned: number = 0) {
    const refundPerBottle = 10.00;
    const totalRefund = bottlesReturned * refundPerBottle;

    return await prisma.bottleReturn.create({
      data: {
        customerProfileId,
        partnerName,
        bottlesReturned,
        depositRefundPerBottle: refundPerBottle,
        totalRefund
      }
    });
  }
}
