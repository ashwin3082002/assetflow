/** Mirrors backend/src/common/enums.ts. Keep in sync with docs/database-design.md §2. */

export const UserRole = { ADMIN: 'ADMIN', IT_STAFF: 'IT_STAFF', EMPLOYEE: 'EMPLOYEE' } as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AssetStatus = {
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  ALLOCATED: 'ALLOCATED',
  UNDER_MAINTENANCE: 'UNDER_MAINTENANCE',
  RETIRED: 'RETIRED',
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const AssetCondition = { NEW: 'NEW', GOOD: 'GOOD', FAIR: 'FAIR', POOR: 'POOR', DAMAGED: 'DAMAGED' } as const;
export type AssetCondition = (typeof AssetCondition)[keyof typeof AssetCondition];

export const RequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ALLOCATED: 'ALLOCATED',
  RETURN_PENDING: 'RETURN_PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const MaintenanceType = { REPAIR: 'REPAIR', INSPECTION: 'INSPECTION', UPGRADE: 'UPGRADE', CLEANING: 'CLEANING' } as const;
export type MaintenanceType = (typeof MaintenanceType)[keyof typeof MaintenanceType];

export const MaintenanceStatus = { OPEN: 'OPEN', COMPLETED: 'COMPLETED' } as const;
export type MaintenanceStatus = (typeof MaintenanceStatus)[keyof typeof MaintenanceStatus];
