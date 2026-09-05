import { In, type EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { Asset } from '../../entities/Asset';
import { AssetRequest } from '../../entities/AssetRequest';
import { AssetCondition, AssetStatus, RequestStatus, UserRole } from '../../common/enums';
import type { AuthUser } from '../../common/types';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { buildMeta, toSkip, type PageMeta } from '../../common/pagination';
import { startOfDayISO, startOfNextDayISO, todayISO } from '../../common/schemas';
import { assertTransition } from '../../common/stateMachine';
import { logger } from '../../common/logger';
import { serializeRequestDetail, serializeRequestSummary, type RequestDetailResponse, type RequestSummaryResponse } from '../assets/assets.serializers';
import type { CompleteRequestInput, CreateRequestInput, ListRequestsQuery, RejectRequestInput } from './requests.schemas';

/** Statuses that count towards an employee's active-request cap and the per-asset duplicate guard. */
export const ACTIVE_STATUSES = [RequestStatus.PENDING, RequestStatus.APPROVED, RequestStatus.ALLOCATED, RequestStatus.RETURN_PENDING];

const OVERDUE_STATUSES = [RequestStatus.ALLOCATED, RequestStatus.RETURN_PENDING];

const SORT_COLUMNS: Record<ListRequestsQuery['sort'], string> = {
  createdAt: 'request.createdAt',
  expectedReturnDate: 'request.expectedReturnDate',
  status: 'request.status',
};

function repo() {
  return AppDataSource.getRepository(AssetRequest);
}

function isStaff(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.IT_STAFF;
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

async function loadDetail(id: string, em: EntityManager = AppDataSource.manager): Promise<AssetRequest> {
  const request = await em.getRepository(AssetRequest).findOne({
    where: { id },
    relations: { asset: true, requester: true, processedBy: true, review: true },
  });
  if (!request) throw new NotFoundError('Request not found');
  return request;
}

function assertOwner(request: AssetRequest, caller: AuthUser): void {
  if (request.requesterId !== caller.id) throw new ForbiddenError('You can only act on your own requests');
}

// ---------------------------------------------------------------------------------------------
// Create (business-rules §3.5): plain insert; the partial unique index is the concurrency backstop.
// ---------------------------------------------------------------------------------------------

export async function create(input: CreateRequestInput, caller: AuthUser): Promise<RequestDetailResponse> {
  const asset = await AppDataSource.getRepository(Asset).findOne({ where: { id: input.assetId } });
  if (!asset || asset.status === AssetStatus.RETIRED) throw new NotFoundError('Asset not found');

  if (asset.status !== AssetStatus.AVAILABLE) {
    throw new ConflictError(`Asset is ${asset.status.toLowerCase().replace('_', ' ')} and cannot be requested`, 'ASSET_NOT_AVAILABLE');
  }

  if (asset.maxLoanDays !== null && daysBetween(input.requestedFrom, input.expectedReturnDate) > asset.maxLoanDays) {
    throw new BadRequestError(`This asset can be loaned for at most ${asset.maxLoanDays} day(s)`, 'LOAN_PERIOD_EXCEEDED', [
      { path: 'expectedReturnDate', message: `Loan period exceeds the ${asset.maxLoanDays}-day limit` },
    ]);
  }

  const duplicate = await repo().exist({ where: { assetId: asset.id, requesterId: caller.id, status: In(ACTIVE_STATUSES) } });
  if (duplicate) throw new ConflictError('You already have an active request for this asset', 'DUPLICATE_REQUEST');

  const active = await repo().count({ where: { requesterId: caller.id, status: In(ACTIVE_STATUSES) } });
  if (active >= env.MAX_ACTIVE_REQUESTS) {
    throw new ConflictError(`You already have ${active} active requests (limit ${env.MAX_ACTIVE_REQUESTS})`, 'ACTIVE_REQUEST_LIMIT');
  }

  const saved = await repo().save(
    repo().create({
      assetId: asset.id,
      requesterId: caller.id,
      purpose: input.purpose,
      requestedFrom: input.requestedFrom,
      expectedReturnDate: input.expectedReturnDate,
      status: RequestStatus.PENDING,
    }),
  );
  return serializeRequestDetail(await loadDetail(saved.id));
}

// ---------------------------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------------------------

export async function list(query: ListRequestsQuery, caller: AuthUser): Promise<{ data: RequestSummaryResponse[]; meta: PageMeta }> {
  let requesterId = query.requesterId;
  if (!isStaff(caller)) {
    if (requesterId && requesterId !== caller.id) throw new ForbiddenError('Employees can only list their own requests');
    requesterId = caller.id;
  }

  const qb = repo()
    .createQueryBuilder('request')
    .innerJoinAndSelect('request.asset', 'asset')
    .innerJoinAndSelect('request.requester', 'requester');

  if (requesterId) qb.andWhere('request.requesterId = :requesterId', { requesterId });
  if (query.assetId) qb.andWhere('request.assetId = :assetId', { assetId: query.assetId });
  if (query.status) qb.andWhere('request.status IN (:...statuses)', { statuses: query.status });
  if (query.overdue) {
    qb.andWhere('request.status IN (:...overdueStatuses)', { overdueStatuses: OVERDUE_STATUSES }).andWhere(
      'request.expectedReturnDate < :today',
      { today: todayISO() },
    );
  }
  if (query.from) qb.andWhere('request.createdAt >= :from', { from: startOfDayISO(query.from) });
  if (query.to) qb.andWhere('request.createdAt < :to', { to: startOfNextDayISO(query.to) });
  if (query.search) {
    qb.andWhere('(asset.name ILIKE :kw OR requester.fullName ILIKE :kw)', { kw: `%${query.search}%` });
  }

  qb.orderBy(SORT_COLUMNS[query.sort], query.order.toUpperCase() as 'ASC' | 'DESC')
    .addOrderBy('request.id', 'ASC')
    .skip(toSkip(query.page, query.limit))
    .take(query.limit);

  const [rows, total] = await qb.getManyAndCount();
  return { data: rows.map(serializeRequestSummary), meta: buildMeta(query.page, query.limit, total) };
}

export async function getById(id: string, caller: AuthUser): Promise<RequestDetailResponse> {
  const request = await loadDetail(id);
  if (!isStaff(caller)) assertOwner(request, caller);
  return serializeRequestDetail(request);
}

// ---------------------------------------------------------------------------------------------
// Single-row transitions (no lock). The `status` predicate in the UPDATE makes them race-safe.
// ---------------------------------------------------------------------------------------------

async function guardedUpdate(id: string, from: RequestStatus, patch: Partial<AssetRequest>): Promise<void> {
  const result = await repo().update({ id, status: from }, patch);
  if (!result.affected) {
    // The row changed under us (another transition committed first): report the current state.
    const current = await repo().findOne({ where: { id } });
    if (!current) throw new NotFoundError('Request not found');
    throw new ConflictError(`Request is now ${current.status}`, 'INVALID_STATE_TRANSITION');
  }
}

// ---------------------------------------------------------------------------------------------
// Locked transitions (architecture §3.10): transaction + pessimistic write lock on the asset row,
// then the request row is re-read so the status check sees the latest committed state.
// ---------------------------------------------------------------------------------------------

interface Locked {
  em: EntityManager;
  request: AssetRequest;
  asset: Asset;
}

async function withAssetLock<T>(requestId: string, fn: (ctx: Locked) => Promise<T>): Promise<T> {
  return AppDataSource.transaction(async (em) => {
    const preview = await em.getRepository(AssetRequest).findOne({ where: { id: requestId } });
    if (!preview) throw new NotFoundError('Request not found');
    const asset = await em.getRepository(Asset).findOne({ where: { id: preview.assetId }, lock: { mode: 'pessimistic_write' } });
    if (!asset) throw new NotFoundError('Asset not found');
    const request = await em.getRepository(AssetRequest).findOneOrFail({ where: { id: requestId } });
    return fn({ em, request, asset });
  });
}

async function saveBoth({ em, request, asset }: Locked): Promise<void> {
  await em.getRepository(Asset).save(asset);
  await em.getRepository(AssetRequest).save(request);
}

function invariantViolation(request: AssetRequest, asset: Asset, expected: AssetStatus): ConflictError {
  logger.error(`Invariant violation: request ${request.id} is ${request.status} but asset ${asset.id} is ${asset.status} (expected ${expected})`);
  return new ConflictError(`Asset is ${asset.status}, expected ${expected}; contact an administrator`, 'INVARIANT_VIOLATION');
}

export async function approve(id: string, caller: AuthUser): Promise<RequestDetailResponse> {
  await withAssetLock(id, async (ctx) => {
    const { request, asset } = ctx;
    assertTransition('request', request.status, RequestStatus.APPROVED);
    if (asset.status !== AssetStatus.AVAILABLE) {
      throw new ConflictError('The asset is no longer available; reject this request or wait until it is returned', 'ASSET_NOT_AVAILABLE');
    }
    assertTransition('asset', asset.status, AssetStatus.RESERVED);
    request.status = RequestStatus.APPROVED;
    request.approvedAt = new Date();
    request.processedById = caller.id;
    asset.status = AssetStatus.RESERVED;
    await saveBoth(ctx);
  });
  return serializeRequestDetail(await loadDetail(id));
}

export async function reject(id: string, input: RejectRequestInput, caller: AuthUser): Promise<RequestDetailResponse> {
  const current = await loadDetail(id);
  assertTransition('request', current.status, RequestStatus.REJECTED);
  const patch: Partial<AssetRequest> = {
    status: RequestStatus.REJECTED,
    rejectedAt: new Date(),
    rejectionReason: input.reason,
    processedById: caller.id,
  };

  if (current.status === RequestStatus.PENDING) {
    await guardedUpdate(id, RequestStatus.PENDING, patch);
  } else {
    // APPROVED → REJECTED releases the reserved unit.
    await withAssetLock(id, async (ctx) => {
      const { request, asset } = ctx;
      assertTransition('request', request.status, RequestStatus.REJECTED);
      if (request.status === RequestStatus.APPROVED) {
        if (asset.status !== AssetStatus.RESERVED) throw invariantViolation(request, asset, AssetStatus.RESERVED);
        asset.status = AssetStatus.AVAILABLE;
      }
      Object.assign(request, patch);
      await saveBoth(ctx);
    });
  }
  return serializeRequestDetail(await loadDetail(id));
}

export async function cancel(id: string, caller: AuthUser): Promise<RequestDetailResponse> {
  const current = await loadDetail(id);
  assertOwner(current, caller);
  assertTransition('request', current.status, RequestStatus.CANCELLED);
  const patch: Partial<AssetRequest> = { status: RequestStatus.CANCELLED, cancelledAt: new Date() };

  if (current.status === RequestStatus.PENDING) {
    await guardedUpdate(id, RequestStatus.PENDING, patch);
  } else {
    await withAssetLock(id, async (ctx) => {
      const { request, asset } = ctx;
      assertTransition('request', request.status, RequestStatus.CANCELLED);
      if (request.status === RequestStatus.APPROVED) {
        if (asset.status !== AssetStatus.RESERVED) throw invariantViolation(request, asset, AssetStatus.RESERVED);
        asset.status = AssetStatus.AVAILABLE;
      }
      Object.assign(request, patch);
      await saveBoth(ctx);
    });
  }
  return serializeRequestDetail(await loadDetail(id));
}

export async function allocate(id: string, caller: AuthUser): Promise<RequestDetailResponse> {
  await withAssetLock(id, async (ctx) => {
    const { request, asset } = ctx;
    assertTransition('request', request.status, RequestStatus.ALLOCATED);
    if (asset.status !== AssetStatus.RESERVED) throw invariantViolation(request, asset, AssetStatus.RESERVED);
    request.status = RequestStatus.ALLOCATED;
    request.allocatedAt = new Date();
    request.processedById = caller.id;
    asset.status = AssetStatus.ALLOCATED;
    await saveBoth(ctx);
  });
  return serializeRequestDetail(await loadDetail(id));
}

export async function initiateReturn(id: string, caller: AuthUser): Promise<RequestDetailResponse> {
  const current = await loadDetail(id);
  assertOwner(current, caller);
  assertTransition('request', current.status, RequestStatus.RETURN_PENDING);
  await guardedUpdate(id, RequestStatus.ALLOCATED, { status: RequestStatus.RETURN_PENDING, returnInitiatedAt: new Date() });
  return serializeRequestDetail(await loadDetail(id));
}

/** Completing with DAMAGED sends the unit to UNDER_MAINTENANCE, never AVAILABLE (decided). */
export async function complete(id: string, input: CompleteRequestInput, caller: AuthUser): Promise<RequestDetailResponse> {
  await withAssetLock(id, async (ctx) => {
    const { request, asset } = ctx;
    assertTransition('request', request.status, RequestStatus.COMPLETED);
    if (asset.status !== AssetStatus.ALLOCATED) throw invariantViolation(request, asset, AssetStatus.ALLOCATED);

    request.status = RequestStatus.COMPLETED;
    request.completedAt = new Date();
    request.returnCondition = input.returnCondition;
    request.returnNotes = input.returnNotes ?? null;
    request.processedById = caller.id;

    asset.condition = input.returnCondition;
    asset.status = input.returnCondition === AssetCondition.DAMAGED ? AssetStatus.UNDER_MAINTENANCE : AssetStatus.AVAILABLE;
    await saveBoth(ctx);
  });
  return serializeRequestDetail(await loadDetail(id));
}
