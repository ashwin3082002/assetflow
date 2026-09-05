import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { BadRequestError } from '../common/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and coerces `req.body`, `req.query` and/or `req.params` with zod, replacing them with the
 * parsed values. Failure → 400 VALIDATION_ERROR with `details: [{ path, message }]`.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        next(
          new BadRequestError(
            `Invalid ${key}`,
            'VALIDATION_ERROR',
            result.error.issues.map((i) => ({ path: i.path.join('.') || key, message: i.message })),
          ),
        );
        return;
      }
      req[key] = result.data;
    }
    next();
  };
}
