import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { User } from '../../entities/User';
import { UserRole } from '../../common/enums';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../common/errors';
import { serializeUser, type UserResponse } from '../users/users.service';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schemas';

const BCRYPT_COST = 10;

export interface TokenPayload {
  sub: string;
  role: UserRole;
}

export interface AuthResult {
  token: string;
  user: UserResponse;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function signToken(user: Pick<User, 'id' | 'role'>): string {
  const payload: TokenPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

/** Throws (JsonWebTokenError / TokenExpiredError) on an invalid token. */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== 'object' || decoded === null || typeof decoded.sub !== 'string') {
    throw new UnauthorizedError('Invalid token payload');
  }
  return { sub: decoded.sub, role: decoded.role as UserRole };
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

/** Loads a user including the `select: false` password hash. */
async function findWithPassword(where: { id?: string; email?: string }): Promise<User | null> {
  const qb = userRepo().createQueryBuilder('user').addSelect('user.passwordHash');
  if (where.id) qb.where('user.id = :id', { id: where.id });
  else qb.where('user.email = :email', { email: where.email });
  return qb.getOne();
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await userRepo().findOne({ where: { email: input.email } });
  if (existing) throw new ConflictError('Email is already registered', 'EMAIL_TAKEN');

  const user = userRepo().create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: UserRole.EMPLOYEE, // public registration can never choose a role
    department: input.department ?? null,
    isActive: true,
  });
  await userRepo().save(user);
  return { token: signToken(user), user: serializeUser(user) };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await findWithPassword({ email: input.email });
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (!user.isActive) {
    throw new ForbiddenError('This account has been disabled', 'ACCOUNT_DISABLED');
  }
  return { token: signToken(user), user: serializeUser(user) };
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await findWithPassword({ id: userId });
  if (!user) throw new UnauthorizedError();
  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
  user.passwordHash = await hashPassword(input.newPassword);
  await userRepo().save(user);
}
