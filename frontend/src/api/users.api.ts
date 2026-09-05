import { client, compactParams, type ListParams } from './client';
import type { ListResponse, User, UserRole } from '../types';

/** Mirrors docs/api-design.md §4. ADMIN only, except the IT_STAFF-scoped list used for managedBy pickers. */

export interface UserInput {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  department?: string | null;
}

export interface UpdateUserInput {
  fullName?: string;
  department?: string | null;
  role?: UserRole;
  isActive?: boolean;
}

/** PATCH may add warnings, e.g. "manages 3 assets" when an IT Staff member changes role. */
export interface UpdateUserResult {
  data: User;
  warnings?: string[];
}

export async function listUsers(params: ListParams = {}): Promise<ListResponse<User>> {
  const res = await client.get<ListResponse<User>>('/users', { params: compactParams(params) });
  return res.data;
}

/** Active IT Staff for managedBy pickers. The API forces this filter for IT_STAFF callers anyway. */
export async function listManagers(): Promise<User[]> {
  const res = await listUsers({ role: 'IT_STAFF', isActive: 'true', limit: '100', sort: 'fullName', order: 'asc' });
  return res.data;
}

export async function createUser(input: UserInput): Promise<User> {
  const res = await client.post<{ data: User }>('/users', input);
  return res.data.data;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UpdateUserResult> {
  const res = await client.patch<UpdateUserResult>(`/users/${id}`, input);
  return res.data;
}
