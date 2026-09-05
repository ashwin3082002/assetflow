import { Router } from 'express';
import { UserRole } from '../../common/enums';
import { asyncHandler } from '../../common/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as controller from './reviews.controller';
import { createReviewSchema, listReviewsQuerySchema } from './reviews.schemas';

export const reviewsRouter = Router();

// Employees are scoped to their own reviews in the service; per-asset reviews live under /assets/:id/reviews.
reviewsRouter.get('/', validate({ query: listReviewsQuerySchema }), authenticate, asyncHandler(controller.list));
reviewsRouter.post('/', validate({ body: createReviewSchema }), authenticate, authorize(UserRole.EMPLOYEE), asyncHandler(controller.create));
