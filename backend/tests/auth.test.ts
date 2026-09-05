import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { UserRole } from '../src/common/enums';
import { AppDataSource } from '../src/config/data-source';
import { User } from '../src/entities/User';
import { authed, bearer, createUser, TEST_PASSWORD, tokenFor } from './helpers/auth';

const app = createApp();

describe('POST /api/auth/register', () => {
  it('registers an EMPLOYEE and returns a working token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'New Person', email: 'New.Person@Test.dev', password: 'Secret123', department: 'Sales' });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ fullName: 'New Person', email: 'new.person@test.dev', role: 'EMPLOYEE', isActive: true });
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const me = await request(app).get('/api/auth/me').set(bearer(res.body.data.token));
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('new.person@test.dev');
    expect(me.body.data.passwordHash).toBeUndefined();
  });

  it('rejects a role field (strict schema) so privilege cannot be chosen', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Sneaky', email: 'sneaky@test.dev', password: 'Secret123', role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const user = await createUser(UserRole.EMPLOYEE);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Dup', email: user.email.toUpperCase(), password: 'Secret123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects weak password and invalid email with field details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'X', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['fullName', 'email', 'password']));
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const user = await createUser(UserRole.IT_STAFF);
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('IT_STAFF');
    const payload = jwt.verify(res.body.data.token, env.JWT_SECRET) as { sub: string; role: string };
    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe('IT_STAFF');
  });

  it('returns 401 INVALID_CREDENTIALS for wrong password and unknown email alike', async () => {
    const user = await createUser(UserRole.EMPLOYEE);
    const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong1234' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@test.dev', password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('returns 403 ACCOUNT_DISABLED for an inactive user', async () => {
    const user = await createUser(UserRole.EMPLOYEE, { isActive: false });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('authenticate middleware', () => {
  it('returns 401 without a token, with a malformed token, and with an expired token', async () => {
    const none = await request(app).get('/api/auth/me');
    const malformed = await request(app).get('/api/auth/me').set(bearer('not.a.jwt'));
    const user = await createUser(UserRole.EMPLOYEE);
    const expired = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: -10 });
    const exp = await request(app).get('/api/auth/me').set(bearer(expired));
    for (const res of [none, malformed, exp]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects a token signed with a different secret', async () => {
    const user = await createUser(UserRole.EMPLOYEE);
    const forged = jwt.sign({ sub: user.id, role: 'ADMIN' }, 'some-other-secret-value', { expiresIn: '1h' });
    const res = await request(app).get('/api/auth/me').set(bearer(forged));
    expect(res.status).toBe(401);
  });

  it('returns 401 once the user is deactivated, even with a valid token', async () => {
    const { user, headers } = await authed(UserRole.EMPLOYEE);
    expect((await request(app).get('/api/auth/me').set(headers)).status).toBe(200);
    await AppDataSource.getRepository(User).update(user.id, { isActive: false });
    const res = await request(app).get('/api/auth/me').set(headers);
    expect(res.status).toBe(401);
  });

  it('reflects a role change immediately (role is loaded from the DB, not the token)', async () => {
    const { user, headers } = await authed(UserRole.EMPLOYEE);
    expect((await request(app).get('/api/users').set(headers)).status).toBe(403);
    await AppDataSource.getRepository(User).update(user.id, { role: UserRole.ADMIN });
    expect((await request(app).get('/api/users').set(headers)).status).toBe(200);
  });
});

describe('PATCH /api/auth/me/password', () => {
  it('rejects a wrong current password with 401', async () => {
    const { headers } = await authed(UserRole.EMPLOYEE);
    const res = await request(app)
      .patch('/api/auth/me/password')
      .set(headers)
      .send({ currentPassword: 'Nope12345', newPassword: 'Fresh1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('changes the password; old password no longer works, new one does', async () => {
    const user = await createUser(UserRole.EMPLOYEE);
    const headers = bearer(tokenFor(user));
    const res = await request(app)
      .patch('/api/auth/me/password')
      .set(headers)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Fresh1234' });
    expect(res.status).toBe(204);

    const old = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    const fresh = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Fresh1234' });
    expect(old.status).toBe(401);
    expect(fresh.status).toBe(200);
  });

  it('validates the new password strength', async () => {
    const { headers } = await authed(UserRole.EMPLOYEE);
    const res = await request(app)
      .patch('/api/auth/me/password')
      .set(headers)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'weak' });
    expect(res.status).toBe(400);
  });
});
