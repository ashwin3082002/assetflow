import { client, compactParams, type ListParams } from './client';
import type { AssetCondition, ListResponse, RequestDetail, RequestSummary } from '../types';

/** Mirrors docs/api-design.md §7. Employees are scoped to their own requests server-side. */

export interface RequestInput {
  assetId: string;
  purpose: string;
  requestedFrom: string;
  expectedReturnDate: string;
}

export interface CompleteRequestInput {
  returnCondition: AssetCondition;
  returnNotes?: string | null;
}

export async function listRequests(params: ListParams): Promise<ListResponse<RequestSummary>> {
  const res = await client.get<ListResponse<RequestSummary>>('/requests', { params: compactParams(params) });
  return res.data;
}

export async function getRequest(id: string): Promise<RequestDetail> {
  const res = await client.get<{ data: RequestDetail }>(`/requests/${id}`);
  return res.data.data;
}

export async function createRequest(input: RequestInput): Promise<RequestDetail> {
  const res = await client.post<{ data: RequestDetail }>('/requests', input);
  return res.data.data;
}

async function transition(id: string, action: string, body?: Record<string, unknown>): Promise<RequestDetail> {
  const res = await client.post<{ data: RequestDetail }>(`/requests/${id}/${action}`, body);
  return res.data.data;
}

export const cancelRequest = (id: string) => transition(id, 'cancel');
export const initiateReturn = (id: string) => transition(id, 'return');
export const approveRequest = (id: string) => transition(id, 'approve');
export const allocateRequest = (id: string) => transition(id, 'allocate');
export const rejectRequest = (id: string, reason: string) => transition(id, 'reject', { reason });
export const completeRequest = (id: string, input: CompleteRequestInput) => transition(id, 'complete', { ...input });
