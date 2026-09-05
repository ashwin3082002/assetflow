import { z } from 'zod';
import { UserRole } from '../../common/enums';
import { paginationQuerySchema, sortSchema } from '../../common/pagination';
import { booleanQuerySchema, departmentSchema, emailSchema, fullNameSchema, passwordSchema } from '../../common/schemas';

export const listUsersQuerySchema = paginationQuerySchema
  .extend({
    role: z.nativeEnum(UserRole).optional(),
    isActive: booleanQuerySchema,
    search: z.string().trim().max(100).optional(),
    sort: sortSchema(['createdAt', 'fullName', 'email', 'role'], 'createdAt'),
  })
  .strict();

export const createUserSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: z.nativeEnum(UserRole),
    department: departmentSchema,
  })
  .strict();

export const updateUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    department: departmentSchema,
    role: z.nativeEnum(UserRole).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
