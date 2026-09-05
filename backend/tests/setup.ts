import 'reflect-metadata';
import { closeTestDb, initTestDb, truncateAll } from './helpers/db';

beforeAll(async () => {
  await initTestDb();
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});
