import request from 'supertest';
import { createApp } from '../src/app';
import { AppDataSource } from '../src/config/data-source';
import { Asset } from '../src/entities/Asset';
import { MaintenanceRecord } from '../src/entities/MaintenanceRecord';
import { AssetCondition, AssetStatus, MaintenanceStatus, MaintenanceType, RequestStatus, UserRole } from '../src/common/enums';
import { authed } from './helpers/auth';
import { createAsset } from './helpers/factories';
import { requestInState } from './helpers/workflow';

const app = createApp();

type Headers = { Authorization: string };

async function assetState(id: string): Promise<{ status: AssetStatus; condition: AssetCondition }> {
  const asset = await AppDataSource.getRepository(Asset).findOneOrFail({ where: { id } });
  return { status: asset.status, condition: asset.condition };
}

function openMaintenance(headers: Headers, assetId: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/maintenance')
    .set(headers)
    .send({ assetId, type: 'REPAIR', description: 'Fan is rattling', ...overrides });
}

/** Opens a record through the API on a fresh AVAILABLE asset. */
async function openOnFreshAsset(headers: Headers, overrides: Record<string, unknown> = {}) {
  const asset = await createAsset();
  const res = await openMaintenance(headers, asset.id, overrides);
  expect(res.status).toBe(201);
  return { asset, id: res.body.data.id as string };
}

describe('Maintenance API', () => {
  let staff: Headers;
  let staffId: string;
  let admin: Headers;
  let employee: Headers;

  beforeAll(async () => {
    const s = await authed(UserRole.IT_STAFF);
    staff = s.headers;
    staffId = s.user.id;
    admin = (await authed(UserRole.ADMIN)).headers;
    employee = (await authed(UserRole.EMPLOYEE)).headers;
  });

  describe('1. open', () => {
    it('on an AVAILABLE asset → 201 OPEN and the asset becomes UNDER_MAINTENANCE', async () => {
      const asset = await createAsset();
      const res = await openMaintenance(staff, asset.id, { cost: 12.5 });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        status: 'OPEN',
        type: 'REPAIR',
        description: 'Fan is rattling',
        cost: 12.5,
        completedAt: null,
        resultingCondition: null,
        asset: { id: asset.id, serialNumber: asset.serialNumber },
        createdBy: { id: staffId },
      });
      expect(res.body.data.startedAt).toBeTruthy();
      expect(await assetState(asset.id)).toMatchObject({ status: AssetStatus.UNDER_MAINTENANCE });

      // Visible on the asset detail (staff) and the per-asset history.
      const detail = await request(app).get(`/api/assets/${asset.id}`).set(admin);
      expect(detail.body.data.recentMaintenance).toHaveLength(1);
      expect(detail.body.data.recentMaintenance[0]).toMatchObject({ id: res.body.data.id, status: 'OPEN' });
      const history = await request(app).get(`/api/assets/${asset.id}/maintenance?status=OPEN`).set(staff);
      expect(history.body.data.map((m: { id: string }) => m.id)).toEqual([res.body.data.id]);
    });

    it.each([AssetStatus.RESERVED, AssetStatus.ALLOCATED, AssetStatus.RETIRED])('on a %s asset → 409 ASSET_NOT_AVAILABLE', async (status) => {
      const asset = await createAsset({ status });
      const res = await openMaintenance(staff, asset.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_NOT_AVAILABLE');
      expect(await assetState(asset.id)).toMatchObject({ status });
    });

    it('a second open on the same asset → 409 MAINTENANCE_ALREADY_OPEN', async () => {
      const { asset } = await openOnFreshAsset(staff);
      const again = await openMaintenance(admin, asset.id);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('MAINTENANCE_ALREADY_OPEN');
      expect(await AppDataSource.getRepository(MaintenanceRecord).count({ where: { assetId: asset.id } })).toBe(1);
    });

    it('after a DAMAGED return (UNDER_MAINTENANCE, no OPEN record) → 201', async () => {
      const asset = await createAsset();
      const requestId = await requestInState(app, asset.id, RequestStatus.ALLOCATED, employee, staff);
      const completed = await request(app).post(`/api/requests/${requestId}/complete`).set(staff).send({ returnCondition: 'DAMAGED' });
      expect(completed.status).toBe(200);
      expect(await assetState(asset.id)).toEqual({ status: AssetStatus.UNDER_MAINTENANCE, condition: AssetCondition.DAMAGED });

      const res = await openMaintenance(staff, asset.id, { description: 'Screen cracked on return' });
      expect(res.status).toBe(201);
      expect(await assetState(asset.id)).toMatchObject({ status: AssetStatus.UNDER_MAINTENANCE });
    });

    it('unknown asset → 404; validation: short description, bad type, negative cost, unknown field → 400', async () => {
      const missing = await openMaintenance(staff, '00000000-0000-4000-8000-000000000000');
      expect(missing.status).toBe(404);

      const asset = await createAsset();
      for (const body of [{ description: 'abc' }, { type: 'PAINT' }, { cost: -1 }, { status: 'COMPLETED' }]) {
        const res = await openMaintenance(staff, asset.id, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await assetState(asset.id)).toMatchObject({ status: AssetStatus.AVAILABLE });
    });

    it('the partial unique index rejects a second OPEN record inserted directly', async () => {
      const { asset } = await openOnFreshAsset(staff);
      const repo = AppDataSource.getRepository(MaintenanceRecord);
      await expect(
        repo.insert({ assetId: asset.id, createdById: staffId, type: MaintenanceType.CLEANING, status: MaintenanceStatus.OPEN, description: 'Direct insert' }),
      ).rejects.toMatchObject({ driverError: { code: '23505' } });
    });
  });

  describe('2. complete', () => {
    it('→ COMPLETED; asset AVAILABLE with the resulting condition; cost recorded', async () => {
      const { asset, id } = await openOnFreshAsset(staff);
      const res = await request(app).post(`/api/maintenance/${id}/complete`).set(admin).send({ resultingCondition: 'FAIR', cost: 99.99 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'COMPLETED', resultingCondition: 'FAIR', cost: 99.99 });
      expect(res.body.data.completedAt).toBeTruthy();
      expect(await assetState(asset.id)).toEqual({ status: AssetStatus.AVAILABLE, condition: AssetCondition.FAIR });
    });

    it('with retire=true → asset RETIRED', async () => {
      const { asset, id } = await openOnFreshAsset(staff);
      const res = await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'DAMAGED', retire: true });
      expect(res.status).toBe(200);
      expect(await assetState(asset.id)).toEqual({ status: AssetStatus.RETIRED, condition: AssetCondition.DAMAGED });
      // Retired units are hidden from employees.
      const asEmployee = await request(app).get(`/api/assets/${asset.id}`).set(employee);
      expect(asEmployee.status).toBe(404);
    });

    it('accepts an explicit completedAt between startedAt and now; rejects earlier or future values', async () => {
      const { id } = await openOnFreshAsset(staff);
      const past = new Date(Date.now() - 3_600_000).toISOString();
      const future = new Date(Date.now() + 3_600_000).toISOString();

      const early = await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'GOOD', completedAt: past });
      expect(early.status).toBe(400);
      expect(early.body.error.details[0].path).toBe('completedAt');

      const late = await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'GOOD', completedAt: future });
      expect(late.status).toBe(400);

      const now = new Date().toISOString();
      const ok = await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'GOOD', completedAt: now });
      expect(ok.status).toBe(200);
      expect(new Date(ok.body.data.completedAt).toISOString()).toBe(now);
    });

    it('twice → 409 INVALID_STATE_TRANSITION; bad condition → 400; unknown id → 404', async () => {
      const { id } = await openOnFreshAsset(staff);
      expect((await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'GOOD' })).status).toBe(200);

      const again = await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'GOOD' });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION');

      const bad = await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'BROKEN' });
      expect(bad.status).toBe(400);

      const missing = await request(app).post('/api/maintenance/00000000-0000-4000-8000-000000000000/complete').set(staff).send({ resultingCondition: 'GOOD' });
      expect(missing.status).toBe(404);
    });
  });

  describe('3. delete and edit', () => {
    it('delete OPEN → 204 and the asset is AVAILABLE again', async () => {
      const { asset, id } = await openOnFreshAsset(staff);
      const res = await request(app).delete(`/api/maintenance/${id}`).set(staff);
      expect(res.status).toBe(204);
      expect(await assetState(asset.id)).toMatchObject({ status: AssetStatus.AVAILABLE });
      expect((await request(app).get(`/api/maintenance/${id}`).set(staff)).status).toBe(404);
    });

    it('delete COMPLETED → 409 RECORD_IMMUTABLE', async () => {
      const { id } = await openOnFreshAsset(staff);
      expect((await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'GOOD' })).status).toBe(200);
      const res = await request(app).delete(`/api/maintenance/${id}`).set(admin);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RECORD_IMMUTABLE');
    });

    it('PATCH edits description / cost / type on OPEN and COMPLETED records; status and dates are rejected', async () => {
      const { id } = await openOnFreshAsset(staff);
      const edited = await request(app).patch(`/api/maintenance/${id}`).set(staff).send({ description: 'Fan replaced, bearings noisy', type: 'UPGRADE', cost: 40 });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ description: 'Fan replaced, bearings noisy', type: 'UPGRADE', cost: 40, status: 'OPEN' });

      expect((await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'GOOD' })).status).toBe(200);
      const afterComplete = await request(app).patch(`/api/maintenance/${id}`).set(staff).send({ cost: null });
      expect(afterComplete.status).toBe(200);
      expect(afterComplete.body.data).toMatchObject({ cost: null, status: 'COMPLETED' });

      for (const body of [{ status: 'OPEN' }, { completedAt: null }, {}]) {
        const res = await request(app).patch(`/api/maintenance/${id}`).set(staff).send(body);
        expect(res.status).toBe(400);
      }
    });

    it('retire is blocked while a record is OPEN and allowed after it is deleted', async () => {
      const { asset, id } = await openOnFreshAsset(staff);
      const blocked = await request(app).post(`/api/assets/${asset.id}/retire`).set(staff);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('INVALID_STATE_TRANSITION');

      expect((await request(app).delete(`/api/maintenance/${id}`).set(staff)).status).toBe(204);
      expect((await request(app).post(`/api/assets/${asset.id}/retire`).set(staff)).status).toBe(200);
    });
  });

  describe('4. requests while under maintenance', () => {
    it('an employee cannot request the asset until maintenance completes', async () => {
      const { asset, id } = await openOnFreshAsset(staff);
      const blocked = await request(app)
        .post('/api/requests')
        .set(employee)
        .send({ assetId: asset.id, purpose: 'Need it now', requestedFrom: new Date().toISOString().slice(0, 10), expectedReturnDate: new Date().toISOString().slice(0, 10) });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('ASSET_NOT_AVAILABLE');

      // Employees see the unit as UNDER_MAINTENANCE (not hidden) in the list.
      const list = await request(app).get(`/api/assets?search=${encodeURIComponent(asset.serialNumber)}`).set(employee);
      expect(list.body.data.map((a: { id: string; status: string }) => [a.id, a.status])).toEqual([[asset.id, 'UNDER_MAINTENANCE']]);

      expect((await request(app).post(`/api/maintenance/${id}/complete`).set(staff).send({ resultingCondition: 'GOOD' })).status).toBe(200);
      const allowed = await request(app)
        .post('/api/requests')
        .set(employee)
        .send({ assetId: asset.id, purpose: 'Need it now', requestedFrom: new Date().toISOString().slice(0, 10), expectedReturnDate: new Date().toISOString().slice(0, 10) });
      expect(allowed.status).toBe(201);
    });
  });

  describe('5. employees', () => {
    it('get 403 on every maintenance route', async () => {
      const { asset, id } = await openOnFreshAsset(staff);
      const calls = [
        request(app).get('/api/maintenance').set(employee),
        request(app).post('/api/maintenance').set(employee).send({ assetId: asset.id, type: 'REPAIR', description: 'Fan is rattling' }),
        request(app).get(`/api/maintenance/${id}`).set(employee),
        request(app).patch(`/api/maintenance/${id}`).set(employee).send({ description: 'Fan is rattling louder' }),
        request(app).post(`/api/maintenance/${id}/complete`).set(employee).send({ resultingCondition: 'GOOD' }),
        request(app).delete(`/api/maintenance/${id}`).set(employee),
        request(app).get(`/api/assets/${asset.id}/maintenance`).set(employee),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
      // Employees also never receive recentMaintenance on the asset detail.
      const detail = await request(app).get(`/api/assets/${asset.id}`).set(employee);
      expect(detail.status).toBe(200);
      expect(detail.body.data.recentMaintenance).toBeUndefined();
    });
  });

  describe('6. list', () => {
    it('filters by assetId, status csv, type, startedAt range and search; sorts by whitelisted fields', async () => {
      const a = await openOnFreshAsset(staff, { type: 'CLEANING', cost: 5 });
      const b = await openOnFreshAsset(staff, { type: 'INSPECTION', cost: 50 });
      expect((await request(app).post(`/api/maintenance/${b.id}/complete`).set(staff).send({ resultingCondition: 'GOOD' })).status).toBe(200);

      const byAsset = await request(app).get(`/api/maintenance?assetId=${a.asset.id}`).set(staff);
      expect(byAsset.status).toBe(200);
      expect(byAsset.body.data.map((m: { id: string }) => m.id)).toEqual([a.id]);
      expect(byAsset.body.meta).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });

      const completedOnly = await request(app).get('/api/maintenance?status=COMPLETED').set(admin);
      expect(completedOnly.body.data.every((m: { status: string }) => m.status === 'COMPLETED')).toBe(true);
      expect(completedOnly.body.data.some((m: { id: string }) => m.id === b.id)).toBe(true);

      const byType = await request(app).get('/api/maintenance?type=CLEANING,INSPECTION').set(staff);
      const ids = byType.body.data.map((m: { id: string }) => m.id);
      expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));

      const bySearch = await request(app).get(`/api/maintenance?search=${encodeURIComponent(b.asset.serialNumber)}`).set(staff);
      expect(bySearch.body.data.map((m: { id: string }) => m.id)).toEqual([b.id]);

      const today = new Date().toISOString().slice(0, 10);
      const inRange = await request(app).get(`/api/maintenance?from=${today}&to=${today}&assetId=${b.asset.id}`).set(staff);
      expect(inRange.body.data).toHaveLength(1);
      const outOfRange = await request(app).get(`/api/maintenance?from=2000-01-01&to=2000-01-02`).set(staff);
      expect(outOfRange.body.data).toHaveLength(0);

      const byCost = await request(app).get('/api/maintenance?sort=cost&order=asc&type=CLEANING,INSPECTION').set(staff);
      const costs = byCost.body.data.map((m: { cost: number | null }) => m.cost).filter((c: number | null) => c !== null);
      expect(costs).toEqual([...costs].sort((x: number, y: number) => x - y));

      const badSort = await request(app).get('/api/maintenance?sort=description').set(staff);
      expect(badSort.status).toBe(400);
      const badRange = await request(app).get('/api/maintenance?from=2026-02-01&to=2026-01-01').set(staff);
      expect(badRange.status).toBe(400);
    });
  });
});
