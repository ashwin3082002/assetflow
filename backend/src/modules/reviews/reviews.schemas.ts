import { z } from 'zod';
import { paginationQuerySchema, sortSchema } from '../../common/pagination';

export const createReviewSchema = z
  .object({
    requestId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const listReviewsQuerySchema = paginationQuerySchema
  .extend({
    assetId: z.string().uuid().optional(),
    reviewerId: z.string().uuid().optional(),
    minRating: z.coerce.number().int().min(1).max(5).optional(),
    sort: sortSchema(['createdAt', 'rating'], 'createdAt'),
  })
  .strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
