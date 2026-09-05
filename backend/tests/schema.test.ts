import { AppDataSource } from '../src/config/data-source';

/**
 * Proves the schema is created programmatically from TypeORM entities: tables, enums,
 * named indexes (including partial unique indexes), unique and check constraints.
 */
describe('programmatic schema (TypeORM synchronize)', () => {
  const expectedTables = ['users', 'categories', 'assets', 'asset_requests', 'maintenance_records', 'reviews'];

  it('creates the six core entity tables', async () => {
    const rows: { table_name: string }[] = await AppDataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const names = rows.map((r) => r.table_name);
    for (const t of expectedTables) expect(names).toContain(t);
  });

  it('creates the enum types', async () => {
    const rows: { typname: string }[] = await AppDataSource.query(`SELECT typname FROM pg_type WHERE typtype = 'e'`);
    const names = rows.map((r) => r.typname);
    for (const e of [
      'user_role_enum',
      'asset_status_enum',
      'asset_condition_enum',
      'request_status_enum',
      'maintenance_type_enum',
      'maintenance_status_enum',
    ]) {
      expect(names).toContain(e);
    }
  });

  it('creates the partial unique indexes that guard business invariants', async () => {
    const rows: { indexname: string; indexdef: string }[] = await AppDataSource.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const byName = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));

    expect(byName['UQ_asset_requests_active_asset']).toMatch(/UNIQUE/);
    expect(byName['UQ_asset_requests_active_asset']).toMatch(/WHERE/);
    expect(byName['UQ_asset_requests_active_requester_asset']).toMatch(/UNIQUE/);
    expect(byName['UQ_asset_requests_active_requester_asset']).toMatch(/WHERE/);
    expect(byName['UQ_maintenance_open_asset']).toMatch(/UNIQUE/);
    expect(byName['UQ_maintenance_open_asset']).toMatch(/WHERE/);

    for (const idx of [
      'IDX_users_role',
      'IDX_assets_status',
      'IDX_assets_category_id',
      'IDX_assets_managed_by_id',
      'IDX_assets_purchase_date',
      'IDX_assets_name',
      'IDX_asset_requests_requester_status',
      'IDX_asset_requests_asset_status',
      'IDX_asset_requests_status',
      'IDX_asset_requests_created_at',
      'IDX_maintenance_asset_status',
      'IDX_maintenance_status',
      'IDX_reviews_asset_id',
      'IDX_reviews_reviewer_id',
    ]) {
      expect(byName[idx]).toBeDefined();
    }
  });

  it('creates unique, check and foreign key constraints', async () => {
    const rows: { conname: string; contype: string }[] = await AppDataSource.query(
      `SELECT conname, contype FROM pg_constraint WHERE connamespace = 'public'::regnamespace`,
    );
    const byName = Object.fromEntries(rows.map((r) => [r.conname, r.contype]));

    for (const u of ['UQ_users_email', 'UQ_categories_name', 'UQ_assets_serial_number', 'UQ_reviews_request_id']) {
      expect(byName[u]).toBe('u');
    }
    for (const c of ['CHK_assets_max_loan_days', 'CHK_asset_requests_dates', 'CHK_maintenance_cost', 'CHK_reviews_rating']) {
      expect(byName[c]).toBe('c');
    }
    const fkCount = rows.filter((r) => r.contype === 'f').length;
    // assets(2) + asset_requests(3) + maintenance_records(2) + reviews(3)
    expect(fkCount).toBe(10);
  });

  it('enforces the rating check constraint at the database level', async () => {
    await expect(
      AppDataSource.query(
        `INSERT INTO reviews (request_id, asset_id, reviewer_id, rating) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 9)`,
      ),
    ).rejects.toMatchObject({ driverError: { code: expect.stringMatching(/^2350[34]$|^23514$/) } });
  });
});
