import { AppDataSource } from '../../src/config/data-source';
import { User } from '../../src/entities/User';
import { UserRole } from '../../src/common/enums';
import { hashPassword, signToken } from '../../src/modules/auth/auth.service';

export const TEST_PASSWORD = 'Password123';

let counter = 0;

/** Creates a user directly through the repository (no HTTP) with a known password. */
export async function createUser(role: UserRole, overrides: Partial<User> = {}): Promise<User> {
  counter += 1;
  const repo = AppDataSource.getRepository(User);
  const user = repo.create({
    fullName: `${role} User ${counter}`,
    email: `${role.toLowerCase()}${counter}-${Date.now()}@test.dev`,
    passwordHash: await hashPassword(TEST_PASSWORD),
    role,
    department: null,
    isActive: true,
    ...overrides,
  });
  return repo.save(user);
}

export function tokenFor(user: Pick<User, 'id' | 'role'>): string {
  return signToken(user);
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Convenience: create a user of the given role and return an auth header for them. */
export async function authed(role: UserRole, overrides: Partial<User> = {}): Promise<{ user: User; headers: { Authorization: string } }> {
  const user = await createUser(role, overrides);
  return { user, headers: bearer(tokenFor(user)) };
}
