import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../utils/apiResponse.js';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode = 400,
    public errorCode = 'BAD_REQUEST'
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response {
  if (err instanceof AppError) {
    return ApiResponse.error(res, err.message, err.statusCode, err.errorCode);
  }

  if (err instanceof ZodError) {
    const issueMessages = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    return ApiResponse.error(res, `Validation failed: ${issueMessages}`, 422, 'VALIDATION_ERROR');
  }

  console.error('Unhandled Server Error:', err);
  return ApiResponse.error(
    res,
    'Internal server error occurred',
    500,
    'INTERNAL_SERVER_ERROR'
  );
}
