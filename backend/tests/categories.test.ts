import request from 'supertest';
import { createApp } from '../src/app';
import { UserRole } from '../src/common/enums';
import { authed } from './helpers/auth';
import { createAsset, createCategory } from './helpers/factories';

const app = createApp();

describe('categories', () => {
  it('admin creates, updates and deletes; duplicate name → 409', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const created = await request(app).post('/api/categories').set(headers).send({ name: 'Tablets', description: 'iPads etc.' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Tablets', description: 'iPads etc.', assetCount: 0 });

    const dup = await request(app).post('/api/categories').set(headers).send({ name: 'Tablets' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CATEGORY_EXISTS');

    const updated = await request(app).patch(`/api/categories/${created.body.data.id}`).set(headers).send({ description: 'Tablets and e-readers' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.description).toBe('Tablets and e-readers');

    const other = await createCategory();
    const rename = await request(app).patch(`/api/categories/${created.body.data.id}`).set(headers).send({ name: other.name });
    expect(rename.status).toBe(409);

    const del = await request(app).delete(`/api/categories/${created.body.data.id}`).set(headers);
    expect(del.status).toBe(204);
    expect((await request(app).delete(`/api/categories/${created.body.data.id}`).set(headers)).status).toBe(404);
  });

  it('delete of a category in use → 409 CATEGORY_IN_USE', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    const category = await createCategory();
    await createAsset({ category });
    const res = await request(app).delete(`/api/categories/${category.id}`).set(headers);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_IN_USE');
  });

  it('every role can list with assetCount; only admin may write', async () => {
    const category = await createCategory({ name: `Listed ${Date.now()}` });
    await createAsset({ category });
    await createAsset({ category });

    for (const role of [UserRole.ADMIN, UserRole.IT_STAFF, UserRole.EMPLOYEE]) {
      const { headers } = await authed(role);
      const res = await request(app).get('/api/categories').set(headers);
      expect(res.status).toBe(200);
      const found = res.body.data.find((c: { id: string }) => c.id === category.id);
      expect(found.assetCount).toBe(2);
    }

    const staff = await authed(UserRole.IT_STAFF);
    const emp = await authed(UserRole.EMPLOYEE);
    expect((await request(app).post('/api/categories').set(staff.headers).send({ name: 'Nope' })).status).toBe(403);
    expect((await request(app).patch(`/api/categories/${category.id}`).set(emp.headers).send({ name: 'Nope' })).status).toBe(403);
    expect((await request(app).delete(`/api/categories/${category.id}`).set(staff.headers)).status).toBe(403);
  });

  it('validates input', async () => {
    const { headers } = await authed(UserRole.ADMIN);
    expect((await request(app).post('/api/categories').set(headers).send({ name: 'X' })).status).toBe(400);
    expect((await request(app).post('/api/categories').set(headers).send({ name: 'Valid', extra: 1 })).status).toBe(400);
    expect((await request(app).patch('/api/categories/not-a-uuid').set(headers).send({ name: 'Valid' })).status).toBe(400);
  });
});
