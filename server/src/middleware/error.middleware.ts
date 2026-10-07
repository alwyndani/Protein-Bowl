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

  // Body-parser / HTTP-layer errors (carry a 4xx status and a `type`)
  const httpErr = err as Error & { status?: number; statusCode?: number; type?: string };
  if (httpErr.type === 'entity.too.large') {
    return ApiResponse.error(res, 'Request body is too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  if (httpErr.type === 'entity.parse.failed') {
    return ApiResponse.error(res, 'Malformed request body', 400, 'INVALID_BODY');
  }
  const clientStatus = httpErr.status ?? httpErr.statusCode;
  if (httpErr.type && clientStatus && clientStatus >= 400 && clientStatus < 500) {
    return ApiResponse.error(res, 'Invalid request', clientStatus, 'BAD_REQUEST');
  }

  console.error('Unhandled Server Error:', err);
  return ApiResponse.error(
    res,
    'Internal server error occurred',
    500,
    'INTERNAL_SERVER_ERROR'
  );
}
