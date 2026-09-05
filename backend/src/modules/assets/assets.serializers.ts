import type { Asset } from '../../entities/Asset';
import type { AssetRequest } from '../../entities/AssetRequest';
import type { MaintenanceRecord } from '../../entities/MaintenanceRecord';
import type { Review } from '../../entities/Review';
import { RequestStatus, type AssetCondition, type AssetStatus } from '../../common/enums';
import { todayISO } from '../../common/schemas';

/** Response shapes per docs/api-design.md §1.3. */

export interface RatingSummary {
  avgRating: number | null;
  reviewCount: number;
}

export interface AssetSummaryResponse {
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

export interface RequestSummaryResponse {
  id: string;
  status: RequestStatus;
  purpose: string;
  requestedFrom: string;
  expectedReturnDate: string;
  isOverdue: boolean;
  createdAt: Date;
  asset: { id: string; name: string; serialNumber: string; imageUrl: string | null };
  requester: { id: string; fullName: string; department: string | null };
}

export interface RequestDetailResponse extends RequestSummaryResponse {
  processedBy: { id: string; fullName: string } | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  allocatedAt: Date | null;
  returnInitiatedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  rejectionReason: string | null;
  returnCondition: AssetCondition | null;
  returnNotes: string | null;
  review: { id: string; rating: number } | null;
}

export interface MaintenanceResponse {
  id: string;
  type: MaintenanceRecord['type'];
  status: MaintenanceRecord['status'];
  description: string;
  startedAt: Date;
  completedAt: Date | null;
  cost: number | null;
  resultingCondition: AssetCondition | null;
  asset: { id: string; name: string; serialNumber: string };
  createdBy: { id: string; fullName: string };
  createdAt: Date;
}

export interface ReviewResponse {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  reviewer: { id: string; fullName: string };
  asset: { id: string; name: string };
  requestId: string;
}

export interface AssetDetailResponse extends AssetSummaryResponse {
  description: string;
  createdAt: Date;
  updatedAt: Date;
  activeRequest?: RequestSummaryResponse | null;
  recentMaintenance?: MaintenanceResponse[];
}

export function serializeAssetSummary(asset: Asset, rating: RatingSummary): AssetSummaryResponse {
  return {
    id: asset.id,
    name: asset.name,
    serialNumber: asset.serialNumber,
    status: asset.status,
    condition: asset.condition,
    imageUrl: asset.imageUrl,
    purchaseDate: asset.purchaseDate,
    maxLoanDays: asset.maxLoanDays,
    location: asset.location,
    category: { id: asset.category.id, name: asset.category.name },
    managedBy: { id: asset.managedBy.id, fullName: asset.managedBy.fullName },
    avgRating: rating.avgRating,
    reviewCount: rating.reviewCount,
  };
}

export function isOverdue(request: Pick<AssetRequest, 'status' | 'expectedReturnDate'>): boolean {
  return (
    (request.status === RequestStatus.ALLOCATED || request.status === RequestStatus.RETURN_PENDING) &&
    request.expectedReturnDate < todayISO()
  );
}

/** Requires `asset` and `requester` relations loaded. */
export function serializeRequestSummary(request: AssetRequest): RequestSummaryResponse {
  return {
    id: request.id,
    status: request.status,
    purpose: request.purpose,
    requestedFrom: request.requestedFrom,
    expectedReturnDate: request.expectedReturnDate,
    isOverdue: isOverdue(request),
    createdAt: request.createdAt,
    asset: {
      id: request.asset.id,
      name: request.asset.name,
      serialNumber: request.asset.serialNumber,
      imageUrl: request.asset.imageUrl,
    },
    requester: {
      id: request.requester.id,
      fullName: request.requester.fullName,
      department: request.requester.department,
    },
  };
}

/** Requires `asset`, `requester`, `processedBy` and `review` relations loaded. */
export function serializeRequestDetail(request: AssetRequest): RequestDetailResponse {
  return {
    ...serializeRequestSummary(request),
    processedBy: request.processedBy ? { id: request.processedBy.id, fullName: request.processedBy.fullName } : null,
    approvedAt: request.approvedAt,
    rejectedAt: request.rejectedAt,
    allocatedAt: request.allocatedAt,
    returnInitiatedAt: request.returnInitiatedAt,
    completedAt: request.completedAt,
    cancelledAt: request.cancelledAt,
    rejectionReason: request.rejectionReason,
    returnCondition: request.returnCondition,
    returnNotes: request.returnNotes,
    review: request.review ? { id: request.review.id, rating: request.review.rating } : null,
  };
}

/** Requires `asset` and `createdBy` relations loaded. */
export function serializeMaintenance(record: MaintenanceRecord): MaintenanceResponse {
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    description: record.description,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    cost: record.cost === null ? null : Number(record.cost),
    resultingCondition: record.resultingCondition,
    asset: { id: record.asset.id, name: record.asset.name, serialNumber: record.asset.serialNumber },
    createdBy: { id: record.createdBy.id, fullName: record.createdBy.fullName },
    createdAt: record.createdAt,
  };
}

/** Requires `reviewer` and `asset` relations loaded. */
export function serializeReview(review: Review): ReviewResponse {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    reviewer: { id: review.reviewer.id, fullName: review.reviewer.fullName },
    asset: { id: review.asset.id, name: review.asset.name },
    requestId: review.requestId,
  };
}
