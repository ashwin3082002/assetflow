import request from 'supertest';
import { createApp } from '../src/app';
import { AppDataSource } from '../src/config/data-source';
import { AssetRequest } from '../src/entities/AssetRequest';
import { AssetStatus, RequestStatus, UserRole } from '../src/common/enums';
import { authed } from './helpers/auth';
import { createAsset, createCategory } from './helpers/factories';
import { truncateAll } from './helpers/db';
import { requestInState } from './helpers/workflow';

const app = createApp();

type Headers = { Authorization: string };

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Backdates an ALLOCATED request so it counts as overdue (dates are validated on create, so use the repository). */
async function makeOverdue(requestId: string): Promise<void> {
  await AppDataSource.getRepository(AssetRequest).update({ id: requestId }, { requestedFrom: isoDaysFromNow(-10), expectedReturnDate: isoDaysFromNow(-1) });
}

describe('Dashboard API', () => {
  let admin: Headers;
  let staff: Headers;
  let employee: Headers;
  let employeeId: string;

  beforeAll(async () => {
    await truncateAll();
    admin = (await authed(UserRole.ADMIN)).headers;
    staff = (await authed(UserRole.IT_STAFF)).headers;
    const emp = await authed(UserRole.EMPLOYEE);
    employee = emp.headers;
    employeeId = emp.user.id;
  });

  describe('1. role gating', () => {
    it.each([
      ['/api/dashboard/admin', 'IT_STAFF', 403],
      ['/api/dashboard/admin', 'EMPLOYEE', 403],
      ['/api/dashboard/admin', 'ADMIN', 200],
      ['/api/dashboard/staff', 'EMPLOYEE', 403],
      ['/api/dashboard/staff', 'IT_STAFF', 200],
      ['/api/dashboard/staff', 'ADMIN', 200],
      ['/api/dashboard/employee', 'ADMIN', 403],
      ['/api/dashboard/employee', 'IT_STAFF', 403],
      ['/api/dashboard/employee', 'EMPLOYEE', 200],
    ])('%s as %s → %i', async (path, role, status) => {
      const headers = role === 'ADMIN' ? admin : role === 'IT_STAFF' ? staff : employee;
      const res = await request(app).get(path).set(headers);
      expect(res.status).toBe(status);
      if (status === 403) expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('anonymous → 401 on every dashboard', async () => {
      for (const path of ['/api/dashboard/admin', '/api/dashboard/staff', '/api/dashboard/employee']) {
        const res = await request(app).get(path);
        expect(res.status).toBe(401);
      }
    });
  });

  describe('2. counts on fixtures', () => {
    let pendingId: string;
    let approvedId: string;
    let overdueId: string;
    let completedId: string;
    let damagedAssetId: string;
    let secondEmployee: Headers;

    beforeAll(async () => {
      await truncateAll();
      admin = (await authed(UserRole.ADMIN)).headers;
      staff = (await authed(UserRole.IT_STAFF)).headers;
      const emp = await authed(UserRole.EMPLOYEE);
      employee = emp.headers;
      employeeId = emp.user.id;
      secondEmployee = (await authed(UserRole.EMPLOYEE, { isActive: false })).headers;

      const laptops = await createCategory({ name: 'Laptops' });
      const monitors = await createCategory({ name: 'Monitors' });
      const a1 = await createAsset({ category: laptops });
      const a2 = await createAsset({ category: laptops });
      const a3 = await createAsset({ category: laptops });
      const a4 = await createAsset({ category: monitors });
      const a5 = await createAsset({ category: monitors });
      await createAsset({ category: monitors }); // stays AVAILABLE, never requested

      pendingId = await requestInState(app, a1.id, RequestStatus.PENDING, employee, staff);
      approvedId = await requestInState(app, a2.id, RequestStatus.APPROVED, employee, staff);
      overdueId = await requestInState(app, a3.id, RequestStatus.ALLOCATED, employee, staff);
      await makeOverdue(overdueId);
      completedId = await requestInState(app, a4.id, RequestStatus.COMPLETED, employee, staff);

      // DAMAGED return → asset UNDER_MAINTENANCE without an OPEN record (needs a maintenance record).
      const damaged = await requestInState(app, a5.id, RequestStatus.RETURN_PENDING, employee, staff);
      const done = await request(app).post(`/api/requests/${damaged}/complete`).set(staff).send({ returnCondition: 'DAMAGED' });
      expect(done.status).toBe(200);
      damagedAssetId = a5.id;

      // One OPEN maintenance record on a fresh asset.
      const m = await createAsset({ category: monitors });
      const opened = await request(app).post('/api/maintenance').set(staff).send({ assetId: m.id, type: 'INSPECTION', description: 'Annual check' });
      expect(opened.status).toBe(201);

      // One review on the completed loan.
      const review = await request(app).post('/api/reviews').set(employee).send({ requestId: completedId, rating: 4 });
      expect(review.status).toBe(201);
    });

    it('admin dashboard aggregates users, assets, requests, maintenance, categories and ratings', async () => {
      const res = await request(app).get('/api/dashboard/admin').set(admin);
      expect(res.status).toBe(200);
      const d = res.body.data;

      // Every createAsset() call creates its own IT_STAFF manager, so only ADMIN/EMPLOYEE counts are fixed here.
      expect(d.users.byRole.ADMIN).toBe(1);
      expect(d.users.byRole.EMPLOYEE).toBe(2);
      expect(d.users.inactive).toBe(1);
      expect(d.users.total).toBe(d.users.byRole.ADMIN + d.users.byRole.IT_STAFF + d.users.byRole.EMPLOYEE);

      expect(d.assets.total).toBe(7);
      expect(d.assets.byStatus).toMatchObject({ RESERVED: 1, ALLOCATED: 1, UNDER_MAINTENANCE: 2, RETIRED: 0 });
      expect(d.assets.byStatus.AVAILABLE).toBe(3);

      expect(d.requests).toMatchObject({ pending: 1, approved: 1, allocated: 1, returnPending: 0, overdue: 1, completedLast30Days: 2 });
      expect(d.maintenance).toMatchObject({ open: 1, completedLast30Days: 0, totalCostLast30Days: 0 });

      const byCategory = Object.fromEntries(d.assetsByCategory.map((c: { name: string; total: number; available: number }) => [c.name, c]));
      // Laptops: a1 PENDING (still AVAILABLE), a2 RESERVED, a3 ALLOCATED. Monitors: a4 back in stock, a5 + m under maintenance, a6 untouched.
      expect(byCategory.Laptops).toMatchObject({ total: 3, available: 1 });
      expect(byCategory.Monitors).toMatchObject({ total: 4, available: 2 });

      expect(d.recentRequests).toHaveLength(5);
      expect(d.recentRequests[0].id).not.toBe(pendingId); // newest first
      expect(d.recentMaintenance).toHaveLength(1);
      expect(d.topRatedAssets).toEqual([expect.objectContaining({ avgRating: 4, reviewCount: 1 })]);
    });

    it('staff dashboard lists each queue, counts overdue and flags the damaged unit as needing a record', async () => {
      const res = await request(app).get('/api/dashboard/staff').set(staff);
      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.counts).toEqual({ pending: 1, awaitingAllocation: 1, returnPending: 0, overdue: 1, openMaintenance: 1, needsMaintenanceRecord: 1 });
      expect(d.inventory.total).toBe(7);
      expect(d.inventory.byStatus.UNDER_MAINTENANCE).toBe(2);

      expect(d.pendingRequests.map((r: { id: string }) => r.id)).toEqual([pendingId]);
      expect(d.awaitingAllocation.map((r: { id: string }) => r.id)).toEqual([approvedId]);
      expect(d.returnPending).toEqual([]);
      expect(d.overdue.map((r: { id: string; isOverdue: boolean }) => [r.id, r.isOverdue])).toEqual([[overdueId, true]]);
      expect(d.openMaintenance).toHaveLength(1);
      expect(d.openMaintenance[0].status).toBe('OPEN');
      expect(d.needsMaintenanceRecord.map((a: { id: string; status: string }) => [a.id, a.status])).toEqual([[damagedAssetId, AssetStatus.UNDER_MAINTENANCE]]);
      expect(d.recentlyAdded).toHaveLength(5);
      expect(d.recentlyAdded[0]).toMatchObject({ category: expect.objectContaining({ name: 'Monitors' }), reviewCount: 0 });
    });

    it('the damaged unit leaves needsMaintenanceRecord once a record is opened', async () => {
      const opened = await request(app).post('/api/maintenance').set(staff).send({ assetId: damagedAssetId, type: 'REPAIR', description: 'Cracked screen' });
      expect(opened.status).toBe(201);
      const res = await request(app).get('/api/dashboard/staff').set(staff);
      expect(res.body.data.counts).toMatchObject({ needsMaintenanceRecord: 0, openMaintenance: 2 });
      expect(res.body.data.needsMaintenanceRecord).toEqual([]);
    });

    it('admin can read the staff dashboard too', async () => {
      const res = await request(app).get('/api/dashboard/staff').set(admin);
      expect(res.status).toBe(200);
      expect(res.body.data.counts.pending).toBe(1);
    });

    it('employee dashboard is scoped to the caller and lists completed loans awaiting a review', async () => {
      const res = await request(app).get('/api/dashboard/employee').set(employee);
      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.counts).toEqual({ activeAssets: 1, pendingRequests: 1, approvedRequests: 1, reviewsSubmitted: 1, availableAssets: 3 });
      expect(d.activeAssets.map((r: { id: string; isOverdue: boolean }) => [r.id, r.isOverdue])).toEqual([[overdueId, true]]);
      expect(d.pendingRequests.map((r: { id: string }) => r.id).sort()).toEqual([pendingId, approvedId].sort());
      expect(d.recentStatusChanges).toHaveLength(5);
      expect(d.recentStatusChanges.every((r: { requester: { id: string } }) => r.requester.id === employeeId)).toBe(true);
      // The damaged loan is COMPLETED and unreviewed; the GOOD one was reviewed.
      expect(d.pendingReviews).toHaveLength(1);
      expect(d.pendingReviews[0].status).toBe(RequestStatus.COMPLETED);
      expect(d.pendingReviews[0].id).not.toBe(completedId);
    });

    it('a different employee sees an empty dashboard', async () => {
      const other = (await authed(UserRole.EMPLOYEE)).headers;
      const res = await request(app).get('/api/dashboard/employee').set(other);
      expect(res.status).toBe(200);
      expect(res.body.data.counts).toEqual({ activeAssets: 0, pendingRequests: 0, approvedRequests: 0, reviewsSubmitted: 0, availableAssets: 3 });
      expect(res.body.data.activeAssets).toEqual([]);
      expect(res.body.data.pendingReviews).toEqual([]);
      expect(res.body.data.recentStatusChanges).toEqual([]);
      expect(secondEmployee).toBeDefined();
    });
  });
});
