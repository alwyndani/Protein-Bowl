import { Response } from 'express';

export interface ApiResponsePayload<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message = 'Success',
    statusCode = 200,
    meta?: Record<string, unknown>
  ): Response {
    const payload: ApiResponsePayload<T> = {
      success: true,
      message,
      data,
      ...(meta && { meta })
    };
    return res.status(statusCode).json(payload);
  }

  static error(
    res: Response,
    message: string,
    statusCode = 400,
    errorCode = 'BAD_REQUEST',
    meta?: Record<string, unknown>
  ): Response {
    const payload: ApiResponsePayload = {
      success: false,
      error: errorCode,
      message,
      ...(meta && { meta })
    };
    return res.status(statusCode).json(payload);
  }
}
