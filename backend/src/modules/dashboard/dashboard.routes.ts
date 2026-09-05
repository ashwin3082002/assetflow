import { Router } from 'express';
import { UserRole } from '../../common/enums';
import { asyncHandler } from '../../common/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as controller from './dashboard.controller';

/** Role-specific dashboards (docs/api-design.md §10). No input, so no validation schemas. */
export const dashboardRouter = Router();

dashboardRouter.get('/admin', authenticate, authorize(UserRole.ADMIN), asyncHandler(controller.admin));
dashboardRouter.get('/staff', authenticate, authorize(UserRole.ADMIN, UserRole.IT_STAFF), asyncHandler(controller.staff));
dashboardRouter.get('/employee', authenticate, authorize(UserRole.EMPLOYEE), asyncHandler(controller.employee));
