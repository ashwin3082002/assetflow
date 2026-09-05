import request from 'supertest';
import { createApp } from '../src/app';
import { UserRole } from '../src/common/enums';
import { AppDataSource } from '../src/config/data-source';
import { Category } from '../src/entities/Category';
import { Asset } from '../src/entities/Asset';
import { authed, createUser, TEST_PASSWORD } from './helpers/auth';

const app = createApp();

describe('POST /api/users', () => {
  it('admin creates an IT_STAFF user who can then log in', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const res = await request(app)
      .post('/api/users')
      .set(headers)
      .send({ fullName: 'Staff Member', email: 'staff.member@test.dev', password: 'Secret123', role: 'IT_STAFF', department: 'IT' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ role: 'IT_STAFF', email: 'staff.member@test.dev', isActive: true });
    expect(res.body.data.passwordHash).toBeUndefined();

    const login = await request(app).post('/api/auth/login').send({ email: 'staff.member@test.dev', password: 'Secret123' });
    expect(login.status).toBe(200);
  });

  it('IT_STAFF and EMPLOYEE cannot create users (403)', async () => {
    const body = { fullName: 'Nope', email: 'nope@test.dev', password: 'Secret123', role: 'EMPLOYEE' };
    const staff = await authed(UserRole.IT_STAFF);
    const emp = await authed(UserRole.EMPLOYEE);
    expect((await request(app).post('/api/users').set(staff.headers).send(body)).status).toBe(403);
    expect((await request(app).post('/api/users').set(emp.headers).send(body)).status).toBe(403);
  });

  it('rejects duplicate email with 409 and invalid role with 400', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const existing = await createUser(UserRole.EMPLOYEE);
    const dup = await request(app)
      .post('/api/users')
      .set(headers)
      .send({ fullName: 'Dup', email: existing.email, password: 'Secret123', role: 'EMPLOYEE' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const bad = await request(app)
      .post('/api/users')
      .set(headers)
      .send({ fullName: 'Bad', email: 'bad@test.dev', password: 'Secret123', role: 'SUPERUSER' });
    expect(bad.status).toBe(400);
  });
});

describe('GET /api/users', () => {
  it('admin lists everyone with filters, search, sorting and pagination', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    await createUser(UserRole.IT_STAFF, { fullName: 'Zed Findable' });
    await createUser(UserRole.EMPLOYEE, { fullName: 'Amy Findable', isActive: false });

    const all = await request(app).get('/api/users').set(headers).query({ limit: 100 });
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ page: 1, limit: 100 });
    expect(all.body.meta.total).toBeGreaterThanOrEqual(3);

    const inactive = await request(app).get('/api/users').set(headers).query({ isActive: 'false' });
    expect(inactive.body.data.every((u: { isActive: boolean }) => u.isActive === false)).toBe(true);

    const search = await request(app).get('/api/users').set(headers).query({ search: 'findable', sort: 'fullName', order: 'asc' });
    expect(search.body.data.map((u: { fullName: string }) => u.fullName)).toEqual(['Amy Findable', 'Zed Findable']);

    const paged = await request(app).get('/api/users').set(headers).query({ page: 1, limit: 2 });
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta.totalPages).toBe(Math.ceil(paged.body.meta.total / 2));
  });

  it('rejects unknown sort fields and out-of-range limit', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    expect((await request(app).get('/api/users').set(headers).query({ sort: 'passwordHash' })).status).toBe(400);
    expect((await request(app).get('/api/users').set(headers).query({ limit: 101 })).status).toBe(400);
  });

  it('IT_STAFF only sees active IT_STAFF regardless of filters', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    await createUser(UserRole.ADMIN);
    await createUser(UserRole.EMPLOYEE);
    await createUser(UserRole.IT_STAFF, { isActive: false });

    const res = await request(app).get('/api/users').set(headers).query({ role: 'EMPLOYEE', isActive: 'false', limit: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((u: { role: string; isActive: boolean }) => u.role === 'IT_STAFF' && u.isActive)).toBe(true);
  });

  it('EMPLOYEE gets 403', async () => {
    const { headers } = await authed(UserRole.EMPLOYEE);
    expect((await request(app).get('/api/users').set(headers)).status).toBe(403);
  });
});

describe('GET /api/users/:id', () => {
  it('returns the user with counts; 404 for unknown; 400 for non-uuid', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const target = await createUser(UserRole.EMPLOYEE);
    const res = await request(app).get(`/api/users/${target.id}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: target.id, managedAssetCount: 0, activeRequestCount: 0 });

    expect((await request(app).get('/api/users/00000000-0000-4000-8000-000000000000').set(headers)).status).toBe(404);
    expect((await request(app).get('/api/users/not-a-uuid').set(headers)).status).toBe(400);
  });

  it('IT_STAFF cannot view a user by id (403)', async () => {
    const { headers } = await authed(UserRole.IT_STAFF);
    const target = await createUser(UserRole.EMPLOYEE);
    expect((await request(app).get(`/api/users/${target.id}`).set(headers)).status).toBe(403);
  });
});

describe('PATCH /api/users/:id', () => {
  it('admin updates name, department, role and isActive', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const target = await createUser(UserRole.EMPLOYEE);
    const res = await request(app)
      .patch(`/api/users/${target.id}`)
      .set(headers)
      .send({ fullName: 'Renamed', department: 'Ops', role: 'IT_STAFF', isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fullName: 'Renamed', department: 'Ops', role: 'IT_STAFF', isActive: false });
    expect(res.body.warnings).toBeUndefined();

    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    expect(login.status).toBe(403);
  });

  it('admin cannot change own role or deactivate self (400 SELF_MODIFICATION_NOT_ALLOWED)', async () => {
    const { user, headers } = await authed(UserRole.ADMIN);
    const role = await request(app).patch(`/api/users/${user.id}`).set(headers).send({ role: 'EMPLOYEE' });
    const deact = await request(app).patch(`/api/users/${user.id}`).set(headers).send({ isActive: false });
    expect(role.status).toBe(400);
    expect(role.body.error.code).toBe('SELF_MODIFICATION_NOT_ALLOWED');
    expect(deact.status).toBe(400);
    expect(deact.body.error.code).toBe('SELF_MODIFICATION_NOT_ALLOWED');

    // Renaming self is fine.
    const rename = await request(app).patch(`/api/users/${user.id}`).set(headers).send({ fullName: 'Self Renamed' });
    expect(rename.status).toBe(200);
  });

  it('warns when demoting an IT_STAFF who manages assets', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const staff = await createUser(UserRole.IT_STAFF);
    const category = await AppDataSource.getRepository(Category).save({ name: `Cat-${Date.now()}`, description: null });
    await AppDataSource.getRepository(Asset).save({
      name: 'Laptop A',
      description: 'Test laptop',
      serialNumber: `SN-${Date.now()}`,
      categoryId: category.id,
      managedById: staff.id,
    });

    const res = await request(app).patch(`/api/users/${staff.id}`).set(headers).send({ role: 'EMPLOYEE' });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual(['manages 1 assets']);
  });

  it('rejects empty body, unknown fields and password changes via PATCH', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const target = await createUser(UserRole.EMPLOYEE);
    expect((await request(app).patch(`/api/users/${target.id}`).set(headers).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/users/${target.id}`).set(headers).send({ password: 'Newpass123' })).status).toBe(400);
    expect((await request(app).patch(`/api/users/${target.id}`).set(headers).send({ email: 'x@test.dev' })).status).toBe(400);
  });
});
