import { UserRole } from '../types';

/** Landing page per role (docs/architecture.md §4.2). */
export function dashboardPathFor(role: UserRole): string {
  switch (role) {
    case UserRole.ADMIN:
      return '/admin';
    case UserRole.IT_STAFF:
      return '/staff';
    default:
      return '/employee';
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  IT_STAFF: 'IT Staff',
  EMPLOYEE: 'Employee',
};

export function isStaff(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.IT_STAFF;
}
