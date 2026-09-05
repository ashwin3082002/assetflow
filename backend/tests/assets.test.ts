import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app';
import { AppDataSource } from '../src/config/data-source';
import { assetImageDir } from '../src/config/uploads';
import { AssetCondition, AssetStatus, MaintenanceStatus, MaintenanceType, RequestStatus, UserRole } from '../src/common/enums';
import { Asset } from '../src/entities/Asset';
import { AssetRequest } from '../src/entities/AssetRequest';
import { MaintenanceRecord } from '../src/entities/MaintenanceRecord';
import { Review } from '../src/entities/Review';
import { authed, createUser } from './helpers/auth';
import { createAsset, createCategory, PNG_BYTES } from './helpers/factories';
import { truncateAll } from './helpers/db';

const app = createApp();

function validBody(categoryId: string, extra: Record<string, unknown> = {}) {
  return {
    name: 'Dell Latitude',
    description: 'Business laptop',
    serialNumber: `SER-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    categoryId,
    ...extra,
  };
}

describe('POST /api/assets', () => {
  it('IT_STAFF creates without managedById → managed by self, status AVAILABLE', async () => {
    const { user, headers } = await authed(UserRole.IT_STAFF);
    const category = await createCategory();
    const res = await request(app).post('/api/assets').set(headers).send(validBody(category.id, { purchaseDate: '2024-01-15', maxLoanDays: 30 }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'AVAILABLE',
      condition: 'GOOD',
      managedBy: { id: user.id },
      category: { id: category.id, name: category.name },
      purchaseDate: '2024-01-15',
      maxLoanDays: 30,
      avgRating: null,
      reviewCount: 0,
    });
  });

  it('ADMIN must supply managedById; it must be an active IT_STAFF', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const category = await createCategory();
    const missing = await request(app).post('/api/assets').set(headers).send(validBody(category.id));
    expect(missing.status).toBe(400);
    expect(missing.body.error.details[0].path).toBe('managedById');

    const employee = await createUser(UserRole.EMPLOYEE);
    const wrongRole = await request(app).post('/api/assets').set(headers).send(validBody(category.id, { managedById: employee.id }));
    expect(wrongRole.status).toBe(400);
    expect(wrongRole.body.error.code).toBe('INVALID_MANAGER');

    const inactive = await createUser(UserRole.IT_STAFF, { isActive: false });
    expect((await request(app).post('/api/assets').set(headers).send(validBody(category.id, { managedById: inactive.id }))).body.error.code).toBe('INVALID_MANAGER');

    const staff = await createUser(UserRole.IT_STAFF);
    const ok = await request(app).post('/api/assets').set(headers).send(validBody(category.id, { managedById: staff.id }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.managedBy.id).toBe(staff.id);
  });

  it('rejects duplicate serial (409), unknown category (404), status in body, future purchase date, bad maxLoanDays', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    const category = await createCategory();
    const existing = await createAsset();
    const dup = await request(app).post('/api/assets').set(headers).send(validBody(category.id, { serialNumber: existing.serialNumber }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('SERIAL_NUMBER_TAKEN');

    expect((await request(app).post('/api/assets').set(headers).send(validBody('00000000-0000-4000-8000-000000000000'))).status).toBe(404);
    expect((await request(app).post('/api/assets').set(headers).send(validBody(category.id, { status: 'RETIRED' }))).status).toBe(400);
    expect((await request(app).post('/api/assets').set(headers).send(validBody(category.id, { purchaseDate: '2999-01-01' }))).status).toBe(400);
    expect((await request(app).post('/api/assets').set(headers).send(validBody(category.id, { maxLoanDays: 0 }))).status).toBe(400);
    expect((await request(app).post('/api/assets').set(headers).send(validBody(category.id, { purchaseDate: '2024-02-30' }))).status).toBe(400);
  });

  it('EMPLOYEE cannot create (403)', async () => {
    const { headers } = await authed(UserRole.EMPLOYEE);
    const category = await createCategory();
    expect((await request(app).post('/api/assets').set(headers).send(validBody(category.id))).status).toBe(403);
  });
});

describe('PATCH /api/assets/:id', () => {
  it('updates fields; rejects status; enforces serial uniqueness', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    const asset = await createAsset();
    const other = await createAsset();

    const ok = await request(app).patch(`/api/assets/${asset.id}`).set(headers).send({ name: 'Renamed', location: 'Room 1', condition: 'FAIR', maxLoanDays: null });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ name: 'Renamed', location: 'Room 1', condition: 'FAIR', maxLoanDays: null });

    expect((await request(app).patch(`/api/assets/${asset.id}`).set(headers).send({ status: 'RETIRED' })).status).toBe(400);
    expect((await request(app).patch(`/api/assets/${asset.id}`).set(headers).send({})).status).toBe(400);

    const clash = await request(app).patch(`/api/assets/${asset.id}`).set(headers).send({ serialNumber: other.serialNumber });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SERIAL_NUMBER_TAKEN');

    const same = await request(app).patch(`/api/assets/${asset.id}`).set(headers).send({ serialNumber: asset.serialNumber });
    expect(same.status).toBe(200);
  });
});

describe('image upload', () => {
  it('uploads png, serves it, replaces (old file removed) and deletes', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    const asset = await createAsset();

    const up1 = await request(app).post(`/api/assets/${asset.id}/image`).set(headers).attach('image', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });
    expect(up1.status).toBe(200);
    const url1: string = up1.body.data.imageUrl;
    expect(url1).toMatch(/^\/uploads\/assets\/[0-9a-f-]{36}\.png$/);
    const file1 = path.join(assetImageDir, path.basename(url1));
    expect(fs.existsSync(file1)).toBe(true);

    const served = await request(app).get(url1);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');

    const up2 = await request(app).post(`/api/assets/${asset.id}/image`).set(headers).attach('image', PNG_BYTES, { filename: 'photo2.png', contentType: 'image/png' });
    expect(up2.status).toBe(200);
    expect(up2.body.data.imageUrl).not.toBe(url1);
    expect(fs.existsSync(file1)).toBe(false);
    const file2 = path.join(assetImageDir, path.basename(up2.body.data.imageUrl));
    expect(fs.existsSync(file2)).toBe(true);

    const del = await request(app).delete(`/api/assets/${asset.id}/image`).set(headers);
    expect(del.status).toBe(200);
    expect(del.body.data.imageUrl).toBeNull();
    expect(fs.existsSync(file2)).toBe(false);
  });

  it('rejects wrong type, oversized file and missing file with 400 INVALID_FILE', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    const asset = await createAsset();
    const txt = await request(app).post(`/api/assets/${asset.id}/image`).set(headers).attach('image', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(txt.status).toBe(400);
    expect(txt.body.error.code).toBe('INVALID_FILE');

    const big = await request(app).post(`/api/assets/${asset.id}/image`).set(headers).attach('image', Buffer.alloc(3 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' });
    expect(big.status).toBe(400);
    expect(big.body.error.code).toBe('INVALID_FILE');

    const none = await request(app).post(`/api/assets/${asset.id}/image`).set(headers);
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('INVALID_FILE');

    const files = fs.readdirSync(assetImageDir);
    expect(files.some((f) => f.endsWith('.txt'))).toBe(false);
  });

  it('EMPLOYEE cannot upload (403) and retired assets reject uploads (400 ASSET_RETIRED)', async () => {
    const emp = await authed(UserRole.EMPLOYEE);
    const staff = await authed(UserRole.IT_STAFF);
    const asset = await createAsset({ status: AssetStatus.RETIRED });
    expect((await request(app).post(`/api/assets/${asset.id}/image`).set(emp.headers).attach('image', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })).status).toBe(403);
    const res = await request(app).post(`/api/assets/${asset.id}/image`).set(staff.headers).attach('image', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ASSET_RETIRED');
    // Removing the image is an update too (business-rules §3.4).
    const del = await request(app).delete(`/api/assets/${asset.id}/image`).set(staff.headers);
    expect(del.status).toBe(400);
    expect(del.body.error.code).toBe('ASSET_RETIRED');
  });
});

describe('GET /api/assets (search / filter / sort / pagination)', () => {
  const ids: Record<string, string> = {};
  let categoryA: string;
  let categoryB: string;
  let staffId: string;

  beforeAll(async () => {
    await truncateAll();
    const staff = await createUser(UserRole.IT_STAFF);
    staffId = staff.id;
    const catA = await createCategory({ name: 'Laptop' });
    const catB = await createCategory({ name: 'Monitor' });
    categoryA = catA.id;
    categoryB = catB.id;
    ids.laptopOld = (await createAsset({ manager: staff, category: catA, name: 'Alpha Laptop', description: 'Old machine', serialNumber: 'ZZ-0001', purchaseDate: '2021-01-01', condition: AssetCondition.POOR })).id;
    ids.laptopNew = (await createAsset({ manager: staff, category: catA, name: 'Beta Laptop', description: 'Shiny device', serialNumber: 'AA-0002', purchaseDate: '2025-06-01', condition: AssetCondition.NEW })).id;
    ids.monitorAllocated = (await createAsset({ category: catB, name: 'Gamma Monitor', description: 'Wide screen', serialNumber: 'MM-0003', purchaseDate: '2023-03-03', status: AssetStatus.ALLOCATED })).id;
    ids.monitorRetired = (await createAsset({ category: catB, name: 'Delta Monitor', description: 'Broken', serialNumber: 'MM-0004', status: AssetStatus.RETIRED })).id;
    ids.noDate = (await createAsset({ category: catB, name: 'Epsilon Dock', description: 'Dock', serialNumber: 'DK-0005', purchaseDate: null, status: AssetStatus.UNDER_MAINTENANCE })).id;
  });

  const names = (res: request.Response) => res.body.data.map((a: { name: string }) => a.name);

  it('keyword search matches name, description and serial number', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    expect(names(await request(app).get('/api/assets').set(headers).query({ search: 'laptop' })).sort()).toEqual(['Alpha Laptop', 'Beta Laptop']);
    expect(names(await request(app).get('/api/assets').set(headers).query({ search: 'shiny' }))).toEqual(['Beta Laptop']);
    expect(names(await request(app).get('/api/assets').set(headers).query({ search: 'mm-000' })).sort()).toEqual(['Delta Monitor', 'Gamma Monitor']);
  });

  it('filters by category, status csv, condition, managedBy, date range and availableOnly', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    expect(names(await request(app).get('/api/assets').set(headers).query({ categoryId: categoryB })).sort()).toEqual(['Delta Monitor', 'Epsilon Dock', 'Gamma Monitor']);
    expect(names(await request(app).get('/api/assets').set(headers).query({ status: 'ALLOCATED,RETIRED' })).sort()).toEqual(['Delta Monitor', 'Gamma Monitor']);
    expect(names(await request(app).get('/api/assets').set(headers).query({ condition: 'NEW' }))).toEqual(['Beta Laptop']);
    expect(names(await request(app).get('/api/assets').set(headers).query({ managedById: staffId })).sort()).toEqual(['Alpha Laptop', 'Beta Laptop']);
    expect(names(await request(app).get('/api/assets').set(headers).query({ purchasedFrom: '2022-01-01', purchasedTo: '2024-12-31' }))).toEqual(['Gamma Monitor']);
    expect(names(await request(app).get('/api/assets').set(headers).query({ availableOnly: 'true' })).sort()).toEqual(['Alpha Laptop', 'Beta Laptop']);
    expect((await request(app).get('/api/assets').set(headers).query({ categoryId: categoryA, condition: 'POOR' })).body.data).toHaveLength(1);
  });

  it('sorts with a whitelist and paginates with meta', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    expect(names(await request(app).get('/api/assets').set(headers).query({ sort: 'name', order: 'asc' }))).toEqual(['Alpha Laptop', 'Beta Laptop', 'Delta Monitor', 'Epsilon Dock', 'Gamma Monitor']);
    const byDate = await request(app).get('/api/assets').set(headers).query({ sort: 'purchaseDate', order: 'desc' });
    expect(names(byDate).slice(0, 3)).toEqual(['Beta Laptop', 'Gamma Monitor', 'Alpha Laptop']);
    expect(names(byDate).slice(3).sort()).toEqual(['Delta Monitor', 'Epsilon Dock']); // NULLS LAST (both undated)

    const page1 = await request(app).get('/api/assets').set(headers).query({ sort: 'name', order: 'asc', page: 1, limit: 2 });
    const page3 = await request(app).get('/api/assets').set(headers).query({ sort: 'name', order: 'asc', page: 3, limit: 2 });
    expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    expect(names(page1)).toEqual(['Alpha Laptop', 'Beta Laptop']);
    expect(names(page3)).toEqual(['Gamma Monitor']);

    expect((await request(app).get('/api/assets').set(headers).query({ sort: 'serialNumber' })).status).toBe(400);
    expect((await request(app).get('/api/assets').set(headers).query({ limit: 101 })).status).toBe(400);
    expect((await request(app).get('/api/assets').set(headers).query({ status: 'BOGUS' })).status).toBe(400);
    expect((await request(app).get('/api/assets').set(headers).query({ purchasedFrom: '2025-01-01', purchasedTo: '2024-01-01' })).status).toBe(400);
  });

  it('EMPLOYEE never sees RETIRED assets in list or detail, and gets no staff-only sections', async () => {
    const { headers } = await authed(UserRole.EMPLOYEE);
    const all = await request(app).get('/api/assets').set(headers);
    expect(all.body.meta.total).toBe(4);
    expect(names(all)).not.toContain('Delta Monitor');
    const onlyRetired = await request(app).get('/api/assets').set(headers).query({ status: 'RETIRED' });
    expect(onlyRetired.body.data).toEqual([]);
    const mixed = await request(app).get('/api/assets').set(headers).query({ status: 'RETIRED,ALLOCATED' });
    expect(names(mixed)).toEqual(['Gamma Monitor']);

    expect((await request(app).get(`/api/assets/${ids.monitorRetired}`).set(headers)).status).toBe(404);
    const detail = await request(app).get(`/api/assets/${ids.monitorAllocated}`).set(headers);
    expect(detail.status).toBe(200);
    expect(detail.body.data.activeRequest).toBeUndefined();
    expect(detail.body.data.recentMaintenance).toBeUndefined();
  });

  it('staff detail includes activeRequest, recentMaintenance and ratings', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    const employee = await createUser(UserRole.EMPLOYEE);
    const req = await AppDataSource.getRepository(AssetRequest).save({
      assetId: ids.monitorAllocated,
      requesterId: employee.id,
      status: RequestStatus.ALLOCATED,
      purpose: 'Testing',
      requestedFrom: '2020-01-01',
      expectedReturnDate: '2020-02-01',
    });
    await AppDataSource.getRepository(MaintenanceRecord).save({
      assetId: ids.monitorAllocated,
      createdById: staffId,
      type: MaintenanceType.INSPECTION,
      status: MaintenanceStatus.COMPLETED,
      description: 'Checked',
      completedAt: new Date(),
      cost: '12.50',
    });
    await AppDataSource.getRepository(Review).save({ requestId: req.id, assetId: ids.monitorAllocated, reviewerId: employee.id, rating: 4, comment: 'Nice' });

    const detail = await request(app).get(`/api/assets/${ids.monitorAllocated}`).set(headers);
    expect(detail.status).toBe(200);
    expect(detail.body.data.activeRequest).toMatchObject({ id: req.id, status: 'ALLOCATED', isOverdue: true, requester: { id: employee.id } });
    expect(detail.body.data.recentMaintenance).toHaveLength(1);
    expect(detail.body.data.recentMaintenance[0]).toMatchObject({ type: 'INSPECTION', cost: 12.5 });
    expect(detail.body.data).toMatchObject({ avgRating: 4, reviewCount: 1 });

    const list = await request(app).get('/api/assets').set(headers).query({ search: 'Gamma' });
    expect(list.body.data[0]).toMatchObject({ avgRating: 4, reviewCount: 1 });

    const reqs = await request(app).get(`/api/assets/${ids.monitorAllocated}/requests`).set(headers);
    expect(reqs.body.data).toHaveLength(1);
    const maint = await request(app).get(`/api/assets/${ids.monitorAllocated}/maintenance`).set(headers);
    expect(maint.body.data).toHaveLength(1);
    const reviews = await request(app).get(`/api/assets/${ids.monitorAllocated}/reviews`).set(headers);
    expect(reviews.body.summary).toEqual({ avgRating: 4, reviewCount: 1 });
    expect(reviews.body.data[0]).toMatchObject({ rating: 4, reviewer: { id: employee.id } });

    const emp = await authed(UserRole.EMPLOYEE);
    expect((await request(app).get(`/api/assets/${ids.monitorAllocated}/requests`).set(emp.headers)).status).toBe(403);
    expect((await request(app).get(`/api/assets/${ids.monitorAllocated}/reviews`).set(emp.headers)).status).toBe(200);
  });

  it('history lists validate status as an enum and honour order (400 on junk, never 500)', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    const asset = await createAsset();
    for (const path of ['requests', 'maintenance']) {
      const bad = await request(app).get(`/api/assets/${asset.id}/${path}?status=BOGUS`).set(headers);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await request(app).get(`/api/assets/${asset.id}/reviews?status=OPEN`).set(headers)).status).toBe(400);
    expect((await request(app).get(`/api/assets/${asset.id}/requests?status=PENDING&order=asc`).set(headers)).status).toBe(200);
    expect((await request(app).get(`/api/assets/${asset.id}/maintenance?status=OPEN&order=asc`).set(headers)).status).toBe(200);
    expect((await request(app).get(`/api/assets/${asset.id}/reviews?order=asc&limit=5`).set(headers)).status).toBe(200);
  });
});

describe('retire and delete', () => {
  it('retire from AVAILABLE ok; from ALLOCATED/RESERVED → 409; UNDER_MAINTENANCE only without OPEN record', async () => {
    const { user, headers } = await authed(UserRole.IT_STAFF);
    const available = await createAsset();
    const retired = await request(app).post(`/api/assets/${available.id}/retire`).set(headers);
    expect(retired.status).toBe(200);
    expect(retired.body.data.status).toBe('RETIRED');
    expect((await request(app).post(`/api/assets/${available.id}/retire`).set(headers)).status).toBe(409);

    for (const status of [AssetStatus.ALLOCATED, AssetStatus.RESERVED]) {
      const a = await createAsset({ status });
      const res = await request(app).post(`/api/assets/${a.id}/retire`).set(headers);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    }

    const inMaint = await createAsset({ status: AssetStatus.UNDER_MAINTENANCE });
    await AppDataSource.getRepository(MaintenanceRecord).save({ assetId: inMaint.id, createdById: user.id, type: MaintenanceType.REPAIR, status: MaintenanceStatus.OPEN, description: 'Fixing' });
    expect((await request(app).post(`/api/assets/${inMaint.id}/retire`).set(headers)).status).toBe(409);
    await AppDataSource.getRepository(MaintenanceRecord).update({ assetId: inMaint.id }, { status: MaintenanceStatus.COMPLETED, completedAt: new Date() });
    expect((await request(app).post(`/api/assets/${inMaint.id}/retire`).set(headers)).status).toBe(200);
  });

  it('delete: 204 for a clean asset (file removed); 409 ASSET_HAS_HISTORY otherwise', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    const clean = await createAsset();
    await request(app).post(`/api/assets/${clean.id}/image`).set(headers).attach('image', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });
    const withImage = await AppDataSource.getRepository(Asset).findOneByOrFail({ id: clean.id });
    const file = path.join(assetImageDir, path.basename(withImage.imageUrl!));
    expect(fs.existsSync(file)).toBe(true);

    expect((await request(app).delete(`/api/assets/${clean.id}`).set(headers)).status).toBe(204);
    expect(fs.existsSync(file)).toBe(false);
    expect((await request(app).get(`/api/assets/${clean.id}`).set(headers)).status).toBe(404);

    const employee = await createUser(UserRole.EMPLOYEE);
    const withHistory = await createAsset();
    await AppDataSource.getRepository(AssetRequest).save({ assetId: withHistory.id, requesterId: employee.id, status: RequestStatus.CANCELLED, purpose: 'x', requestedFrom: '2024-01-01', expectedReturnDate: '2024-01-02' });
    const res = await request(app).delete(`/api/assets/${withHistory.id}`).set(headers);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ASSET_HAS_HISTORY');

    const emp = await authed(UserRole.EMPLOYEE);
    expect((await request(app).delete(`/api/assets/${withHistory.id}`).set(emp.headers)).status).toBe(403);
  });
});
