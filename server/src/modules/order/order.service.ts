import { PrismaClient } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware.js';

const prisma = new PrismaClient();

export class OrderService {
  public static async createOrder(data: {
    customerProfileId?: string;
    items: Array<{ productId?: string; variantId?: string; title: string; price: number; quantity: number }>;
    deliveryAddress: string;
    paymentMethod: string;
    isGuest?: boolean;
    guestEmail?: string;
    guestPhone?: string;
    branchId?: string;
  }) {
    if (!data.items || data.items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }

    let totalAmount = 0;
    const orderItemsData = data.items.map(item => {
      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;
      return {
        productId: item.productId,
        variantId: item.variantId,
        itemTitle: item.title,
        unitPrice: item.price,
        quantity: item.quantity,
        totalPrice: itemTotal
      };
    });

    const taxAmount = +(totalAmount * 0.05).toFixed(2);
    const deliveryFee = totalAmount > 500 ? 0 : 40;
    const netAmount = +(totalAmount + taxAmount + deliveryFee).toFixed(2);

    // Get default kitchen branch if not provided
    let kitchenBranchId = data.branchId;
    if (!kitchenBranchId) {
      const defaultBranch = await prisma.kitchenBranch.findFirst({ where: { isActive: true } });
      kitchenBranchId = defaultBranch?.id;
    }

    const orderNumber = `PB-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerProfileId: data.customerProfileId,
          kitchenBranchId,
          status: 'CONFIRMED',
          orderType: 'DIRECT',
          totalAmount,
          taxAmount,
          deliveryFee,
          netAmount,
          deliveryAddress: data.deliveryAddress,
          paymentStatus: 'PAID', // Verified payment simulation / sandbox
          paymentMethod: data.paymentMethod,
          isGuest: data.isGuest || false,
          guestEmail: data.guestEmail,
          guestPhone: data.guestPhone,
          items: {
            create: orderItemsData
          }
        },
        include: {
          items: true,
          kitchenBranch: true
        }
      });

      // Automatically create KOT for Kitchen
      if (kitchenBranchId) {
        await tx.kitchenOrderTicket.create({
          data: {
            orderId: order.id,
            branchId: kitchenBranchId,
            kotNumber: `KOT-${orderNumber}`,
            status: 'QUEUED',
            itemsJson: orderItemsData
          }
        });
      }

      return order;
    });
  }

  public static async getCustomerOrders(customerProfileId: string) {
    return await prisma.order.findMany({
      where: { customerProfileId },
      include: {
        items: true,
        kitchenBranch: true,
        delivery: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  public static async getOrderByNumber(orderNumber: string) {
    return await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        kitchenBranch: true,
        delivery: true,
        kot: true
      }
    });
  }

  public static async updateOrderStatus(orderId: string, status: string) {
    const validStatuses = ['PENDING', 'CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      throw new AppError('Invalid order status', 400);
    }

    return await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { items: true, delivery: true }
    });
  }
}
