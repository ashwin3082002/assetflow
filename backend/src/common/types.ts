import type { UserRole } from './enums';

/** The authenticated principal attached to `req.user` by the `authenticate` middleware (Phase 2). */
export interface AuthUser {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
