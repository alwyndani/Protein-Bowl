import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';

export function validateBody(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
