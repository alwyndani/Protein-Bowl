import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class CMSService {
  public static async getBanners() {
    return await prisma.cMSBanner.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } });
  }

  public static async getMedia() {
    return await prisma.cMSMedia.findMany({ where: { isPublished: true } });
  }

  public static async createBanner(data: { title: string; imageUrl: string; linkUrl?: string; position?: number }) {
    return await prisma.cMSBanner.create({
      data: {
        title: data.title,
        imageUrl: data.imageUrl,
        linkUrl: data.linkUrl,
        position: data.position || 0,
        isActive: true
      }
    });
  }
}
