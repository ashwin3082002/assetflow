import 'reflect-metadata';
import { AppDataSource } from './config/data-source';
import { env } from './config/env';
import { logger } from './common/logger';
import { createApp } from './app';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  logger.info(`Database connected (${env.NODE_ENV}); schema synchronized from TypeORM entities`);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`AssetFlow API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    await AppDataSource.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
