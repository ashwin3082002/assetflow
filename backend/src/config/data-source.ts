import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from './env';
import { User } from '../entities/User';
import { Category } from '../entities/Category';
import { Asset } from '../entities/Asset';
import { AssetRequest } from '../entities/AssetRequest';
import { MaintenanceRecord } from '../entities/MaintenanceRecord';
import { Review } from '../entities/Review';

export const entities = [User, Category, Asset, AssetRequest, MaintenanceRecord, Review];

/**
 * Single TypeORM DataSource. The schema (tables, enums, FKs, indexes, checks) is created
 * programmatically from the entity classes via `synchronize` - never by manual DDL.
 * Under Jest the test database is dropped and recreated on every run.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.dbUrl,
  entities,
  synchronize: !env.isProduction,
  dropSchema: env.isTest,
  logging: false,
});
