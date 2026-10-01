import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ProductService {
  public static async getCategories() {
    return await prisma.productCategory.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        _count: { select: { products: true } }
      }
    });
  }

  public static async getProducts(categoryId?: string, isFMCG?: boolean, isTepache?: boolean) {
    const where: any = { isPublished: true };
    if (categoryId) where.categoryId = categoryId;
    if (isFMCG !== undefined) where.isFMCG = isFMCG;
    if (isTepache !== undefined) where.isTepache = isTepache;

    return await prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  public static async getProductBySlug(slug: string) {
    return await prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        variants: true
      }
    });
  }
}
