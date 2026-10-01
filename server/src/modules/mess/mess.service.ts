import { PrismaClient } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware.js';

const prisma = new PrismaClient();

export class MessService {
  public static async getMessPlans() {
    return await prisma.messSubscriptionPlan.findMany({
      where: { active: true }
    });
  }

  public static async getMessAccount(customerProfileId: string) {
    return await prisma.messAccount.findUnique({
      where: { customerProfileId },
      include: {
        subscriptions: {
          include: {
            plan: true,
            dailyOrders: { orderBy: { date: 'asc' } }
          }
        },
        customerProfile: {
          include: { walletAccount: { include: { transactions: { orderBy: { createdAt: 'desc' } } } } }
        }
      }
    });
  }

  public static async registerMessAccount(data: {
    customerProfileId: string;
    studentIdCard?: string;
    collegeHostelName: string;
    roomNumber: string;
  }) {
    // Ensure wallet account exists
    await prisma.walletAccount.upsert({
      where: { customerProfileId: data.customerProfileId },
      update: {},
      create: { customerProfileId: data.customerProfileId, balance: 0.00 }
    });

    return await prisma.messAccount.upsert({
      where: { customerProfileId: data.customerProfileId },
      update: {
        studentIdCard: data.studentIdCard,
        collegeHostelName: data.collegeHostelName,
        roomNumber: data.roomNumber
      },
      create: {
        customerProfileId: data.customerProfileId,
        studentIdCard: data.studentIdCard,
        collegeHostelName: data.collegeHostelName,
        roomNumber: data.roomNumber,
        isApproved: true
      }
    });
  }

  public static async pauseMeal(data: {
    customerProfileId: string;
    subscriptionId: string;
    pauseDate: string; // YYYY-MM-DD
    slot: string; // BREAKFAST, LUNCH, DINNER
  }) {
    return await prisma.$transaction(async (tx) => {
      const subscription = await tx.messSubscription.findUnique({
        where: { id: data.subscriptionId },
        include: { plan: true, messAccount: true }
      });

      if (!subscription) throw new AppError('Mess subscription not found', 404);
      if (subscription.messAccount.customerProfileId !== data.customerProfileId) {
        throw new AppError('Unauthorized access to mess subscription', 403);
      }

      const pausePricePerMeal = 85.00; // Standard meal refund amount

      // 1. Create MealPauseRequest
      const pauseRecord = await tx.mealPauseRequest.create({
        data: {
          messSubscriptionId: subscription.id,
          pauseDate: new Date(data.pauseDate),
          slot: data.slot,
          refundAmount: pausePricePerMeal,
          status: 'APPROVED'
        }
      });

      // 2. Update MessSubscription counters
      await tx.messSubscription.update({
        where: { id: subscription.id },
        data: {
          totalPausesUsed: { increment: 1 }
        }
      });

      // 3. Atomically Credit Wallet Account
      let wallet = await tx.walletAccount.findUnique({
        where: { customerProfileId: data.customerProfileId }
      });

      if (!wallet) {
        wallet = await tx.walletAccount.create({
          data: { customerProfileId: data.customerProfileId, balance: 0.00 }
        });
      }

      const newBalance = Number(wallet.balance) + pausePricePerMeal;

      await tx.walletAccount.update({
        where: { id: wallet.id },
        data: { balance: newBalance }
      });

      // 4. Create Immutable Ledger Entry
      await tx.walletTransaction.create({
        data: {
          walletAccountId: wallet.id,
          amount: pausePricePerMeal,
          type: 'CREDIT_PAUSE_REFUND',
          referenceId: pauseRecord.id,
          description: `Refund for paused Kerala Mess meal (${data.slot} on ${data.pauseDate})`,
          balanceAfter: newBalance
        }
      });

      return { pauseRecord, newWalletBalance: newBalance };
    });
  }

  public static async verifyGatePass(code: string) {
    const order = await prisma.messDailyOrder.findFirst({
      where: { gatePassCode: code },
      include: { messSubscription: { include: { messAccount: { include: { customerProfile: true } } } } }
    });

    if (!order) throw new AppError('Invalid or expired Gate Pass code', 404);

    if (order.status === 'CONSUMED') {
      throw new AppError('Gate Pass has already been redeemed today!', 400);
    }

    if (order.status === 'PAUSED') {
      throw new AppError('This meal was marked PAUSED by student.', 400);
    }

    const updated = await prisma.messDailyOrder.update({
      where: { id: order.id },
      data: { status: 'CONSUMED', consumedAt: new Date() },
      include: { messSubscription: { include: { messAccount: { include: { customerProfile: true } } } } }
    });

    return updated;
  }
}
