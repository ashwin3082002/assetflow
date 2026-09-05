import { AppDataSource } from '../../config/data-source';
import { AssetRequest } from '../../entities/AssetRequest';
import { Review } from '../../entities/Review';
import { RequestStatus, UserRole } from '../../common/enums';
import type { AuthUser } from '../../common/types';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { buildMeta, toSkip, type PageMeta } from '../../common/pagination';
import { serializeReview, type ReviewResponse } from '../assets/assets.serializers';
import type { CreateReviewInput, ListReviewsQuery } from './reviews.schemas';

const SORT_COLUMNS: Record<ListReviewsQuery['sort'], string> = {
  createdAt: 'review.createdAt',
  rating: 'review.rating',
};

function repo() {
  return AppDataSource.getRepository(Review);
}

function isStaff(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.IT_STAFF;
}

async function loadDetail(id: string): Promise<Review> {
  const review = await repo().findOne({ where: { id }, relations: { reviewer: true, asset: true } });
  if (!review) throw new NotFoundError('Review not found');
  return review;
}

/**
 * business-rules §3.15: one review per COMPLETED request, by its requester. Plain insert; the
 * unique index on request_id is the backstop (a race surfaces as 409 CONFLICT from the DB).
 */
export async function create(input: CreateReviewInput, caller: AuthUser): Promise<ReviewResponse> {
  const request = await AppDataSource.getRepository(AssetRequest).findOne({ where: { id: input.requestId } });
  if (!request) throw new NotFoundError('Request not found');
  if (request.requesterId !== caller.id) throw new ForbiddenError('You can only review your own requests');
  if (request.status !== RequestStatus.COMPLETED) {
    throw new ConflictError('Only completed requests can be reviewed', 'REQUEST_NOT_COMPLETED');
  }
  if (await repo().exist({ where: { requestId: request.id } })) {
    throw new ConflictError('This request has already been reviewed', 'REVIEW_EXISTS');
  }

  const saved = await repo().save(
    repo().create({
      requestId: request.id,
      assetId: request.assetId,
      reviewerId: caller.id,
      rating: input.rating,
      comment: input.comment ?? null,
    }),
  );
  return serializeReview(await loadDetail(saved.id));
}

export async function list(query: ListReviewsQuery, caller: AuthUser): Promise<{ data: ReviewResponse[]; meta: PageMeta }> {
  let reviewerId = query.reviewerId;
  if (!isStaff(caller)) {
    if (reviewerId && reviewerId !== caller.id) throw new ForbiddenError('Employees can only list their own reviews');
    reviewerId = caller.id;
  }

  const qb = repo().createQueryBuilder('review').innerJoinAndSelect('review.reviewer', 'reviewer').innerJoinAndSelect('review.asset', 'asset');
  if (reviewerId) qb.andWhere('review.reviewerId = :reviewerId', { reviewerId });
  if (query.assetId) qb.andWhere('review.assetId = :assetId', { assetId: query.assetId });
  if (query.minRating !== undefined) qb.andWhere('review.rating >= :minRating', { minRating: query.minRating });

  qb.orderBy(SORT_COLUMNS[query.sort], query.order.toUpperCase() as 'ASC' | 'DESC')
    .addOrderBy('review.id', 'ASC')
    .skip(toSkip(query.page, query.limit))
    .take(query.limit);

  const [rows, total] = await qb.getManyAndCount();
  return { data: rows.map(serializeReview), meta: buildMeta(query.page, query.limit, total) };
}
