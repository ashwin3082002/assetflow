import { z } from 'zod';
import { AssetCondition, MaintenanceStatus, MaintenanceType } from '../../common/enums';
import { paginationQuerySchema, sortSchema } from '../../common/pagination';
import { csvEnumSchema, dateStringSchema } from '../../common/schemas';

const costSchema = z.number().min(0).max(99_999_999.99);

export const createMaintenanceSchema = z
  .object({
    assetId: z.string().uuid(),
    type: z.nativeEnum(MaintenanceType),
    description: z.string().trim().min(5).max(2000),
    cost: costSchema.nullable().optional(),
  })
  .strict();

/** Editable on OPEN and COMPLETED records alike; status and dates never change through PATCH. */
export const updateMaintenanceSchema = z
  .object({
    description: z.string().trim().min(5).max(2000).optional(),
    cost: costSchema.nullable().optional(),
    type: z.nativeEnum(MaintenanceType).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const completeMaintenanceSchema = z
  .object({
    resultingCondition: z.nativeEnum(AssetCondition),
    cost: costSchema.nullable().optional(),
    completedAt: z
      .string()
      .datetime({ offset: true })
      .refine((v) => Date.parse(v) <= Date.now(), { message: 'completedAt cannot be in the future' })
      .optional(),
    retire: z.boolean().default(false),
  })
  .strict();

export const listMaintenanceQuerySchema = paginationQuerySchema
  .extend({
    assetId: z.string().uuid().optional(),
    status: csvEnumSchema(MaintenanceStatus),
    type: csvEnumSchema(MaintenanceType),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    search: z.string().trim().max(100).optional(),
    sort: sortSchema(['startedAt', 'completedAt', 'cost'], 'startedAt'),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from must be on or before to', path: ['to'] });

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;
export type CompleteMaintenanceInput = z.infer<typeof completeMaintenanceSchema>;
export type ListMaintenanceQuery = z.infer<typeof listMaintenanceQuerySchema>;
