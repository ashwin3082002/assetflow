import request from 'supertest';
import { createApp } from '../src/app';
import { UserRole } from '../src/common/enums';
import { authed } from './helpers/auth';

const app = createApp();

type Role = UserRole | 'ANONYMOUS';
type Expectation = 'allowed' | 401 | 403;

interface RouteCase {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  body?: Record<string, unknown>;
  expect: Record<Role, Expectation>;
}

const ALL: Record<Role, Expectation> = { ANONYMOUS: 401, ADMIN: 'allowed', IT_STAFF: 'allowed', EMPLOYEE: 'allowed' };
const ADMIN_ONLY: Record<Role, Expectation> = { ANONYMOUS: 401, ADMIN: 'allowed', IT_STAFF: 403, EMPLOYEE: 403 };
const ADMIN_STAFF: Record<Role, Expectation> = { ANONYMOUS: 401, ADMIN: 'allowed', IT_STAFF: 'allowed', EMPLOYEE: 403 };
const EMPLOYEE_ONLY: Record<Role, Expectation> = { ANONYMOUS: 401, ADMIN: 403, IT_STAFF: 403, EMPLOYEE: 'allowed' };

const SOME_UUID = '00000000-0000-4000-8000-000000000000';
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Table-driven RBAC matrix. "allowed" means the role passes the auth gates: any status other than
 * 401/403 (typically 200/201/404/400 depending on the payload). New routes must be added here in every phase.
 */
const ROUTES: RouteCase[] = [
  { method: 'get', path: '/api/auth/me', expect: ALL },
  { method: 'patch', path: '/api/auth/me/password', body: { currentPassword: 'Password123', newPassword: 'Password123' }, expect: ALL },
  { method: 'get', path: '/api/users', expect: ADMIN_STAFF },
  { method: 'post', path: '/api/users', body: { fullName: 'RBAC', email: 'rbac@test.dev', password: 'Secret123', role: 'EMPLOYEE' }, expect: ADMIN_ONLY },
  { method: 'get', path: `/api/users/${SOME_UUID}`, expect: ADMIN_ONLY },
  { method: 'patch', path: `/api/users/${SOME_UUID}`, body: { fullName: 'RBAC' }, expect: ADMIN_ONLY },
  // Phase 4
  { method: 'get', path: '/api/categories', expect: ALL },
  { method: 'post', path: '/api/categories', body: { name: 'RBAC Category' }, expect: ADMIN_ONLY },
  { method: 'patch', path: `/api/categories/${SOME_UUID}`, body: { name: 'RBAC Category' }, expect: ADMIN_ONLY },
  { method: 'delete', path: `/api/categories/${SOME_UUID}`, expect: ADMIN_ONLY },
  { method: 'get', path: '/api/assets', expect: ALL },
  { method: 'post', path: '/api/assets', body: { name: 'RBAC', description: 'x', serialNumber: 'RBAC-1', categoryId: SOME_UUID }, expect: ADMIN_STAFF },
  { method: 'get', path: `/api/assets/${SOME_UUID}`, expect: ALL },
  { method: 'patch', path: `/api/assets/${SOME_UUID}`, body: { name: 'RBAC' }, expect: ADMIN_STAFF },
  { method: 'delete', path: `/api/assets/${SOME_UUID}`, expect: ADMIN_STAFF },
  { method: 'post', path: `/api/assets/${SOME_UUID}/image`, expect: ADMIN_STAFF },
  { method: 'delete', path: `/api/assets/${SOME_UUID}/image`, expect: ADMIN_STAFF },
  { method: 'post', path: `/api/assets/${SOME_UUID}/retire`, expect: ADMIN_STAFF },
  { method: 'get', path: `/api/assets/${SOME_UUID}/requests`, expect: ADMIN_STAFF },
  { method: 'get', path: `/api/assets/${SOME_UUID}/maintenance`, expect: ADMIN_STAFF },
  { method: 'get', path: `/api/assets/${SOME_UUID}/reviews`, expect: ALL },
  // Phase 6
  { method: 'get', path: '/api/requests', expect: ALL },
  { method: 'post', path: '/api/requests', body: { assetId: SOME_UUID, purpose: 'RBAC request', requestedFrom: TODAY, expectedReturnDate: TODAY }, expect: EMPLOYEE_ONLY },
  { method: 'get', path: `/api/requests/${SOME_UUID}`, expect: ALL },
  { method: 'post', path: `/api/requests/${SOME_UUID}/cancel`, expect: EMPLOYEE_ONLY },
  { method: 'post', path: `/api/requests/${SOME_UUID}/return`, expect: EMPLOYEE_ONLY },
  { method: 'post', path: `/api/requests/${SOME_UUID}/approve`, expect: ADMIN_STAFF },
  { method: 'post', path: `/api/requests/${SOME_UUID}/reject`, body: { reason: 'RBAC reason' }, expect: ADMIN_STAFF },
  { method: 'post', path: `/api/requests/${SOME_UUID}/allocate`, expect: ADMIN_STAFF },
  { method: 'post', path: `/api/requests/${SOME_UUID}/complete`, body: { returnCondition: 'GOOD' }, expect: ADMIN_STAFF },
  // Phase 8
  { method: 'get', path: '/api/maintenance', expect: ADMIN_STAFF },
  { method: 'post', path: '/api/maintenance', body: { assetId: SOME_UUID, type: 'REPAIR', description: 'RBAC maintenance' }, expect: ADMIN_STAFF },
  { method: 'get', path: `/api/maintenance/${SOME_UUID}`, expect: ADMIN_STAFF },
  { method: 'patch', path: `/api/maintenance/${SOME_UUID}`, body: { description: 'RBAC maintenance' }, expect: ADMIN_STAFF },
  { method: 'post', path: `/api/maintenance/${SOME_UUID}/complete`, body: { resultingCondition: 'GOOD' }, expect: ADMIN_STAFF },
  { method: 'delete', path: `/api/maintenance/${SOME_UUID}`, expect: ADMIN_STAFF },
  { method: 'get', path: '/api/reviews', expect: ALL },
  { method: 'post', path: '/api/reviews', body: { requestId: SOME_UUID, rating: 5 }, expect: EMPLOYEE_ONLY },
  // Phase 10
  { method: 'get', path: '/api/dashboard/admin', expect: ADMIN_ONLY },
  { method: 'get', path: '/api/dashboard/staff', expect: ADMIN_STAFF },
  { method: 'get', path: '/api/dashboard/employee', expect: EMPLOYEE_ONLY },
];

const ROLES: Role[] = ['ANONYMOUS', UserRole.ADMIN, UserRole.IT_STAFF, UserRole.EMPLOYEE];

describe('RBAC matrix (API-level enforcement)', () => {
  const headersByRole: Partial<Record<Role, { Authorization: string }>> = {};

  beforeAll(async () => {
    for (const role of ROLES) {
      if (role === 'ANONYMOUS') continue;
      headersByRole[role] = (await authed(role)).headers;
    }
  });

  for (const route of ROUTES) {
    for (const role of ROLES) {
      const expected = route.expect[role];
      it(`${route.method.toUpperCase()} ${route.path} as ${role} → ${expected}`, async () => {
        let req = request(app)[route.method](route.path);
        if (role !== 'ANONYMOUS') req = req.set(headersByRole[role]!);
        if (route.body) {
          // Keep POST emails unique per role so an "allowed" create never fails on 409.
          const body = 'email' in route.body ? { ...route.body, email: `rbac-${role}-${Date.now()}@test.dev` } : route.body;
          req = req.send(body);
        }
        const res = await req;
        if (expected === 'allowed') {
          expect([401, 403]).not.toContain(res.status);
        } else {
          expect(res.status).toBe(expected);
          expect(res.body.error.code).toBe(expected === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
        }
      });
    }
  }
});
