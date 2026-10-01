import { Request, Response, NextFunction } from 'express';
import { HRMService } from './hrm.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class HRMController {
  public static async getEmployees(_req: Request, res: Response, next: NextFunction) {
    try {
      const employees = await HRMService.getEmployees();
      return ApiResponse.success(res, employees, 'Employees retrieved');
    } catch (err) { next(err); }
  }

  public static async markAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId, status } = req.body;
      const record = await HRMService.markAttendance(employeeId, status);
      return ApiResponse.success(res, record, 'Attendance marked');
    } catch (err) { next(err); }
  }
}
