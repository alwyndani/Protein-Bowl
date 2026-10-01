import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class HRMService {
  public static async getEmployees() {
    return await prisma.employeeProfile.findMany({
      include: { user: true, assignedBranch: true, hrmRecord: true }
    });
  }

  public static async markAttendance(employeeId: string, status: string = 'PRESENT') {
    const today = new Date().toISOString().split('T')[0];
    return await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: new Date(today) } },
      update: { status, checkIn: new Date() },
      create: { employeeId, date: new Date(today), status, checkIn: new Date() }
    });
  }
}
