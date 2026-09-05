import type { NextFunction, Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ZodError } from 'zod';
import { AppError } from '../common/errors';
import { env } from '../config/env';
import { logger } from '../common/logger';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

function send(res: Response, status: number, code: string, message: string, details?: unknown): void {
  const body: ErrorBody = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
}

/** PostgreSQL error codes surfaced through TypeORM's QueryFailedError. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';

/**
 * Central error handler: maps every error type to the `{ error: { code, message, details? } }` envelope.
 * Must be registered last (after notFound).
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    send(res, err.status, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    send(
      res,
      400,
      'VALIDATION_ERROR',
      'Invalid input',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
    return;
  }

  if (err instanceof QueryFailedError) {
    const driverError = (err as QueryFailedError & { driverError?: { code?: string; constraint?: string } }).driverError;
    const code = driverError?.code;
    const constraint = driverError?.constraint;
    if (code === PG_UNIQUE_VIOLATION) {
      send(res, 409, 'CONFLICT', 'A record with the same unique value already exists', constraint ? [{ path: constraint, message: 'unique violation' }] : undefined);
      return;
    }
    if (code === PG_FOREIGN_KEY_VIOLATION) {
      send(res, 409, 'CONFLICT', 'Operation violates a reference to or from other records', constraint ? [{ path: constraint, message: 'foreign key violation' }] : undefined);
      return;
    }
    if (code === PG_CHECK_VIOLATION) {
      send(res, 400, 'VALIDATION_ERROR', 'Input violates a database constraint', constraint ? [{ path: constraint, message: 'check violation' }] : undefined);
      return;
    }
  }

  if (typeof err === 'object' && err !== null) {
    const e = err as { type?: string; name?: string; status?: number; message?: string };

    // body-parser: malformed JSON or oversized body
    if (e.type === 'entity.parse.failed') {
      send(res, 400, 'VALIDATION_ERROR', 'Malformed JSON body');
      return;
    }
    if (e.type === 'entity.too.large') {
      send(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
      return;
    }

    // multer (Phase 4) - matched by name so this module does not depend on multer
    if (e.name === 'MulterError') {
      send(res, 400, 'INVALID_FILE', e.message ?? 'Invalid file upload');
      return;
    }

    // jsonwebtoken (Phase 2) - matched by name so this module does not depend on jsonwebtoken
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError' || e.name === 'NotBeforeError') {
      send(res, 401, 'UNAUTHENTICATED', 'Invalid or expired token');
      return;
    }
  }

  logger.error('Unhandled error', err);
  const message = env.isProduction ? 'Internal server error' : (err as Error)?.message ?? 'Internal server error';
  send(res, 500, 'INTERNAL_ERROR', message);
}
