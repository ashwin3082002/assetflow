import { client } from './client';
import type { AuthResult, User } from '../types';

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  department?: string;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await client.post<{ data: AuthResult }>('/auth/login', { email, password });
  return res.data.data;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const res = await client.post<{ data: AuthResult }>('/auth/register', input);
  return res.data.data;
}

export async function me(): Promise<User> {
  const res = await client.get<{ data: User }>('/auth/me');
  return res.data.data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await client.patch('/auth/me/password', { currentPassword, newPassword });
}
