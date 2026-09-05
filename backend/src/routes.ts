import { Router } from 'express';
import { AppDataSource } from './config/data-source';
import { logger } from './common/logger';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { assetsRouter } from './modules/assets/assets.routes';
import { requestsRouter } from './modules/requests/requests.routes';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes';
import { reviewsRouter } from './modules/reviews/reviews.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';

/** Mounts every module router under /api. Feature modules are added phase by phase. */
export const apiRouter = Router();

apiRouter.get('/health', async (_req, res) => {
  try {
    await AppDataSource.query('SELECT 1');
    res.json({ data: { status: 'ok', db: 'up' } });
  } catch (err) {
    logger.error('Health check: database unreachable', err);
    res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database is not reachable' } });
  }
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/assets', assetsRouter);
apiRouter.use('/requests', requestsRouter);
apiRouter.use('/maintenance', maintenanceRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/dashboard', dashboardRouter);
