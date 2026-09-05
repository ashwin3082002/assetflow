import { z } from 'zod';

export const PAGINATION_DEFAULT_LIMIT = 10;
export const PAGINATION_MAX_LIMIT = 100;

/** Base query schema for list endpoints: page, limit and order. Extend per endpoint with `sortSchema`. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Whitelisted sort field schema; anything outside the list fails validation (400). */
export function sortSchema<const T extends readonly [string, ...string[]]>(fields: T, defaultField: T[number]) {
  return z.enum(fields).default(defaultField);
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function buildMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) };
}

export function toSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
