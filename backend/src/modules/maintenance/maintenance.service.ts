import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Asset } from '../../entities/Asset';
import { MaintenanceRecord } from '../../entities/MaintenanceRecord';
import { AssetStatus, MaintenanceStatus } from '../../common/enums';
import type { AuthUser } from '../../common/types';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors';
import { buildMeta, toSkip, type PageMeta } from '../../common/pagination';
import { startOfDayISO, startOfNextDayISO } from '../../common/schemas';
import { assertTransition } from '../../common/stateMachine';
import { logger } from '../../common/logger';
import { serializeMaintenance, type MaintenanceResponse } from '../assets/assets.serializers';
import type { CompleteMaintenanceInput, CreateMaintenanceInput, ListMaintenanceQuery, UpdateMaintenanceInput } from './maintenance.schemas';

const SORT_COLUMNS: Record<ListMaintenanceQuery['sort'], string> = {
  startedAt: 'record.startedAt',
  completedAt: 'record.completedAt',
  cost: 'record.cost',
};

function repo() {
  return AppDataSource.getRepository(MaintenanceRecord);
}

/** numeric(10,2) is read back as a string; store with two decimals for consistency. */
function toCostColumn(cost: number | null | undefined): string | null | undefined {
  if (cost === undefined) return undefined;
  return cost === null ? null : cost.toFixed(2);
}

async function loadDetail(id: string, em: EntityManager = AppDataSource.manager): Promise<MaintenanceRecord> {
  const record = await em.getRepository(MaintenanceRecord).findOne({ where: { id }, relations: { asset: true, createdBy: true } });
  if (!record) throw new NotFoundError('Maintenance record not found');
  return record;
}

// ---------------------------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------------------------

export async function list(query: ListMaintenanceQuery): Promise<{ data: MaintenanceResponse[]; meta: PageMeta }> {
  const qb = repo().createQueryBuilder('record').innerJoinAndSelect('record.asset', 'asset').innerJoinAndSelect('record.createdBy', 'createdBy');

  if (query.assetId) qb.andWhere('record.assetId = :assetId', { assetId: query.assetId });
  if (query.status) qb.andWhere('record.status IN (:...statuses)', { statuses: query.status });
  if (query.type) qb.andWhere('record.type IN (:...types)', { types: query.type });
  if (query.from) qb.andWhere('record.startedAt >= :from', { from: startOfDayISO(query.from) });
  if (query.to) qb.andWhere('record.startedAt < :to', { to: startOfNextDayISO(query.to) });
  if (query.search) qb.andWhere('(asset.name ILIKE :kw OR asset.serialNumber ILIKE :kw)', { kw: `%${query.search}%` });

  qb.orderBy(SORT_COLUMNS[query.sort], query.order.toUpperCase() as 'ASC' | 'DESC', 'NULLS LAST')
    .addOrderBy('record.id', 'ASC')
    .skip(toSkip(query.page, query.limit))
    .take(query.limit);

  const [rows, total] = await qb.getManyAndCount();
  return { data: rows.map(serializeMaintenance), meta: buildMeta(query.page, query.limit, total) };
}

export async function getById(id: string): Promise<MaintenanceResponse> {
  return serializeMaintenance(await loadDetail(id));
}

// ---------------------------------------------------------------------------------------------
// Open (business-rules §3.12): transaction + pessimistic write lock on the asset row.
// ---------------------------------------------------------------------------------------------

export async function open(input: CreateMaintenanceInput, caller: AuthUser): Promise<MaintenanceResponse> {
  const id = await AppDataSource.transaction(async (em) => {
    const asset = await em.getRepository(Asset).findOne({ where: { id: input.assetId }, lock: { mode: 'pessimistic_write' } });
    if (!asset) throw new NotFoundError('Asset not found');

    if (asset.status === AssetStatus.UNDER_MAINTENANCE) {
      // Reachable without an OPEN record only through a DAMAGED return (§3.11).
      const alreadyOpen = await em.getRepository(MaintenanceRecord).exist({ where: { assetId: asset.id, status: MaintenanceStatus.OPEN } });
      if (alreadyOpen) throw new ConflictError('This asset already has an open maintenance record', 'MAINTENANCE_ALREADY_OPEN');
    } else if (asset.status !== AssetStatus.AVAILABLE) {
      throw new ConflictError(`Asset is ${asset.status.toLowerCase().replace('_', ' ')}; maintenance can only be opened on an available unit`, 'ASSET_NOT_AVAILABLE');
    } else {
      assertTransition('asset', asset.status, AssetStatus.UNDER_MAINTENANCE);
      asset.status = AssetStatus.UNDER_MAINTENANCE;
      await em.getRepository(Asset).save(asset);
    }

    const record = await em.getRepository(MaintenanceRecord).save(
      em.getRepository(MaintenanceRecord).create({
        assetId: asset.id,
        createdById: caller.id,
        type: input.type,
        description: input.description,
        cost: toCostColumn(input.cost) ?? null,
        status: MaintenanceStatus.OPEN,
        startedAt: new Date(),
        completedAt: null,
        resultingCondition: null,
      }),
    );
    return record.id;
  });
  return getById(id);
}

// ---------------------------------------------------------------------------------------------
// Edit (plain update, §3.14): description / cost / type on OPEN or COMPLETED records.
// ---------------------------------------------------------------------------------------------

export async function update(id: string, input: UpdateMaintenanceInput): Promise<MaintenanceResponse> {
  const record = await loadDetail(id);
  if (input.description !== undefined) record.description = input.description;
  if (input.type !== undefined) record.type = input.type;
  const cost = toCostColumn(input.cost);
  if (cost !== undefined) record.cost = cost;
  await repo().save(record);
  return getById(id);
}

// ---------------------------------------------------------------------------------------------
// Locked transitions (architecture §3.10): lock the asset row, then re-read the record.
// ---------------------------------------------------------------------------------------------

interface Locked {
  em: EntityManager;
  record: MaintenanceRecord;
  asset: Asset;
}

async function withAssetLock<T>(recordId: string, fn: (ctx: Locked) => Promise<T>): Promise<T> {
  return AppDataSource.transaction(async (em) => {
    const preview = await em.getRepository(MaintenanceRecord).findOne({ where: { id: recordId } });
    if (!preview) throw new NotFoundError('Maintenance record not found');
    const asset = await em.getRepository(Asset).findOne({ where: { id: preview.assetId }, lock: { mode: 'pessimistic_write' } });
    if (!asset) throw new NotFoundError('Asset not found');
    const record = await em.getRepository(MaintenanceRecord).findOneOrFail({ where: { id: recordId } });
    return fn({ em, record, asset });
  });
}

function invariantViolation(record: MaintenanceRecord, asset: Asset): ConflictError {
  logger.error(`Invariant violation: maintenance ${record.id} is OPEN but asset ${asset.id} is ${asset.status} (expected UNDER_MAINTENANCE)`);
  return new ConflictError(`Asset is ${asset.status}, expected UNDER_MAINTENANCE; contact an administrator`, 'INVARIANT_VIOLATION');
}

export async function complete(id: string, input: CompleteMaintenanceInput): Promise<MaintenanceResponse> {
  await withAssetLock(id, async ({ em, record, asset }) => {
    assertTransition('maintenance', record.status, MaintenanceStatus.COMPLETED);
    if (asset.status !== AssetStatus.UNDER_MAINTENANCE) throw invariantViolation(record, asset);

    const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();
    if (completedAt < record.startedAt) {
      throw new BadRequestError('completedAt cannot be before the record was opened', 'VALIDATION_ERROR', [
        { path: 'completedAt', message: `Must be on or after ${record.startedAt.toISOString()}` },
      ]);
    }

    const target = input.retire ? AssetStatus.RETIRED : AssetStatus.AVAILABLE;
    assertTransition('asset', asset.status, target);

    record.status = MaintenanceStatus.COMPLETED;
    record.completedAt = completedAt;
    record.resultingCondition = input.resultingCondition;
    const cost = toCostColumn(input.cost);
    if (cost !== undefined) record.cost = cost;

    asset.condition = input.resultingCondition;
    asset.status = target;

    await em.getRepository(Asset).save(asset);
    await em.getRepository(MaintenanceRecord).save(record);
  });
  return getById(id);
}

/** Only OPEN records ("opened by mistake") can be removed; the asset returns to AVAILABLE. */
export async function remove(id: string): Promise<void> {
  await withAssetLock(id, async ({ em, record, asset }) => {
    if (record.status !== MaintenanceStatus.OPEN) {
      throw new ConflictError('Completed maintenance records are immutable and cannot be deleted', 'RECORD_IMMUTABLE');
    }
    if (asset.status !== AssetStatus.UNDER_MAINTENANCE) throw invariantViolation(record, asset);
    assertTransition('asset', asset.status, AssetStatus.AVAILABLE);
    asset.status = AssetStatus.AVAILABLE;
    await em.getRepository(Asset).save(asset);
    await em.getRepository(MaintenanceRecord).remove(record);
  });
}
