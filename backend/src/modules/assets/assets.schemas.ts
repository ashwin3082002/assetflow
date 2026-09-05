import { z } from 'zod';
import { AssetCondition, AssetStatus, MaintenanceStatus, RequestStatus } from '../../common/enums';
import { paginationQuerySchema, sortSchema } from '../../common/pagination';
import { booleanQuerySchema, csvEnumSchema, dateStringSchema, todayISO } from '../../common/schemas';

const purchaseDateSchema = dateStringSchema.refine((v) => v <= todayISO(), { message: 'purchaseDate cannot be in the future' });

/** `status` is deliberately absent: asset status only changes through workflows. */
export const createAssetSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(1).max(2000),
    serialNumber: z.string().trim().min(3).max(100),
    categoryId: z.string().uuid(),
    managedById: z.string().uuid().optional(),
    condition: z.nativeEnum(AssetCondition).optional(),
    purchaseDate: purchaseDateSchema.nullable().optional(),
    maxLoanDays: z.number().int().min(1).max(365).nullable().optional(),
    location: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

export const updateAssetSchema = createAssetSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const listAssetsQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().max(100).optional(),
    categoryId: z.string().uuid().optional(),
    status: csvEnumSchema(AssetStatus),
    condition: csvEnumSchema(AssetCondition),
    managedById: z.string().uuid().optional(),
    purchasedFrom: dateStringSchema.optional(),
    purchasedTo: dateStringSchema.optional(),
    availableOnly: booleanQuerySchema,
    sort: sortSchema(['createdAt', 'name', 'purchaseDate', 'status'], 'createdAt'),
  })
  .strict()
  .refine((q) => !q.purchasedFrom || !q.purchasedTo || q.purchasedFrom <= q.purchasedTo, {
    message: 'purchasedFrom must be on or before purchasedTo',
    path: ['purchasedTo'],
  });

/** Sub-resource history lists (`/assets/:id/requests`, `/maintenance`, `/reviews`): page, limit, order (+ enum status filter). */
export const assetRequestsQuerySchema = paginationQuerySchema.extend({ status: z.nativeEnum(RequestStatus).optional() }).strict();
export const assetMaintenanceQuerySchema = paginationQuerySchema.extend({ status: z.nativeEnum(MaintenanceStatus).optional() }).strict();
export const assetReviewsQuerySchema = paginationQuerySchema.strict();

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export type AssetRequestsQuery = z.infer<typeof assetRequestsQuerySchema>;
export type AssetMaintenanceQuery = z.infer<typeof assetMaintenanceQuerySchema>;
export type AssetReviewsQuery = z.infer<typeof assetReviewsQuerySchema>;
