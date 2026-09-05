import { In } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { User } from '../../entities/User';
import { Asset } from '../../entities/Asset';
import { AssetRequest } from '../../entities/AssetRequest';
import { RequestStatus, UserRole } from '../../common/enums';
import type { AuthUser } from '../../common/types';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors';
import { buildMeta, toSkip, type PageMeta } from '../../common/pagination';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas';

export interface UserResponse {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  department: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const ACTIVE_REQUEST_STATUSES = [
  RequestStatus.PENDING,
  RequestStatus.APPROVED,
  RequestStatus.ALLOCATED,
  RequestStatus.RETURN_PENDING,
];

/** Public shape of a user. `passwordHash` is never included. */
export function serializeUser(user: User): UserResponse {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    department: user.department,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

const SORT_COLUMNS: Record<ListUsersQuery['sort'], string> = {
  createdAt: 'user.createdAt',
  fullName: 'user.fullName',
  email: 'user.email',
  role: 'user.role',
};

export async function list(query: ListUsersQuery, caller: AuthUser): Promise<{ data: UserResponse[]; meta: PageMeta }> {
  // IT Staff may only see active IT Staff (for managedBy pickers); Admin sees everyone.
  const role = caller.role === UserRole.IT_STAFF ? UserRole.IT_STAFF : query.role;
  const isActive = caller.role === UserRole.IT_STAFF ? true : query.isActive;

  const qb = userRepo().createQueryBuilder('user');
  if (role) qb.andWhere('user.role = :role', { role });
  if (isActive !== undefined) qb.andWhere('user.isActive = :isActive', { isActive });
  if (query.search) {
    qb.andWhere('(user.fullName ILIKE :kw OR user.email ILIKE :kw)', { kw: `%${query.search}%` });
  }
  qb.orderBy(SORT_COLUMNS[query.sort], query.order.toUpperCase() as 'ASC' | 'DESC')
    .addOrderBy('user.id', 'ASC')
    .skip(toSkip(query.page, query.limit))
    .take(query.limit);

  const [users, total] = await qb.getManyAndCount();
  return { data: users.map(serializeUser), meta: buildMeta(query.page, query.limit, total) };
}

export async function getById(id: string): Promise<UserResponse> {
  const user = await userRepo().findOne({ where: { id } });
  if (!user) throw new NotFoundError('User not found');
  return serializeUser(user);
}

export async function getDetail(
  id: string,
): Promise<UserResponse & { managedAssetCount: number; activeRequestCount: number }> {
  const user = await getById(id);
  const [managedAssetCount, activeRequestCount] = await Promise.all([
    AppDataSource.getRepository(Asset).count({ where: { managedById: id } }),
    AppDataSource.getRepository(AssetRequest).count({ where: { requesterId: id, status: In(ACTIVE_REQUEST_STATUSES) } }),
  ]);
  return { ...user, managedAssetCount, activeRequestCount };
}

export async function create(input: CreateUserInput, hashPassword: (plain: string) => Promise<string>): Promise<UserResponse> {
  const existing = await userRepo().findOne({ where: { email: input.email } });
  if (existing) throw new ConflictError('Email is already registered', 'EMAIL_TAKEN');

  const user = userRepo().create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    department: input.department ?? null,
    isActive: true,
  });
  await userRepo().save(user);
  return serializeUser(user);
}

export async function update(
  id: string,
  input: UpdateUserInput,
  caller: AuthUser,
): Promise<{ data: UserResponse; warnings?: string[] }> {
  const user = await userRepo().findOne({ where: { id } });
  if (!user) throw new NotFoundError('User not found');

  if (caller.id === id) {
    if (input.role !== undefined && input.role !== user.role) {
      throw new BadRequestError('You cannot change your own role', 'SELF_MODIFICATION_NOT_ALLOWED');
    }
    if (input.isActive === false) {
      throw new BadRequestError('You cannot deactivate your own account', 'SELF_MODIFICATION_NOT_ALLOWED');
    }
  }

  const warnings: string[] = [];
  if (input.role !== undefined && user.role === UserRole.IT_STAFF && input.role !== UserRole.IT_STAFF) {
    const managed = await AppDataSource.getRepository(Asset).count({ where: { managedById: id } });
    if (managed > 0) warnings.push(`manages ${managed} assets`);
  }

  if (input.fullName !== undefined) user.fullName = input.fullName;
  if (input.department !== undefined) user.department = input.department;
  if (input.role !== undefined) user.role = input.role;
  if (input.isActive !== undefined) user.isActive = input.isActive;
  await userRepo().save(user);

  return warnings.length > 0 ? { data: serializeUser(user), warnings } : { data: serializeUser(user) };
}
