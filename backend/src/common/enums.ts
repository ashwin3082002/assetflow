export enum UserRole {
  ADMIN = 'ADMIN',
  IT_STAFF = 'IT_STAFF',
  EMPLOYEE = 'EMPLOYEE',
}

export enum AssetStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  ALLOCATED = 'ALLOCATED',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
  RETIRED = 'RETIRED',
}

export enum AssetCondition {
  NEW = 'NEW',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DAMAGED = 'DAMAGED',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ALLOCATED = 'ALLOCATED',
  RETURN_PENDING = 'RETURN_PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum MaintenanceType {
  REPAIR = 'REPAIR',
  INSPECTION = 'INSPECTION',
  UPGRADE = 'UPGRADE',
  CLEANING = 'CLEANING',
}

export enum MaintenanceStatus {
  OPEN = 'OPEN',
  COMPLETED = 'COMPLETED',
}
