import request from 'supertest';
import { createApp } from '../src/app';
import { AppDataSource } from '../src/config/data-source';
import { Review } from '../src/entities/Review';
import { RequestStatus, UserRole } from '../src/common/enums';
import { authed } from './helpers/auth';
import { createAsset } from './helpers/factories';
import { requestInState } from './helpers/workflow';

const app = createApp();

type Headers = { Authorization: string };

function postReview(headers: Headers, requestId: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/reviews')
    .set(headers)
    .send({ requestId, rating: 4, comment: 'Solid device', ...overrides });
}

describe('Reviews API', () => {
  let staff: Headers;
  let employee: Headers;
  let employeeId: string;
  let otherEmployee: Headers;

  beforeAll(async () => {
    staff = (await authed(UserRole.IT_STAFF)).headers;
  });

  // Fresh employees per test so the active-request cap never leaks between tests.
  beforeEach(async () => {
    const e = await authed(UserRole.EMPLOYEE);
    employee = e.headers;
    employeeId = e.user.id;
    otherEmployee = (await authed(UserRole.EMPLOYEE)).headers;
  });

  describe('1. create and aggregation', () => {
    it('reviewing an own COMPLETED request → 201 with assetId copied; rating appears on asset list, detail and /reviews', async () => {
      const asset = await createAsset();
      const requestId = await requestInState(app, asset.id, RequestStatus.COMPLETED, employee, staff);

      const res = await postReview(employee, requestId, { rating: 5, comment: 'Great laptop' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        rating: 5,
        comment: 'Great laptop',
        requestId,
        asset: { id: asset.id, name: asset.name },
        reviewer: { id: employeeId },
      });
      const stored = await AppDataSource.getRepository(Review).findOneOrFail({ where: { id: res.body.data.id } });
      expect(stored.assetId).toBe(asset.id);

      // Second review from another employee on their own completed loan of the same unit.
      const secondRequest = await requestInState(app, asset.id, RequestStatus.COMPLETED, otherEmployee, staff);
      expect((await postReview(otherEmployee, secondRequest, { rating: 4, comment: null })).status).toBe(201);

      const detail = await request(app).get(`/api/assets/${asset.id}`).set(employee);
      expect(detail.body.data).toMatchObject({ avgRating: 4.5, reviewCount: 2 });

      const list = await request(app).get(`/api/assets?search=${encodeURIComponent(asset.serialNumber)}`).set(staff);
      expect(list.body.data[0]).toMatchObject({ id: asset.id, avgRating: 4.5, reviewCount: 2 });

      const assetReviews = await request(app).get(`/api/assets/${asset.id}/reviews`).set(otherEmployee);
      expect(assetReviews.status).toBe(200);
      expect(assetReviews.body.summary).toEqual({ avgRating: 4.5, reviewCount: 2 });
      expect(assetReviews.body.data).toHaveLength(2);
      expect(assetReviews.body.meta.total).toBe(2);

      // The request detail now carries the review summary.
      const requestDetail = await request(app).get(`/api/requests/${requestId}`).set(employee);
      expect(requestDetail.body.data.review).toEqual({ id: res.body.data.id, rating: 5 });
    });
  });

  describe('2. preconditions and validation', () => {
    it.each([RequestStatus.PENDING, RequestStatus.APPROVED, RequestStatus.ALLOCATED, RequestStatus.RETURN_PENDING])(
      'reviewing a %s request → 409 REQUEST_NOT_COMPLETED',
      async (status) => {
        const asset = await createAsset();
        const requestId = await requestInState(app, asset.id, status, employee, staff);
        const res = await postReview(employee, requestId);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('REQUEST_NOT_COMPLETED');
      },
    );

    it("another user's completed request → 403; staff → 403 (role); unknown request → 404", async () => {
      const asset = await createAsset();
      const requestId = await requestInState(app, asset.id, RequestStatus.COMPLETED, employee, staff);

      const foreign = await postReview(otherEmployee, requestId);
      expect(foreign.status).toBe(403);
      expect(foreign.body.error.code).toBe('FORBIDDEN');

      expect((await postReview(staff, requestId)).status).toBe(403);
      expect((await postReview(employee, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    });

    it('duplicate review → 409 REVIEW_EXISTS (and the unique index backs it)', async () => {
      const asset = await createAsset();
      const requestId = await requestInState(app, asset.id, RequestStatus.COMPLETED, employee, staff);
      expect((await postReview(employee, requestId)).status).toBe(201);

      const dup = await postReview(employee, requestId, { rating: 1 });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('REVIEW_EXISTS');

      await expect(
        AppDataSource.getRepository(Review).insert({ requestId, assetId: asset.id, reviewerId: employeeId, rating: 3, comment: null }),
      ).rejects.toMatchObject({ driverError: { code: '23505' } });
    });

    it('rating 0 / 6 / 2.5, over-long comment and unknown fields → 400', async () => {
      const asset = await createAsset();
      const requestId = await requestInState(app, asset.id, RequestStatus.COMPLETED, employee, staff);
      for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: '5' }, { comment: 'x'.repeat(1001) }, { assetId: asset.id }]) {
        const res = await postReview(employee, requestId, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await AppDataSource.getRepository(Review).count({ where: { requestId } })).toBe(0);
    });
  });

  describe('3. list scoping', () => {
    it('employee sees only own reviews (foreign reviewerId → 403); staff sees all with filters and sort', async () => {
      const assetA = await createAsset();
      const assetB = await createAsset();
      const mine = await requestInState(app, assetA.id, RequestStatus.COMPLETED, employee, staff);
      const theirs = await requestInState(app, assetB.id, RequestStatus.COMPLETED, otherEmployee, staff);
      const myReview = (await postReview(employee, mine, { rating: 2 })).body.data;
      const theirReview = (await postReview(otherEmployee, theirs, { rating: 5 })).body.data;

      const own = await request(app).get('/api/reviews').set(employee);
      expect(own.status).toBe(200);
      expect(own.body.data.map((r: { id: string }) => r.id)).toEqual([myReview.id]);

      const forced = await request(app).get(`/api/reviews?reviewerId=${employeeId}`).set(employee);
      expect(forced.body.data).toHaveLength(1);

      const foreign = await request(app).get(`/api/reviews?reviewerId=${theirReview.reviewer.id}`).set(employee);
      expect(foreign.status).toBe(403);

      const all = await request(app).get('/api/reviews?sort=rating&order=desc&limit=100').set(staff);
      const ids = all.body.data.map((r: { id: string }) => r.id);
      expect(ids).toEqual(expect.arrayContaining([myReview.id, theirReview.id]));
      expect(ids.indexOf(theirReview.id)).toBeLessThan(ids.indexOf(myReview.id));

      const byAsset = await request(app).get(`/api/reviews?assetId=${assetB.id}`).set(staff);
      expect(byAsset.body.data.map((r: { id: string }) => r.id)).toEqual([theirReview.id]);

      const highOnly = await request(app).get(`/api/reviews?minRating=4&reviewerId=${employeeId}`).set(staff);
      expect(highOnly.body.data).toHaveLength(0);

      expect((await request(app).get('/api/reviews?sort=comment').set(staff)).status).toBe(400);
      expect((await request(app).get('/api/reviews?minRating=9').set(staff)).status).toBe(400);
    });
  });
});
