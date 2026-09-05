import { AssetStatus, MaintenanceStatus, RequestStatus } from './enums';
import { ConflictError } from './errors';

/**
 * Pure transition guards for the workflow-driven status fields
 * (docs/database-design.md §6.1–6.3). Services call `assertTransition` before mutating.
 */

export const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  [RequestStatus.PENDING]: [RequestStatus.APPROVED, RequestStatus.REJECTED, RequestStatus.CANCELLED],
  [RequestStatus.APPROVED]: [RequestStatus.ALLOCATED, RequestStatus.REJECTED, RequestStatus.CANCELLED],
  [RequestStatus.ALLOCATED]: [RequestStatus.RETURN_PENDING, RequestStatus.COMPLETED],
  [RequestStatus.RETURN_PENDING]: [RequestStatus.COMPLETED],
  [RequestStatus.REJECTED]: [],
  [RequestStatus.COMPLETED]: [],
  [RequestStatus.CANCELLED]: [],
};

export const ASSET_TRANSITIONS: Record<AssetStatus, readonly AssetStatus[]> = {
  [AssetStatus.AVAILABLE]: [AssetStatus.RESERVED, AssetStatus.UNDER_MAINTENANCE, AssetStatus.RETIRED],
  [AssetStatus.RESERVED]: [AssetStatus.AVAILABLE, AssetStatus.ALLOCATED],
  [AssetStatus.ALLOCATED]: [AssetStatus.AVAILABLE, AssetStatus.UNDER_MAINTENANCE],
  [AssetStatus.UNDER_MAINTENANCE]: [AssetStatus.AVAILABLE, AssetStatus.RETIRED],
  [AssetStatus.RETIRED]: [],
};

/** OPEN records may also be deleted (cancel); that is a removal, not a transition. */
export const MAINTENANCE_TRANSITIONS: Record<MaintenanceStatus, readonly MaintenanceStatus[]> = {
  [MaintenanceStatus.OPEN]: [MaintenanceStatus.COMPLETED],
  [MaintenanceStatus.COMPLETED]: [],
};

export type TransitionEntity = 'request' | 'asset' | 'maintenance';

const TABLES: Record<TransitionEntity, Record<string, readonly string[]>> = {
  request: REQUEST_TRANSITIONS,
  asset: ASSET_TRANSITIONS,
  maintenance: MAINTENANCE_TRANSITIONS,
};

export function canTransition(entity: 'request', from: RequestStatus, to: RequestStatus): boolean;
export function canTransition(entity: 'asset', from: AssetStatus, to: AssetStatus): boolean;
export function canTransition(entity: 'maintenance', from: MaintenanceStatus, to: MaintenanceStatus): boolean;
export function canTransition(entity: TransitionEntity, from: string, to: string): boolean {
  return (TABLES[entity][from] ?? []).includes(to);
}

export function assertTransition(entity: 'request', from: RequestStatus, to: RequestStatus): void;
export function assertTransition(entity: 'asset', from: AssetStatus, to: AssetStatus): void;
export function assertTransition(entity: 'maintenance', from: MaintenanceStatus, to: MaintenanceStatus): void;
export function assertTransition(entity: TransitionEntity, from: string, to: string): void {
  if (!(TABLES[entity][from] ?? []).includes(to)) {
    throw new ConflictError(`Cannot move ${entity} from ${from} to ${to}`, 'INVALID_STATE_TRANSITION');
  }
}

export function isTerminal(entity: TransitionEntity, status: string): boolean {
  return (TABLES[entity][status] ?? []).length === 0;
}
