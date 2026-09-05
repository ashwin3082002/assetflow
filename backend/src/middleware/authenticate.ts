import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../common/errors';
import { verifyToken } from '../modules/auth/auth.service';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/User';

/**
 * Verifies the Bearer JWT, loads the user from the database (so role changes and deactivation take
 * effect immediately) and attaches `req.user`. Missing/invalid token or inactive user → 401.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = verifyToken(token);

    const user = await AppDataSource.getRepository(User).findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedError('Account not found or disabled');
    }

    req.user = { id: user.id, role: user.role, fullName: user.fullName, email: user.email };
    next();
  } catch (err) {
    next(err instanceof UnauthorizedError ? err : new UnauthorizedError('Invalid or expired token'));
  }
}
