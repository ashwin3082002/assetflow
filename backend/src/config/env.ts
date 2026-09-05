import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    TEST_DATABASE_URL: z.string().url().optional(),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().default('8h'),
    UPLOAD_DIR: z.string().default('uploads'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    MAX_ACTIVE_REQUESTS: z.coerce.number().int().positive().default(5),
    REDIS_URL: z.string().url().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.NODE_ENV === 'test' && !values.TEST_DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TEST_DATABASE_URL'],
        message: 'TEST_DATABASE_URL is required when NODE_ENV=test',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const values = parsed.data;

export const env = {
  ...values,
  isProduction: values.NODE_ENV === 'production',
  isTest: values.NODE_ENV === 'test',
  /** Database URL for the current environment (test DB under Jest). */
  dbUrl: values.NODE_ENV === 'test' ? (values.TEST_DATABASE_URL as string) : values.DATABASE_URL,
};

export type Env = typeof env;
