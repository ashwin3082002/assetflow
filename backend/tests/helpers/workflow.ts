import request from 'supertest';
import type { Express } from 'express';
import { RequestStatus } from '../../src/common/enums';

type Headers = { Authorization: string };

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Drives a request for `assetId` to the given status through the real endpoints
 * (never by writing rows directly), returning the request id.
 */
export async function requestInState(app: Express, assetId: string, status: RequestStatus, employee: Headers, staff: Headers): Promise<string> {
  const created = await request(app)
    .post('/api/requests')
    .set(employee)
    .send({ assetId, purpose: 'Workflow helper request', requestedFrom: isoDaysFromNow(0), expectedReturnDate: isoDaysFromNow(7) });
  if (created.status !== 201) throw new Error(`requestInState: create failed ${created.status} ${JSON.stringify(created.body)}`);
  const id: string = created.body.data.id;

  const step = async (headers: Headers, action: string, body?: Record<string, unknown>) => {
    const res = await request(app).post(`/api/requests/${id}/${action}`).set(headers).send(body ?? {});
    if (res.status !== 200) throw new Error(`requestInState: ${action} failed ${res.status} ${JSON.stringify(res.body)}`);
  };

  if (status === RequestStatus.PENDING) return id;
  await step(staff, 'approve');
  if (status === RequestStatus.APPROVED) return id;
  await step(staff, 'allocate');
  if (status === RequestStatus.ALLOCATED) return id;
  if (status === RequestStatus.RETURN_PENDING) {
    await step(employee, 'return');
    return id;
  }
  if (status === RequestStatus.COMPLETED) {
    await step(staff, 'complete', { returnCondition: 'GOOD' });
    return id;
  }
  throw new Error(`requestInState: unsupported target status ${status}`);
}
