import { buildMeta, paginationQuerySchema, sortSchema, toSkip } from '../src/common/pagination';

describe('pagination helpers', () => {
  it('applies defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 10, order: 'desc' });
  });

  it('coerces strings and rejects out-of-range values', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '50', order: 'asc' })).toEqual({ page: 3, limit: 50, order: 'asc' });
    expect(paginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ order: 'sideways' }).success).toBe(false);
  });

  it('whitelists sort fields', () => {
    const schema = sortSchema(['createdAt', 'name'], 'createdAt');
    expect(schema.parse(undefined)).toBe('createdAt');
    expect(schema.parse('name')).toBe('name');
    expect(schema.safeParse('passwordHash').success).toBe(false);
  });

  it('builds meta and skip', () => {
    expect(buildMeta(2, 10, 25)).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(buildMeta(1, 10, 0)).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
    expect(toSkip(3, 10)).toBe(20);
  });
});
