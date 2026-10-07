import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ProductService {
  public static async getCategories() {
    return await prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        _count: { select: { products: true } }
      }
    });
  }

  public static async getProducts(categoryId?: string, isFMCG?: boolean, isTepache?: boolean) {
    const where: any = { isPublished: true, isActive: true };
    if (categoryId) where.categoryId = categoryId;
    if (isFMCG !== undefined) where.isFMCG = isFMCG;
    if (isTepache !== undefined) where.isTepache = isTepache;

    return await prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: {
          where: { isActive: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  public static async getProductBySlug(slugOrId: string) {
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: slugOrId },
          { id: slugOrId }
        ],
        isPublished: true,
        isActive: true
      },
      include: {
        category: true,
        variants: {
          where: { isActive: true }
        }
      }
    });
    return product;
  }
}
