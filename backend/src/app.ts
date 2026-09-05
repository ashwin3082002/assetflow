import 'reflect-metadata';
import './common/types';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { ensureUploadDirs, uploadRoot } from './config/uploads';
import { logger } from './common/logger';
import { apiRouter } from './routes';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

/**
 * Express app factory. Used by `server.ts` to listen and by tests via supertest (no port).
 * Pipeline: helmet → cors → json → static /uploads → request log → /api → 404 → error handler.
 */
export function createApp(): Express {
  ensureUploadDirs();

  const app = express();
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(uploadRoot, { index: false, dotfiles: 'deny' }));

  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
