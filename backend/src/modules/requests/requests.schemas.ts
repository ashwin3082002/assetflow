import { z } from 'zod';
import { AssetCondition, RequestStatus } from '../../common/enums';
import { paginationQuerySchema, sortSchema } from '../../common/pagination';
import { booleanQuerySchema, csvEnumSchema, dateStringSchema, todayISO } from '../../common/schemas';

export const createRequestSchema = z
  .object({
    assetId: z.string().uuid(),
    purpose: z.string().trim().min(5).max(500),
    requestedFrom: dateStringSchema.refine((v) => v >= todayISO(), { message: 'requestedFrom cannot be in the past' }),
    expectedReturnDate: dateStringSchema,
  })
  .strict()
  .refine((v) => v.expectedReturnDate >= v.requestedFrom, {
    message: 'expectedReturnDate must be on or after requestedFrom',
    path: ['expectedReturnDate'],
  });

export const listRequestsQuerySchema = paginationQuerySchema
  .extend({
    status: csvEnumSchema(RequestStatus),
    assetId: z.string().uuid().optional(),
    requesterId: z.string().uuid().optional(),
    overdue: booleanQuerySchema,
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    search: z.string().trim().max(100).optional(),
    sort: sortSchema(['createdAt', 'expectedReturnDate', 'status'], 'createdAt'),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from must be on or before to', path: ['to'] });

export const rejectRequestSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export const completeRequestSchema = z
  .object({
    returnCondition: z.nativeEnum(AssetCondition),
    returnNotes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;
export type RejectRequestInput = z.infer<typeof rejectRequestSchema>;
export type CompleteRequestInput = z.infer<typeof completeRequestSchema>;
