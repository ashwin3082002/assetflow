import { client, compactParams, type ListParams } from './client';
import type { AssetCondition, ListResponse, Maintenance, MaintenanceType } from '../types';

/** Mirrors docs/api-design.md §8. Every route is ADMIN / IT_STAFF only. */

export interface MaintenanceInput {
  assetId: string;
  type: MaintenanceType;
  description: string;
  cost?: number | null;
}

export interface UpdateMaintenanceInput {
  description?: string;
  type?: MaintenanceType;
  cost?: number | null;
}

export interface CompleteMaintenanceInput {
  resultingCondition: AssetCondition;
  cost?: number | null;
  /** ISO timestamp, ≤ now and ≥ startedAt; defaults to now server-side. */
  completedAt?: string;
  retire?: boolean;
}

export async function listMaintenance(params: ListParams): Promise<ListResponse<Maintenance>> {
  const res = await client.get<ListResponse<Maintenance>>('/maintenance', { params: compactParams(params) });
  return res.data;
}

export async function getMaintenance(id: string): Promise<Maintenance> {
  const res = await client.get<{ data: Maintenance }>(`/maintenance/${id}`);
  return res.data.data;
}

export async function openMaintenance(input: MaintenanceInput): Promise<Maintenance> {
  const res = await client.post<{ data: Maintenance }>('/maintenance', input);
  return res.data.data;
}

export async function updateMaintenance(id: string, input: UpdateMaintenanceInput): Promise<Maintenance> {
  const res = await client.patch<{ data: Maintenance }>(`/maintenance/${id}`, input);
  return res.data.data;
}

export async function completeMaintenance(id: string, input: CompleteMaintenanceInput): Promise<Maintenance> {
  const res = await client.post<{ data: Maintenance }>(`/maintenance/${id}/complete`, input);
  return res.data.data;
}

/** Only OPEN records can be deleted; the asset returns to AVAILABLE. */
export async function deleteMaintenance(id: string): Promise<void> {
  await client.delete(`/maintenance/${id}`);
}
