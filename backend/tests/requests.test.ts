import request from 'supertest';
import { createApp } from '../src/app';
import { AppDataSource } from '../src/config/data-source';
import { Asset } from '../src/entities/Asset';
import { AssetRequest } from '../src/entities/AssetRequest';
import { AssetCondition, AssetStatus, RequestStatus, UserRole } from '../src/common/enums';
import { authed } from './helpers/auth';
import { createAsset } from './helpers/factories';

const app = createApp();

type Headers = { Authorization: string };

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
const TODAY = isoDaysFromNow(0);

async function assetStatus(id: string): Promise<{ status: AssetStatus; condition: AssetCondition }> {
  const asset = await AppDataSource.getRepository(Asset).findOneOrFail({ where: { id } });
  return { status: asset.status, condition: asset.condition };
}

async function createRequest(headers: Headers, assetId: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/requests')
    .set(headers)
    .send({ assetId, purpose: 'Need it for a project', requestedFrom: TODAY, expectedReturnDate: isoDaysFromNow(7), ...overrides });
}

function act(headers: Headers, id: string, action: string, body?: Record<string, unknown>) {
  const req = request(app).post(`/api/requests/${id}/${action}`).set(headers);
  return body ? req.send(body) : req.send();
}

/** Drives a fresh asset to the given request status through the real endpoints. */
async function requestInState(status: RequestStatus, employee: Headers, staff: Headers, assetOverrides: Parameters<typeof createAsset>[0] = {}) {
  const asset = await createAsset(assetOverrides);
  const created = await createRequest(employee, asset.id);
  expect(created.status).toBe(201);
  const id: string = created.body.data.id;
  const steps: Record<RequestStatus, () => Promise<void>> = {
    [RequestStatus.PENDING]: async () => {},
    [RequestStatus.APPROVED]: async () => {
      expect((await act(staff, id, 'approve')).status).toBe(200);
    },
    [RequestStatus.ALLOCATED]: async () => {
      await steps.APPROVED();
      expect((await act(staff, id, 'allocate')).status).toBe(200);
    },
    [RequestStatus.RETURN_PENDING]: async () => {
      await steps.ALLOCATED();
      expect((await act(employee, id, 'return')).status).toBe(200);
    },
    [RequestStatus.COMPLETED]: async () => {
      await steps.ALLOCATED();
      expect((await act(staff, id, 'complete', { returnCondition: 'GOOD' })).status).toBe(200);
    },
    [RequestStatus.REJECTED]: async () => {
      expect((await act(staff, id, 'reject', { reason: 'Not now' })).status).toBe(200);
    },
    [RequestStatus.CANCELLED]: async () => {
      expect((await act(employee, id, 'cancel')).status).toBe(200);
    },
  };
  await steps[status]();
  return { asset, id };
}

describe('Requests API', () => {
  let employee: Headers;
  let employeeId: string;
  let otherEmployee: Headers;
  let staff: Headers;
  let staffId: string;
  let admin: Headers;

  beforeAll(async () => {
    const s = await authed(UserRole.IT_STAFF);
    staff = s.headers;
    staffId = s.user.id;
    admin = (await authed(UserRole.ADMIN)).headers;
  });

  // Fresh employees per test so the active-request cap (5) never leaks between tests.
  beforeEach(async () => {
    const e = await authed(UserRole.EMPLOYEE);
    employee = e.headers;
    employeeId = e.user.id;
    otherEmployee = (await authed(UserRole.EMPLOYEE)).headers;
  });

  describe('1–2. happy path', () => {
    it('create → approve → allocate → return → complete with matching asset status', async () => {
      const asset = await createAsset();

      const created = await createRequest(employee, asset.id);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        status: 'PENDING',
        purpose: 'Need it for a project',
        isOverdue: false,
        processedBy: null,
        review: null,
        asset: { id: asset.id, serialNumber: asset.serialNumber },
        requester: { id: employeeId },
      });
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.AVAILABLE });
      const id = created.body.data.id;

      const approved = await act(staff, id, 'approve');
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('APPROVED');
      expect(approved.body.data.approvedAt).toBeTruthy();
      expect(approved.body.data.processedBy).toEqual({ id: staffId, fullName: expect.any(String) });
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.RESERVED });

      // Staff sees the active request on the asset detail and history.
      const detail = await request(app).get(`/api/assets/${asset.id}`).set(staff);
      expect(detail.body.data.activeRequest).toMatchObject({ id, status: 'APPROVED' });
      const history = await request(app).get(`/api/assets/${asset.id}/requests`).set(staff);
      expect(history.body.data.map((r: { id: string }) => r.id)).toEqual([id]);

      const allocated = await act(admin, id, 'allocate');
      expect(allocated.status).toBe(200);
      expect(allocated.body.data.status).toBe('ALLOCATED');
      expect(allocated.body.data.allocatedAt).toBeTruthy();
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.ALLOCATED });

      const returned = await act(employee, id, 'return');
      expect(returned.status).toBe(200);
      expect(returned.body.data.status).toBe('RETURN_PENDING');
      expect(returned.body.data.returnInitiatedAt).toBeTruthy();
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.ALLOCATED });

      const completed = await act(staff, id, 'complete', { returnCondition: 'FAIR', returnNotes: 'Scratched lid' });
      expect(completed.status).toBe(200);
      expect(completed.body.data).toMatchObject({ status: 'COMPLETED', returnCondition: 'FAIR', returnNotes: 'Scratched lid' });
      expect(completed.body.data.completedAt).toBeTruthy();
      expect(await assetStatus(asset.id)).toEqual({ status: AssetStatus.AVAILABLE, condition: AssetCondition.FAIR });
    });

    it('completes directly from ALLOCATED without initiate-return', async () => {
      const { asset, id } = await requestInState(RequestStatus.ALLOCATED, employee, staff);
      const res = await act(staff, id, 'complete', { returnCondition: 'GOOD' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.returnInitiatedAt).toBeNull();
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.AVAILABLE });
    });
  });

  describe('3. no waitlist', () => {
    it.each([AssetStatus.RESERVED, AssetStatus.ALLOCATED, AssetStatus.UNDER_MAINTENANCE])('create for %s asset → 409 ASSET_NOT_AVAILABLE', async (status) => {
      const asset = await createAsset({ status });
      const res = await createRequest(employee, asset.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_NOT_AVAILABLE');
    });

    it('create for RETIRED asset → 404 (hidden from employees)', async () => {
      const asset = await createAsset({ status: AssetStatus.RETIRED });
      const res = await createRequest(employee, asset.id);
      expect(res.status).toBe(404);
    });

    it('create for unknown asset → 404', async () => {
      const res = await createRequest(employee, '00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  describe('4. duplicate and cap', () => {
    it('second active request for the same asset by the same user → 409 DUPLICATE_REQUEST', async () => {
      const asset = await createAsset();
      expect((await createRequest(employee, asset.id)).status).toBe(201);
      const dup = await createRequest(employee, asset.id);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DUPLICATE_REQUEST');
    });

    it('sixth active request → 409 ACTIVE_REQUEST_LIMIT', async () => {
      const { headers } = await authed(UserRole.EMPLOYEE);
      for (let i = 0; i < 5; i += 1) {
        const asset = await createAsset();
        expect((await createRequest(headers, asset.id)).status).toBe(201);
      }
      const asset = await createAsset();
      const res = await createRequest(headers, asset.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ACTIVE_REQUEST_LIMIT');
    });
  });

  describe('5. validation', () => {
    it('loan period > maxLoanDays → 400 LOAN_PERIOD_EXCEEDED', async () => {
      const asset = await createAsset({ maxLoanDays: 3 });
      const res = await createRequest(employee, asset.id, { expectedReturnDate: isoDaysFromNow(4) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('LOAN_PERIOD_EXCEEDED');
      expect(res.body.error.details[0].path).toBe('expectedReturnDate');
      // Exactly the limit is fine.
      expect((await createRequest(employee, asset.id, { expectedReturnDate: isoDaysFromNow(3) })).status).toBe(201);
    });

    it('expectedReturnDate < requestedFrom → 400', async () => {
      const asset = await createAsset();
      const res = await createRequest(employee, asset.id, { requestedFrom: isoDaysFromNow(5), expectedReturnDate: isoDaysFromNow(2) });
      expect(res.status).toBe(400);
      expect(res.body.error.details.some((d: { path: string }) => d.path === 'expectedReturnDate')).toBe(true);
    });

    it('requestedFrom in the past → 400', async () => {
      const asset = await createAsset();
      const res = await createRequest(employee, asset.id, { requestedFrom: isoDaysFromNow(-1) });
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].path).toBe('requestedFrom');
    });

    it('rejects unknown fields, short purpose and bad uuid', async () => {
      const asset = await createAsset();
      expect((await createRequest(employee, asset.id, { status: 'APPROVED' })).status).toBe(400);
      expect((await createRequest(employee, asset.id, { purpose: 'abc' })).status).toBe(400);
      expect((await createRequest(employee, 'not-a-uuid')).status).toBe(400);
    });
  });

  describe('6–7. two pending requests for one unit', () => {
    it('approve first → 200; approve second → 409; after completion the second becomes approvable', async () => {
      const asset = await createAsset();
      const first = (await createRequest(employee, asset.id)).body.data.id;
      const second = (await createRequest(otherEmployee, asset.id)).body.data.id;

      expect((await act(staff, first, 'approve')).status).toBe(200);
      const blocked = await act(staff, second, 'approve');
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('ASSET_NOT_AVAILABLE');
      expect((await request(app).get(`/api/requests/${second}`).set(staff)).body.data.status).toBe('PENDING');

      expect((await act(staff, first, 'allocate')).status).toBe(200);
      expect((await act(staff, first, 'complete', { returnCondition: 'GOOD' })).status).toBe(200);

      expect((await act(staff, second, 'approve')).status).toBe(200);
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.RESERVED });
    });

    it('concurrency: parallel approves → exactly one 200, one 409, one APPROVED row', async () => {
      const asset = await createAsset();
      const ids = await Promise.all([
        createRequest(employee, asset.id).then((r) => r.body.data.id as string),
        createRequest(otherEmployee, asset.id).then((r) => r.body.data.id as string),
      ]);

      const results = await Promise.all(ids.map((id) => act(staff, id, 'approve')));
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe('ASSET_NOT_AVAILABLE');

      const approved = await AppDataSource.getRepository(AssetRequest).count({ where: { assetId: asset.id, status: RequestStatus.APPROVED } });
      expect(approved).toBe(1);
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.RESERVED });
    });

    it('concurrency: the same request approved twice in parallel → one 200, one 409', async () => {
      const asset = await createAsset();
      const id = (await createRequest(employee, asset.id)).body.data.id;
      const results = await Promise.all([act(staff, id, 'approve'), act(admin, id, 'approve')]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.RESERVED });
    });

    it('the partial unique index rejects a second holding request inserted directly', async () => {
      const { asset } = await requestInState(RequestStatus.APPROVED, employee, staff);
      const repo = AppDataSource.getRepository(AssetRequest);
      await expect(
        repo.save(
          repo.create({
            assetId: asset.id,
            requesterId: (await authed(UserRole.EMPLOYEE)).user.id,
            status: RequestStatus.APPROVED,
            purpose: 'direct insert',
            requestedFrom: TODAY,
            expectedReturnDate: TODAY,
          }),
        ),
      ).rejects.toMatchObject({ driverError: { code: '23505' } });
    });
  });

  describe('8. illegal transitions → 409 INVALID_STATE_TRANSITION', () => {
    const cases: [string, RequestStatus, string, 'staff' | 'employee', Record<string, unknown> | undefined][] = [
      ['approve APPROVED', RequestStatus.APPROVED, 'approve', 'staff', undefined],
      ['approve COMPLETED', RequestStatus.COMPLETED, 'approve', 'staff', undefined],
      ['allocate PENDING', RequestStatus.PENDING, 'allocate', 'staff', undefined],
      ['allocate ALLOCATED', RequestStatus.ALLOCATED, 'allocate', 'staff', undefined],
      ['complete PENDING', RequestStatus.PENDING, 'complete', 'staff', { returnCondition: 'GOOD' }],
      ['complete APPROVED', RequestStatus.APPROVED, 'complete', 'staff', { returnCondition: 'GOOD' }],
      ['complete COMPLETED', RequestStatus.COMPLETED, 'complete', 'staff', { returnCondition: 'GOOD' }],
      ['cancel ALLOCATED', RequestStatus.ALLOCATED, 'cancel', 'employee', undefined],
      ['cancel REJECTED', RequestStatus.REJECTED, 'cancel', 'employee', undefined],
      ['return PENDING', RequestStatus.PENDING, 'return', 'employee', undefined],
      ['return RETURN_PENDING', RequestStatus.RETURN_PENDING, 'return', 'employee', undefined],
      ['reject COMPLETED', RequestStatus.COMPLETED, 'reject', 'staff', { reason: 'too late' }],
      ['reject ALLOCATED', RequestStatus.ALLOCATED, 'reject', 'staff', { reason: 'too late' }],
      ['reject CANCELLED', RequestStatus.CANCELLED, 'reject', 'staff', { reason: 'too late' }],
    ];

    it.each(cases)('%s', async (_label, state, action, actor, body) => {
      const { asset, id } = await requestInState(state, employee, staff);
      const before = await assetStatus(asset.id);
      const res = await act(actor === 'staff' ? staff : employee, id, action, body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(await assetStatus(asset.id)).toEqual(before);
    });

    it('unknown request id → 404 on every action', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      expect((await act(staff, missing, 'approve')).status).toBe(404);
      expect((await act(employee, missing, 'cancel')).status).toBe(404);
      expect((await request(app).get(`/api/requests/${missing}`).set(staff)).status).toBe(404);
    });
  });

  describe('9. reject and cancel', () => {
    it('reject PENDING records reason and processor; asset untouched', async () => {
      const { asset, id } = await requestInState(RequestStatus.PENDING, employee, staff);
      const res = await act(staff, id, 'reject', { reason: 'Out of budget' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Out of budget', processedBy: { id: staffId } });
      expect(res.body.data.rejectedAt).toBeTruthy();
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.AVAILABLE });
    });

    it('reject APPROVED releases the asset (RESERVED → AVAILABLE)', async () => {
      const { asset, id } = await requestInState(RequestStatus.APPROVED, employee, staff);
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.RESERVED });
      const res = await act(staff, id, 'reject', { reason: 'Unit failed inspection' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.AVAILABLE });
    });

    it('cancel APPROVED releases the asset; cancel PENDING is a plain update', async () => {
      const approved = await requestInState(RequestStatus.APPROVED, employee, staff);
      const res = await act(employee, approved.id, 'cancel');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(res.body.data.cancelledAt).toBeTruthy();
      expect(await assetStatus(approved.asset.id)).toMatchObject({ status: AssetStatus.AVAILABLE });

      const pending = await requestInState(RequestStatus.PENDING, employee, staff);
      expect((await act(employee, pending.id, 'cancel')).body.data.status).toBe('CANCELLED');
      expect(await assetStatus(pending.asset.id)).toMatchObject({ status: AssetStatus.AVAILABLE });
    });

    it('reject requires a reason (≥ 3 chars)', async () => {
      const { id } = await requestInState(RequestStatus.PENDING, employee, staff);
      expect((await act(staff, id, 'reject')).status).toBe(400);
      expect((await act(staff, id, 'reject', { reason: 'no' })).status).toBe(400);
      expect((await act(staff, id, 'reject', { reason: 'ok!', extra: 1 })).status).toBe(400);
    });

    it('complete requires a valid returnCondition', async () => {
      const { id } = await requestInState(RequestStatus.ALLOCATED, employee, staff);
      expect((await act(staff, id, 'complete')).status).toBe(400);
      expect((await act(staff, id, 'complete', { returnCondition: 'BROKEN' })).status).toBe(400);
    });
  });

  describe('10. ownership and scoping', () => {
    it('employee cannot view, cancel or return another employee’s request → 403', async () => {
      const { id } = await requestInState(RequestStatus.ALLOCATED, employee, staff);
      expect((await request(app).get(`/api/requests/${id}`).set(otherEmployee)).status).toBe(403);
      expect((await act(otherEmployee, id, 'return')).status).toBe(403);
      const pending = await requestInState(RequestStatus.PENDING, employee, staff);
      expect((await act(otherEmployee, pending.id, 'cancel')).status).toBe(403);
      // Owner and staff can view.
      expect((await request(app).get(`/api/requests/${id}`).set(employee)).status).toBe(200);
      expect((await request(app).get(`/api/requests/${id}`).set(admin)).status).toBe(200);
    });

    it('employee list is scoped to own requests; requesterId of another user → 403', async () => {
      const { user: a, headers: hA } = await authed(UserRole.EMPLOYEE);
      const { user: b, headers: hB } = await authed(UserRole.EMPLOYEE);
      await createRequest(hA, (await createAsset()).id);
      await createRequest(hA, (await createAsset()).id);
      await createRequest(hB, (await createAsset()).id);

      const mine = await request(app).get('/api/requests').set(hA);
      expect(mine.status).toBe(200);
      expect(mine.body.meta.total).toBe(2);
      expect(mine.body.data.every((r: { requester: { id: string } }) => r.requester.id === a.id)).toBe(true);

      const explicitSelf = await request(app).get(`/api/requests?requesterId=${a.id}`).set(hA);
      expect(explicitSelf.body.meta.total).toBe(2);

      const other = await request(app).get(`/api/requests?requesterId=${b.id}`).set(hA);
      expect(other.status).toBe(403);

      const staffView = await request(app).get(`/api/requests?requesterId=${b.id}`).set(staff);
      expect(staffView.body.meta.total).toBe(1);
    });

    it('staff list supports status csv, assetId, search, date range, sort whitelist', async () => {
      const asset = await createAsset({ name: 'Zebra Scanner' });
      const { id } = await requestInState(RequestStatus.APPROVED, employee, staff, { name: 'Zebra Scanner' });
      const otherPending = await createRequest(employee, asset.id);
      expect(otherPending.status).toBe(201);

      const byStatus = await request(app).get('/api/requests?status=APPROVED&search=zebra').set(staff);
      expect(byStatus.status).toBe(200);
      expect(byStatus.body.data.map((r: { id: string }) => r.id)).toEqual([id]);

      const byAsset = await request(app).get(`/api/requests?assetId=${asset.id}`).set(staff);
      expect(byAsset.body.data.map((r: { id: string }) => r.id)).toEqual([otherPending.body.data.id]);

      const inRange = await request(app).get(`/api/requests?from=${TODAY}&to=${TODAY}&limit=100`).set(staff);
      expect(inRange.body.meta.total).toBeGreaterThan(0);
      const outOfRange = await request(app).get(`/api/requests?from=${isoDaysFromNow(1)}`).set(staff);
      expect(outOfRange.body.meta.total).toBe(0);
      // `to` is inclusive of the whole day: yesterday excludes today's rows, today includes them.
      expect((await request(app).get(`/api/requests?to=${isoDaysFromNow(-1)}`).set(staff)).body.meta.total).toBe(0);
      expect((await request(app).get(`/api/requests?to=${TODAY}&limit=100`).set(staff)).body.meta.total).toBe(inRange.body.meta.total);

      expect((await request(app).get('/api/requests?sort=purpose').set(staff)).status).toBe(400);
      expect((await request(app).get('/api/requests?status=BOGUS').set(staff)).status).toBe(400);
      expect((await request(app).get('/api/requests?sort=expectedReturnDate&order=asc').set(staff)).status).toBe(200);
    });
  });

  describe('11. overdue filter', () => {
    it('returns only ALLOCATED / RETURN_PENDING with a past expected return date', async () => {
      const allocated = await requestInState(RequestStatus.ALLOCATED, employee, staff);
      const returning = await requestInState(RequestStatus.RETURN_PENDING, employee, staff);
      const approvedPast = await requestInState(RequestStatus.APPROVED, employee, staff);
      const allocatedFuture = await requestInState(RequestStatus.ALLOCATED, employee, staff);
      const repo = AppDataSource.getRepository(AssetRequest);
      const yesterday = isoDaysFromNow(-1);
      for (const id of [allocated.id, returning.id, approvedPast.id]) {
        await repo.update({ id }, { requestedFrom: isoDaysFromNow(-5), expectedReturnDate: yesterday });
      }

      const res = await request(app).get('/api/requests?overdue=true&limit=100').set(staff);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).toEqual(expect.arrayContaining([allocated.id, returning.id]));
      expect(ids).not.toContain(approvedPast.id);
      expect(ids).not.toContain(allocatedFuture.id);
      expect(res.body.data.every((r: { isOverdue: boolean }) => r.isOverdue)).toBe(true);

      const detail = await request(app).get(`/api/requests/${allocated.id}`).set(employee);
      expect(detail.body.data.isOverdue).toBe(true);
    });
  });

  describe('12. DAMAGED return', () => {
    it('moves the asset to UNDER_MAINTENANCE (never AVAILABLE) and blocks new requests', async () => {
      const { asset, id } = await requestInState(RequestStatus.RETURN_PENDING, employee, staff);
      const res = await act(staff, id, 'complete', { returnCondition: 'DAMAGED', returnNotes: 'Cracked screen' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'COMPLETED', returnCondition: 'DAMAGED' });
      expect(await assetStatus(asset.id)).toEqual({ status: AssetStatus.UNDER_MAINTENANCE, condition: AssetCondition.DAMAGED });

      const again = await createRequest(otherEmployee, asset.id);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ASSET_NOT_AVAILABLE');

      // No OPEN maintenance record exists yet; staff opens one next.
      const staffDetail = await request(app).get(`/api/assets/${asset.id}`).set(staff);
      expect(staffDetail.body.data.recentMaintenance).toEqual([]);
      expect(staffDetail.body.data.activeRequest).toBeNull();

      const opened = await request(app).post('/api/maintenance').set(staff).send({ assetId: asset.id, type: 'REPAIR', description: 'Replace cracked screen' });
      expect(opened.status).toBe(201);
      expect(opened.body.data).toMatchObject({ status: 'OPEN', asset: { id: asset.id } });
      expect(await assetStatus(asset.id)).toMatchObject({ status: AssetStatus.UNDER_MAINTENANCE });
    });
  });
});
