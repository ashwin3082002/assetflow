import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/app';
import { errorHandler } from '../src/middleware/errorHandler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../src/common/errors';
import { AppDataSource } from '../src/config/data-source';
import { Category } from '../src/entities/Category';

const app = createApp();

describe('error envelope', () => {
  it('unknown route returns 404 JSON envelope', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('malformed JSON body returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('non-API route returns 404 JSON envelope', async () => {
    const res = await request(app).get('/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('errorHandler mapping', () => {
  // A throwaway app that throws a given error so each mapping branch can be exercised directly.
  function appThrowing(err: unknown) {
    const a = express();
    a.get('/boom', () => {
      throw err;
    });
    a.use(errorHandler);
    return a;
  }

  it.each([
    [new BadRequestError('bad'), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedError(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ConflictError('dup', 'SERIAL_NUMBER_TAKEN'), 409, 'SERIAL_NUMBER_TAKEN'],
  ])('maps %p to %i %s', async (err, status, code) => {
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it('maps ZodError to 400 with field details', async () => {
    const zodErr = z.object({ name: z.string().min(2) }).safeParse({ name: 'x' });
    expect(zodErr.success).toBe(false);
    const res = await request(appThrowing(zodErr.success ? null : zodErr.error)).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('name');
  });

  it('maps unknown errors to 500 INTERNAL_ERROR', async () => {
    const res = await request(appThrowing(new Error('kaboom'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('maps a database unique violation to 409 CONFLICT', async () => {
    const repo = AppDataSource.getRepository(Category);
    await repo.save(repo.create({ name: 'Laptop', description: null }));
    let caught: unknown;
    try {
      await repo.save(repo.create({ name: 'Laptop', description: null }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const res = await request(appThrowing(caught)).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details[0].path).toBe('UQ_categories_name');
  });
});
