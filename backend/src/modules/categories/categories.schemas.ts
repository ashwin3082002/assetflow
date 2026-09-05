import { z } from 'zod';

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
