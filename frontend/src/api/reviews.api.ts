import { client, compactParams, type ListParams } from './client';
import type { AssetReviews, ListResponse, Review } from '../types';

/** Mirrors docs/api-design.md §9. Employees are scoped to their own reviews server-side. */

export interface ReviewInput {
  requestId: string;
  rating: number;
  comment?: string | null;
}

export async function createReview(input: ReviewInput): Promise<Review> {
  const res = await client.post<{ data: Review }>('/reviews', input);
  return res.data.data;
}

export async function listReviews(params: ListParams): Promise<ListResponse<Review>> {
  const res = await client.get<ListResponse<Review>>('/reviews', { params: compactParams(params) });
  return res.data;
}

/** Reviews of one asset with the aggregate summary (any role). */
export async function listAssetReviews(assetId: string, params: ListParams = {}): Promise<AssetReviews> {
  const res = await client.get<AssetReviews>(`/assets/${assetId}/reviews`, { params: compactParams(params) });
  return res.data;
}
