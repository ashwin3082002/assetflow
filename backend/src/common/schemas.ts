import { z } from 'zod';

/** Shared zod building blocks used across modules. */

export const idParamSchema = z.object({ id: z.string().uuid('id must be a UUID') }).strict();

export const emailSchema = z.string().trim().toLowerCase().email().max(255);

/** At least 8 characters with at least one letter and one digit. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit');

export const fullNameSchema = z.string().trim().min(2).max(100);

export const departmentSchema = z.string().trim().max(100).nullable().optional();

export const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Calendar date as YYYY-MM-DD (validated as a real date). */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), {
    message: 'Invalid calendar date',
  });

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Start of the given calendar day (UTC) as an ISO timestamp; used as an inclusive lower bound. */
export function startOfDayISO(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/** Start of the day *after* the given calendar day (UTC); used as an exclusive upper bound so the whole `to` day is included. */
export function startOfNextDayISO(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString();
}

/** Comma-separated list of enum values, e.g. `status=AVAILABLE,RESERVED`. */
export function csvEnumSchema<T extends Record<string, string>>(enumObj: T) {
  return z
    .string()
    .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.nativeEnum(enumObj)).min(1))
    .optional();
}
