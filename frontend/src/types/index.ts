import type { AssetCondition, AssetStatus, MaintenanceStatus, MaintenanceType, RequestStatus, UserRole } from './enums';

export * from './enums';

/** Mirrors docs/api-design.md §1.3 shapes. */

export interface Category {
  id: string;
  name: string;
  description: string | null;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetSummary {
  id: string;
  name: string;
  serialNumber: string;
  status: AssetStatus;
  condition: AssetCondition;
  imageUrl: string | null;
  purchaseDate: string | null;
  maxLoanDays: number | null;
  location: string | null;
  category: { id: string; name: string };
  managedBy: { id: string; fullName: string };
  avgRating: number | null;
  reviewCount: number;
}

export interface RequestSummary {
  id: string;
  status: RequestStatus;
  purpose: string;
  requestedFrom: string;
  expectedReturnDate: string;
  isOverdue: boolean;
  createdAt: string;
  asset: { id: string; name: string; serialNumber: string; imageUrl: string | null };
  requester: { id: string; fullName: string; department: string | null };
}

export interface RequestDetail extends RequestSummary {
  processedBy: { id: string; fullName: string } | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  allocatedAt: string | null;
  returnInitiatedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  rejectionReason: string | null;
  returnCondition: AssetCondition | null;
  returnNotes: string | null;
  review: { id: string; rating: number } | null;
}

export interface Maintenance {
  id: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  description: string;
  startedAt: string;
  completedAt: string | null;
  cost: number | null;
  resultingCondition: AssetCondition | null;
  asset: { id: string; name: string; serialNumber: string };
  createdBy: { id: string; fullName: string };
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: { id: string; fullName: string };
  asset: { id: string; name: string };
  requestId: string;
}

export interface RatingSummary {
  avgRating: number | null;
  reviewCount: number;
}

/** GET /assets/:id/reviews adds the aggregate next to the page. */
export interface AssetReviews extends ListResponse<Review> {
  summary: RatingSummary;
}

/** GET /dashboard/admin (docs/api-design.md §10). */
export interface AdminDashboardData {
  users: { total: number; byRole: Record<UserRole, number>; inactive: number };
  assets: { total: number; byStatus: Record<AssetStatus, number> };
  requests: { pending: number; approved: number; allocated: number; returnPending: number; overdue: number; completedLast30Days: number };
  maintenance: { open: number; completedLast30Days: number; totalCostLast30Days: number };
  assetsByCategory: { categoryId: string; name: string; total: number; available: number }[];
  recentRequests: RequestSummary[];
  recentMaintenance: Maintenance[];
  topRatedAssets: { assetId: string; name: string; avgRating: number; reviewCount: number }[];
}

/** GET /dashboard/staff. */
export interface StaffDashboardData {
  counts: { pending: number; awaitingAllocation: number; returnPending: number; overdue: number; openMaintenance: number; needsMaintenanceRecord: number };
  inventory: { byStatus: Record<AssetStatus, number>; total: number };
  pendingRequests: RequestSummary[];
  awaitingAllocation: RequestSummary[];
  returnPending: RequestSummary[];
  overdue: RequestSummary[];
  openMaintenance: Maintenance[];
  needsMaintenanceRecord: AssetSummary[];
  recentlyAdded: AssetSummary[];
}

/** GET /dashboard/employee. */
export interface EmployeeDashboardData {
  counts: { activeAssets: number; pendingRequests: number; approvedRequests: number; reviewsSubmitted: number; availableAssets: number };
  activeAssets: RequestSummary[];
  pendingRequests: RequestSummary[];
  recentStatusChanges: RequestSummary[];
  pendingReviews: RequestSummary[];
}

export interface Asset extends AssetSummary {
  description: string;
  createdAt: string;
  updatedAt: string;
  /** ADMIN / IT_STAFF only */
  activeRequest?: RequestSummary | null;
  /** ADMIN / IT_STAFF only, last 5 */
  recentMaintenance?: Maintenance[];
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  department: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Normalized API error produced by src/api/client.ts. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
}
