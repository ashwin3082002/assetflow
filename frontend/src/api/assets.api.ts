import { client, compactParams, type ListParams } from './client';
import type { Asset, AssetCondition, AssetSummary, ListResponse, RequestSummary } from '../types';

/** Query string params for GET /assets (docs/api-design.md §6). */
export type AssetListParams = ListParams;

export interface AssetInput {
  name: string;
  description: string;
  serialNumber: string;
  categoryId: string;
  managedById?: string;
  condition?: AssetCondition;
  purchaseDate?: string | null;
  maxLoanDays?: number | null;
  location?: string | null;
}

export async function listAssets(params: AssetListParams): Promise<ListResponse<AssetSummary>> {
  const res = await client.get<ListResponse<AssetSummary>>('/assets', { params: compactParams(params) });
  return res.data;
}

/** ADMIN / IT_STAFF only: request history of one unit. */
export async function listAssetRequests(id: string, params: ListParams = {}): Promise<ListResponse<RequestSummary>> {
  const res = await client.get<ListResponse<RequestSummary>>(`/assets/${id}/requests`, { params: compactParams(params) });
  return res.data;
}

export async function getAsset(id: string): Promise<Asset> {
  const res = await client.get<{ data: Asset }>(`/assets/${id}`);
  return res.data.data;
}

export async function createAsset(input: AssetInput): Promise<Asset> {
  const res = await client.post<{ data: Asset }>('/assets', input);
  return res.data.data;
}

export async function updateAsset(id: string, input: Partial<AssetInput>): Promise<Asset> {
  const res = await client.patch<{ data: Asset }>(`/assets/${id}`, input);
  return res.data.data;
}

export async function uploadAssetImage(id: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('image', file);
  const res = await client.post<{ data: Asset }>(`/assets/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data.data;
}

export async function deleteAssetImage(id: string): Promise<Asset> {
  const res = await client.delete<{ data: Asset }>(`/assets/${id}/image`);
  return res.data.data;
}

export async function retireAsset(id: string): Promise<Asset> {
  const res = await client.post<{ data: Asset }>(`/assets/${id}/retire`);
  return res.data.data;
}

export async function deleteAsset(id: string): Promise<void> {
  await client.delete(`/assets/${id}`);
}
