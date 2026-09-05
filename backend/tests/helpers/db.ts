import { AppDataSource } from '../../src/config/data-source';

/** Initialize the test DataSource once (dropSchema + synchronize recreate the schema from entities). */
export async function initTestDb(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}

export async function closeTestDb(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}

/** Remove all rows from every entity table while keeping the schema. */
export async function truncateAll(): Promise<void> {
  const tables = AppDataSource.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
  await AppDataSource.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
