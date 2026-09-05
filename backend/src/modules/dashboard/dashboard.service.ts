import { In, LessThan, MoreThanOrEqual, type FindOptionsOrder, type FindOptionsWhere, type ObjectLiteral, type Repository } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Asset } from '../../entities/Asset';
import { AssetRequest } from '../../entities/AssetRequest';
import { Category } from '../../entities/Category';
import { MaintenanceRecord } from '../../entities/MaintenanceRecord';
import { Review } from '../../entities/Review';
import { User } from '../../entities/User';
import { AssetStatus, MaintenanceStatus, RequestStatus, UserRole } from '../../common/enums';
import type { AuthUser } from '../../common/types';
import { todayISO } from '../../common/schemas';
import { ratingOf, ratingsFor } from '../assets/assets.service';
import {
  serializeAssetSummary,
  serializeMaintenance,
  serializeRequestSummary,
  type AssetSummaryResponse,
  type MaintenanceResponse,
  type RequestSummaryResponse,
} from '../assets/assets.serializers';

/** Response shapes per docs/api-design.md §10. */

export interface AdminDashboardResponse {
  users: { total: number; byRole: Record<UserRole, number>; inactive: number };
  assets: { total: number; byStatus: Record<AssetStatus, number> };
  requests: { pending: number; approved: number; allocated: number; returnPending: number; overdue: number; completedLast30Days: number };
  maintenance: { open: number; completedLast30Days: number; totalCostLast30Days: number };
  assetsByCategory: { categoryId: string; name: string; total: number; available: number }[];
  recentRequests: RequestSummaryResponse[];
  recentMaintenance: MaintenanceResponse[];
  topRatedAssets: { assetId: string; name: string; avgRating: number; reviewCount: number }[];
}

export interface StaffDashboardResponse {
  counts: { pending: number; awaitingAllocation: number; returnPending: number; overdue: number; openMaintenance: number; needsMaintenanceRecord: number };
  inventory: { byStatus: Record<AssetStatus, number>; total: number };
  pendingRequests: RequestSummaryResponse[];
  awaitingAllocation: RequestSummaryResponse[];
  returnPending: RequestSummaryResponse[];
  overdue: RequestSummaryResponse[];
  openMaintenance: MaintenanceResponse[];
  needsMaintenanceRecord: AssetSummaryResponse[];
  recentlyAdded: AssetSummaryResponse[];
}

export interface EmployeeDashboardResponse {
  counts: { activeAssets: number; pendingRequests: number; approvedRequests: number; reviewsSubmitted: number; availableAssets: number };
  activeAssets: RequestSummaryResponse[];
  pendingRequests: RequestSummaryResponse[];
  recentStatusChanges: RequestSummaryResponse[];
  pendingReviews: RequestSummaryResponse[];
}

const HOLDING_STATUSES = [RequestStatus.ALLOCATED, RequestStatus.RETURN_PENDING];
const QUEUE_LIMIT = 10;
const RECENT_LIMIT = 5;
/** Upper bound for the employee dashboard's unbounded lists; counts are computed separately so they stay exact. */
const LIST_LIMIT = 100;
const THIRTY_DAYS_MS = 30 * 86_400_000;

function since30Days(): Date {
  return new Date(Date.now() - THIRTY_DAYS_MS);
}

/** `SELECT <column>, COUNT(*) … GROUP BY <column>` filled out with zero for every enum value. */
async function countBy<E extends ObjectLiteral, K extends string>(repo: Repository<E>, column: string, keys: readonly K[]): Promise<Record<K, number>> {
  const rows: { key: K; count: string }[] = await repo
    .createQueryBuilder('row')
    .select(`row.${column}`, 'key')
    .addSelect('COUNT(*)', 'count')
    .groupBy(`row.${column}`)
    .getRawMany();
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const r of rows) out[r.key] = Number(r.count);
  return out;
}

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((a, b) => a + b, 0);
}

function requestRepo() {
  return AppDataSource.getRepository(AssetRequest);
}

function overdueWhere(extra: FindOptionsWhere<AssetRequest> = {}): FindOptionsWhere<AssetRequest> {
  return { ...extra, status: In(HOLDING_STATUSES), expectedReturnDate: LessThan(todayISO()) };
}

async function requestsWhere(where: FindOptionsWhere<AssetRequest>, order: FindOptionsOrder<AssetRequest>, take: number): Promise<RequestSummaryResponse[]> {
  const rows = await requestRepo().find({ where, relations: { asset: true, requester: true }, order, take });
  return rows.map(serializeRequestSummary);
}

async function maintenanceWhere(where: FindOptionsWhere<MaintenanceRecord>, take: number): Promise<MaintenanceResponse[]> {
  const rows = await AppDataSource.getRepository(MaintenanceRecord).find({ where, relations: { asset: true, createdBy: true }, order: { startedAt: 'DESC' }, take });
  return rows.map(serializeMaintenance);
}

async function serializeAssets(assets: Asset[]): Promise<AssetSummaryResponse[]> {
  const ratings = await ratingsFor(assets.map((a) => a.id));
  return assets.map((a) => serializeAssetSummary(a, ratingOf(ratings, a.id)));
}

/** Assets left UNDER_MAINTENANCE by a DAMAGED return with no OPEN record yet (business-rules §3.11). */
function needsMaintenanceRecordQuery() {
  return AppDataSource.getRepository(Asset)
    .createQueryBuilder('asset')
    .innerJoinAndSelect('asset.category', 'category')
    .innerJoinAndSelect('asset.managedBy', 'managedBy')
    .where('asset.status = :status', { status: AssetStatus.UNDER_MAINTENANCE })
    .andWhere((qb) => {
      const sub = qb.subQuery().select('1').from(MaintenanceRecord, 'record').where('record.assetId = asset.id').andWhere('record.status = :open').getQuery();
      return `NOT EXISTS ${sub}`;
    })
    .setParameter('open', MaintenanceStatus.OPEN)
    .orderBy('asset.updatedAt', 'DESC');
}

// ---------------------------------------------------------------------------------------------

export async function admin(): Promise<AdminDashboardResponse> {
  const since = since30Days();
  const [usersByRole, inactive, assetsByStatus, requestsByStatus, overdue, completedLast30Days, maintenanceByStatus, maintenanceCompleted30, categoryRows, recentRequests, recentMaintenance, topRated] =
    await Promise.all([
      countBy(AppDataSource.getRepository(User), 'role', Object.values(UserRole)),
      AppDataSource.getRepository(User).count({ where: { isActive: false } }),
      countBy(AppDataSource.getRepository(Asset), 'status', Object.values(AssetStatus)),
      countBy(requestRepo(), 'status', Object.values(RequestStatus)),
      requestRepo().count({ where: overdueWhere() }),
      requestRepo().count({ where: { status: RequestStatus.COMPLETED, completedAt: MoreThanOrEqual(since) } }),
      countBy(AppDataSource.getRepository(MaintenanceRecord), 'status', Object.values(MaintenanceStatus)),
      AppDataSource.getRepository(MaintenanceRecord)
        .createQueryBuilder('record')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(record.cost), 0)', 'cost')
        .where('record.status = :status', { status: MaintenanceStatus.COMPLETED })
        .andWhere('record.completedAt >= :since', { since })
        .getRawOne<{ count: string; cost: string }>(),
      AppDataSource.getRepository(Category)
        .createQueryBuilder('category')
        .leftJoin('category.assets', 'asset')
        .select('category.id', 'categoryId')
        .addSelect('category.name', 'name')
        .addSelect('COUNT(asset.id)', 'total')
        .addSelect('SUM(CASE WHEN asset.status = :available THEN 1 ELSE 0 END)', 'available')
        .setParameter('available', AssetStatus.AVAILABLE)
        .groupBy('category.id')
        .addGroupBy('category.name')
        .orderBy('category.name', 'ASC')
        .getRawMany<{ categoryId: string; name: string; total: string; available: string | null }>(),
      requestsWhere({}, { createdAt: 'DESC' }, RECENT_LIMIT),
      maintenanceWhere({}, RECENT_LIMIT),
      AppDataSource.getRepository(Review)
        .createQueryBuilder('review')
        .innerJoin('review.asset', 'asset')
        .select('asset.id', 'assetId')
        .addSelect('asset.name', 'name')
        .addSelect('AVG(review.rating)', 'avg')
        .addSelect('COUNT(*)', 'count')
        .groupBy('asset.id')
        .addGroupBy('asset.name')
        .orderBy('AVG(review.rating)', 'DESC')
        .addOrderBy('COUNT(*)', 'DESC')
        .addOrderBy('asset.name', 'ASC')
        .limit(RECENT_LIMIT)
        .getRawMany<{ assetId: string; name: string; avg: string; count: string }>(),
    ]);

  return {
    users: { total: sum(usersByRole), byRole: usersByRole, inactive },
    assets: { total: sum(assetsByStatus), byStatus: assetsByStatus },
    requests: {
      pending: requestsByStatus.PENDING,
      approved: requestsByStatus.APPROVED,
      allocated: requestsByStatus.ALLOCATED,
      returnPending: requestsByStatus.RETURN_PENDING,
      overdue,
      completedLast30Days,
    },
    maintenance: {
      open: maintenanceByStatus.OPEN,
      completedLast30Days: Number(maintenanceCompleted30?.count ?? 0),
      totalCostLast30Days: Math.round(Number(maintenanceCompleted30?.cost ?? 0) * 100) / 100,
    },
    assetsByCategory: categoryRows.map((r) => ({ categoryId: r.categoryId, name: r.name, total: Number(r.total), available: Number(r.available ?? 0) })),
    recentRequests,
    recentMaintenance,
    topRatedAssets: topRated.map((r) => ({ assetId: r.assetId, name: r.name, avgRating: Math.round(Number(r.avg) * 10) / 10, reviewCount: Number(r.count) })),
  };
}

export async function staff(): Promise<StaffDashboardResponse> {
  const [assetsByStatus, pendingRequests, awaitingAllocation, returnPending, overdue, openMaintenance, needsRecordAssets, recentAssets, pendingCount, approvedCount, returnPendingCount, overdueCount, openMaintenanceCount, needsRecordCount] =
    await Promise.all([
      countBy(AppDataSource.getRepository(Asset), 'status', Object.values(AssetStatus)),
      requestsWhere({ status: RequestStatus.PENDING }, { createdAt: 'ASC' }, QUEUE_LIMIT),
      requestsWhere({ status: RequestStatus.APPROVED }, { approvedAt: 'ASC' }, QUEUE_LIMIT),
      requestsWhere({ status: RequestStatus.RETURN_PENDING }, { returnInitiatedAt: 'ASC' }, QUEUE_LIMIT),
      requestsWhere(overdueWhere(), { expectedReturnDate: 'ASC' }, QUEUE_LIMIT),
      maintenanceWhere({ status: MaintenanceStatus.OPEN }, QUEUE_LIMIT),
      needsMaintenanceRecordQuery().take(QUEUE_LIMIT).getMany(),
      AppDataSource.getRepository(Asset).find({ relations: { category: true, managedBy: true }, order: { createdAt: 'DESC' }, take: RECENT_LIMIT }),
      requestRepo().count({ where: { status: RequestStatus.PENDING } }),
      requestRepo().count({ where: { status: RequestStatus.APPROVED } }),
      requestRepo().count({ where: { status: RequestStatus.RETURN_PENDING } }),
      requestRepo().count({ where: overdueWhere() }),
      AppDataSource.getRepository(MaintenanceRecord).count({ where: { status: MaintenanceStatus.OPEN } }),
      needsMaintenanceRecordQuery().getCount(),
    ]);

  const [needsMaintenanceRecord, recentlyAdded] = await Promise.all([serializeAssets(needsRecordAssets), serializeAssets(recentAssets)]);

  return {
    counts: {
      pending: pendingCount,
      awaitingAllocation: approvedCount,
      returnPending: returnPendingCount,
      overdue: overdueCount,
      openMaintenance: openMaintenanceCount,
      needsMaintenanceRecord: needsRecordCount,
    },
    inventory: { byStatus: assetsByStatus, total: sum(assetsByStatus) },
    pendingRequests,
    awaitingAllocation,
    returnPending,
    overdue,
    openMaintenance,
    needsMaintenanceRecord,
    recentlyAdded,
  };
}

export async function employee(caller: AuthUser): Promise<EmployeeDashboardResponse> {
  const own = { requesterId: caller.id };
  const [activeAssets, pendingRequests, recentStatusChanges, pendingReviewRows, reviewsSubmitted, availableAssets, pendingCount, approvedCount, activeCount] = await Promise.all([
    requestsWhere({ ...own, status: In(HOLDING_STATUSES) }, { expectedReturnDate: 'ASC' }, LIST_LIMIT),
    requestsWhere({ ...own, status: In([RequestStatus.PENDING, RequestStatus.APPROVED]) }, { createdAt: 'DESC' }, LIST_LIMIT),
    requestsWhere(own, { updatedAt: 'DESC' }, RECENT_LIMIT),
    requestRepo()
      .createQueryBuilder('request')
      .innerJoinAndSelect('request.asset', 'asset')
      .innerJoinAndSelect('request.requester', 'requester')
      .leftJoin('request.review', 'review')
      .where('request.requesterId = :requesterId', { requesterId: caller.id })
      .andWhere('request.status = :completed', { completed: RequestStatus.COMPLETED })
      .andWhere('review.id IS NULL')
      .orderBy('request.completedAt', 'DESC')
      .take(LIST_LIMIT)
      .getMany(),
    AppDataSource.getRepository(Review).count({ where: { reviewerId: caller.id } }),
    AppDataSource.getRepository(Asset).count({ where: { status: AssetStatus.AVAILABLE } }),
    requestRepo().count({ where: { ...own, status: RequestStatus.PENDING } }),
    requestRepo().count({ where: { ...own, status: RequestStatus.APPROVED } }),
    requestRepo().count({ where: { ...own, status: In(HOLDING_STATUSES) } }),
  ]);

  return {
    counts: {
      activeAssets: activeCount,
      pendingRequests: pendingCount,
      approvedRequests: approvedCount,
      reviewsSubmitted,
      availableAssets,
    },
    activeAssets,
    pendingRequests,
    recentStatusChanges,
    pendingReviews: pendingReviewRows.map(serializeRequestSummary),
  };
}
