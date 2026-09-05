import { In } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Asset } from '../../entities/Asset';
import { Category } from '../../entities/Category';
import { User } from '../../entities/User';
import { AssetRequest } from '../../entities/AssetRequest';
import { MaintenanceRecord } from '../../entities/MaintenanceRecord';
import { Review } from '../../entities/Review';
import { AssetStatus, MaintenanceStatus, RequestStatus, UserRole } from '../../common/enums';
import type { AuthUser } from '../../common/types';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors';
import { buildMeta, toSkip, type PageMeta } from '../../common/pagination';
import { ASSET_IMAGE_URL_PREFIX, removeImageFile } from '../../config/uploads';
import type { AssetMaintenanceQuery, AssetRequestsQuery, AssetReviewsQuery, CreateAssetInput, ListAssetsQuery, UpdateAssetInput } from './assets.schemas';
import {
  serializeAssetSummary,
  serializeMaintenance,
  serializeRequestSummary,
  serializeReview,
  type AssetDetailResponse,
  type AssetSummaryResponse,
  type MaintenanceResponse,
  type RatingSummary,
  type RequestSummaryResponse,
  type ReviewResponse,
} from './assets.serializers';

/** Request statuses under which an asset is promised to or held by a requester. */
const HOLDING_STATUSES = [RequestStatus.APPROVED, RequestStatus.ALLOCATED, RequestStatus.RETURN_PENDING];

function assetRepo() {
  return AppDataSource.getRepository(Asset);
}

function isStaff(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.IT_STAFF;
}

const SORT_COLUMNS: Record<ListAssetsQuery['sort'], string> = {
  createdAt: 'asset.createdAt',
  name: 'asset.name',
  purchaseDate: 'asset.purchaseDate',
  status: 'asset.status',
};

/** One grouped query for the average rating / review count of a set of assets (shared with the dashboard). */
export async function ratingsFor(assetIds: string[]): Promise<Map<string, RatingSummary>> {
  const map = new Map<string, RatingSummary>();
  if (assetIds.length === 0) return map;
  const rows: { assetId: string; avg: string; count: string }[] = await AppDataSource.getRepository(Review)
    .createQueryBuilder('review')
    .select('review.assetId', 'assetId')
    .addSelect('AVG(review.rating)', 'avg')
    .addSelect('COUNT(*)', 'count')
    .where('review.assetId IN (:...assetIds)', { assetIds })
    .groupBy('review.assetId')
    .getRawMany();
  for (const r of rows) {
    map.set(r.assetId, { avgRating: Math.round(Number(r.avg) * 10) / 10, reviewCount: Number(r.count) });
  }
  return map;
}

export function ratingOf(map: Map<string, RatingSummary>, assetId: string): RatingSummary {
  return map.get(assetId) ?? { avgRating: null, reviewCount: 0 };
}

export async function list(query: ListAssetsQuery, caller: AuthUser): Promise<{ data: AssetSummaryResponse[]; meta: PageMeta }> {
  const qb = assetRepo()
    .createQueryBuilder('asset')
    .innerJoinAndSelect('asset.category', 'category')
    .innerJoinAndSelect('asset.managedBy', 'managedBy');

  // Employees never see retired units.
  let statuses = query.availableOnly ? [AssetStatus.AVAILABLE] : query.status;
  if (!isStaff(caller)) {
    statuses = statuses ? statuses.filter((s) => s !== AssetStatus.RETIRED) : undefined;
    if (statuses && statuses.length === 0) {
      return { data: [], meta: buildMeta(query.page, query.limit, 0) };
    }
    qb.andWhere('asset.status != :retired', { retired: AssetStatus.RETIRED });
  }
  if (statuses) qb.andWhere('asset.status IN (:...statuses)', { statuses });
  if (query.condition) qb.andWhere('asset.condition IN (:...conditions)', { conditions: query.condition });
  if (query.categoryId) qb.andWhere('asset.categoryId = :categoryId', { categoryId: query.categoryId });
  if (query.managedById) qb.andWhere('asset.managedById = :managedById', { managedById: query.managedById });
  if (query.purchasedFrom) qb.andWhere('asset.purchaseDate >= :from', { from: query.purchasedFrom });
  if (query.purchasedTo) qb.andWhere('asset.purchaseDate <= :to', { to: query.purchasedTo });
  if (query.search) {
    qb.andWhere('(asset.name ILIKE :kw OR asset.description ILIKE :kw OR asset.serialNumber ILIKE :kw)', {
      kw: `%${query.search}%`,
    });
  }

  qb.orderBy(SORT_COLUMNS[query.sort], query.order.toUpperCase() as 'ASC' | 'DESC', 'NULLS LAST')
    .addOrderBy('asset.id', 'ASC')
    .skip(toSkip(query.page, query.limit))
    .take(query.limit);

  const [assets, total] = await qb.getManyAndCount();
  const ratings = await ratingsFor(assets.map((a) => a.id));
  return {
    data: assets.map((a) => serializeAssetSummary(a, ratingOf(ratings, a.id))),
    meta: buildMeta(query.page, query.limit, total),
  };
}

/** Loads an asset with its relations; employees get 404 for retired units. */
async function findVisible(id: string, caller: AuthUser): Promise<Asset> {
  const asset = await assetRepo().findOne({ where: { id }, relations: { category: true, managedBy: true } });
  if (!asset || (!isStaff(caller) && asset.status === AssetStatus.RETIRED)) {
    throw new NotFoundError('Asset not found');
  }
  return asset;
}

async function activeRequestFor(assetId: string): Promise<RequestSummaryResponse | null> {
  const request = await AppDataSource.getRepository(AssetRequest).findOne({
    where: { assetId, status: In(HOLDING_STATUSES) },
    relations: { asset: true, requester: true },
  });
  return request ? serializeRequestSummary(request) : null;
}

async function recentMaintenanceFor(assetId: string): Promise<MaintenanceResponse[]> {
  const records = await AppDataSource.getRepository(MaintenanceRecord).find({
    where: { assetId },
    relations: { asset: true, createdBy: true },
    order: { startedAt: 'DESC' },
    take: 5,
  });
  return records.map(serializeMaintenance);
}

export async function getById(id: string, caller: AuthUser): Promise<AssetDetailResponse> {
  const asset = await findVisible(id, caller);
  const ratings = await ratingsFor([asset.id]);
  const detail: AssetDetailResponse = {
    ...serializeAssetSummary(asset, ratingOf(ratings, asset.id)),
    description: asset.description,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
  if (isStaff(caller)) {
    const [activeRequest, recentMaintenance] = await Promise.all([activeRequestFor(asset.id), recentMaintenanceFor(asset.id)]);
    detail.activeRequest = activeRequest;
    detail.recentMaintenance = recentMaintenance;
  }
  return detail;
}

async function assertSerialAvailable(serialNumber: string, exceptId?: string): Promise<void> {
  const clash = await assetRepo().findOne({ where: { serialNumber } });
  if (clash && clash.id !== exceptId) {
    throw new ConflictError('An asset with this serial number already exists', 'SERIAL_NUMBER_TAKEN');
  }
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const exists = await AppDataSource.getRepository(Category).exist({ where: { id: categoryId } });
  if (!exists) throw new NotFoundError('Category not found');
}

/** managedBy must be an active IT_STAFF user (business-rules §3.4). */
async function resolveManager(managedById: string | undefined, caller: AuthUser): Promise<string> {
  if (!managedById) {
    if (caller.role === UserRole.IT_STAFF) return caller.id;
    throw new BadRequestError('managedById is required', 'VALIDATION_ERROR', [
      { path: 'managedById', message: 'Admins must specify the IT Staff member who manages this asset' },
    ]);
  }
  const manager = await AppDataSource.getRepository(User).findOne({ where: { id: managedById } });
  if (!manager || manager.role !== UserRole.IT_STAFF || !manager.isActive) {
    throw new BadRequestError('managedById must reference an active IT Staff user', 'INVALID_MANAGER');
  }
  return manager.id;
}

export async function create(input: CreateAssetInput, caller: AuthUser): Promise<AssetDetailResponse> {
  await assertCategoryExists(input.categoryId);
  const managedById = await resolveManager(input.managedById, caller);
  await assertSerialAvailable(input.serialNumber);

  const asset = assetRepo().create({
    name: input.name,
    description: input.description,
    serialNumber: input.serialNumber,
    categoryId: input.categoryId,
    managedById,
    condition: input.condition,
    purchaseDate: input.purchaseDate ?? null,
    maxLoanDays: input.maxLoanDays ?? null,
    location: input.location ?? null,
    status: AssetStatus.AVAILABLE,
    imageUrl: null,
  });
  const saved = await assetRepo().save(asset);
  return getById(saved.id, caller);
}

export async function update(id: string, input: UpdateAssetInput, caller: AuthUser): Promise<AssetDetailResponse> {
  const asset = await findVisible(id, caller);

  if (input.categoryId !== undefined && input.categoryId !== asset.categoryId) {
    await assertCategoryExists(input.categoryId);
    asset.categoryId = input.categoryId;
  }
  if (input.managedById !== undefined) {
    asset.managedById = await resolveManager(input.managedById, caller);
  }
  if (input.serialNumber !== undefined && input.serialNumber !== asset.serialNumber) {
    await assertSerialAvailable(input.serialNumber, id);
    asset.serialNumber = input.serialNumber;
  }
  if (input.name !== undefined) asset.name = input.name;
  if (input.description !== undefined) asset.description = input.description;
  if (input.condition !== undefined) asset.condition = input.condition;
  if (input.purchaseDate !== undefined) asset.purchaseDate = input.purchaseDate;
  if (input.maxLoanDays !== undefined) asset.maxLoanDays = input.maxLoanDays;
  if (input.location !== undefined) asset.location = input.location;

  await assetRepo().save(asset);
  return getById(id, caller);
}

export async function setImage(id: string, filename: string, caller: AuthUser): Promise<AssetDetailResponse> {
  const newUrl = `${ASSET_IMAGE_URL_PREFIX}${filename}`;
  let asset: Asset;
  try {
    asset = await findVisible(id, caller);
    if (asset.status === AssetStatus.RETIRED) {
      throw new BadRequestError('Retired assets cannot be updated', 'ASSET_RETIRED');
    }
  } catch (err) {
    await removeImageFile(newUrl); // never leave orphaned files behind
    throw err;
  }
  const previous = asset.imageUrl;
  asset.imageUrl = newUrl;
  await assetRepo().save(asset);
  if (previous && previous !== newUrl) await removeImageFile(previous);
  return getById(id, caller);
}

export async function clearImage(id: string, caller: AuthUser): Promise<AssetDetailResponse> {
  const asset = await findVisible(id, caller);
  if (asset.status === AssetStatus.RETIRED) {
    throw new BadRequestError('Retired assets cannot be updated', 'ASSET_RETIRED');
  }
  const previous = asset.imageUrl;
  asset.imageUrl = null;
  await assetRepo().save(asset);
  await removeImageFile(previous);
  return getById(id, caller);
}

/** AVAILABLE → RETIRED, or UNDER_MAINTENANCE (with no OPEN record) → RETIRED. Transaction + row lock. */
export async function retire(id: string, caller: AuthUser): Promise<AssetDetailResponse> {
  await AppDataSource.transaction(async (em) => {
    const asset = await em.getRepository(Asset).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!asset) throw new NotFoundError('Asset not found');

    if (asset.status === AssetStatus.UNDER_MAINTENANCE) {
      const open = await em.getRepository(MaintenanceRecord).count({ where: { assetId: id, status: MaintenanceStatus.OPEN } });
      if (open > 0) {
        throw new ConflictError('Complete or cancel the open maintenance record before retiring', 'INVALID_STATE_TRANSITION');
      }
    } else if (asset.status !== AssetStatus.AVAILABLE) {
      throw new ConflictError(`Cannot retire an asset with status ${asset.status}`, 'INVALID_STATE_TRANSITION');
    }

    asset.status = AssetStatus.RETIRED;
    await em.getRepository(Asset).save(asset);
  });
  return getById(id, caller);
}

/** Hard delete only when the unit has no request or maintenance history at all. */
export async function remove(id: string, caller: AuthUser): Promise<void> {
  const asset = await findVisible(id, caller);
  const [requests, maintenance] = await Promise.all([
    AppDataSource.getRepository(AssetRequest).count({ where: { assetId: id } }),
    AppDataSource.getRepository(MaintenanceRecord).count({ where: { assetId: id } }),
  ]);
  if (requests > 0 || maintenance > 0) {
    throw new ConflictError('Asset has request or maintenance history; retire it instead', 'ASSET_HAS_HISTORY');
  }
  await assetRepo().remove(asset);
  await removeImageFile(asset.imageUrl);
}

/** Sort direction for the history lists; `id` is always the secondary key for stable paging. */
function direction(order: 'asc' | 'desc'): 'ASC' | 'DESC' {
  return order === 'asc' ? 'ASC' : 'DESC';
}

export async function listRequests(id: string, query: AssetRequestsQuery, caller: AuthUser): Promise<{ data: RequestSummaryResponse[]; meta: PageMeta }> {
  await findVisible(id, caller);
  const [rows, total] = await AppDataSource.getRepository(AssetRequest).findAndCount({
    where: { assetId: id, ...(query.status ? { status: query.status } : {}) },
    relations: { asset: true, requester: true },
    order: { createdAt: direction(query.order), id: 'ASC' },
    skip: toSkip(query.page, query.limit),
    take: query.limit,
  });
  return { data: rows.map(serializeRequestSummary), meta: buildMeta(query.page, query.limit, total) };
}

export async function listMaintenance(id: string, query: AssetMaintenanceQuery, caller: AuthUser): Promise<{ data: MaintenanceResponse[]; meta: PageMeta }> {
  await findVisible(id, caller);
  const [rows, total] = await AppDataSource.getRepository(MaintenanceRecord).findAndCount({
    where: { assetId: id, ...(query.status ? { status: query.status } : {}) },
    relations: { asset: true, createdBy: true },
    order: { startedAt: direction(query.order), id: 'ASC' },
    skip: toSkip(query.page, query.limit),
    take: query.limit,
  });
  return { data: rows.map(serializeMaintenance), meta: buildMeta(query.page, query.limit, total) };
}

export async function listReviews(
  id: string,
  query: AssetReviewsQuery,
  caller: AuthUser,
): Promise<{ data: ReviewResponse[]; meta: PageMeta; summary: RatingSummary }> {
  await findVisible(id, caller);
  const [rows, total] = await AppDataSource.getRepository(Review).findAndCount({
    where: { assetId: id },
    relations: { reviewer: true, asset: true },
    order: { createdAt: direction(query.order), id: 'ASC' },
    skip: toSkip(query.page, query.limit),
    take: query.limit,
  });
  const ratings = await ratingsFor([id]);
  return { data: rows.map(serializeReview), meta: buildMeta(query.page, query.limit, total), summary: ratingOf(ratings, id) };
}
