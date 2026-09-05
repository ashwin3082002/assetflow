import { Router } from 'express';
import { UserRole } from '../../common/enums';
import { asyncHandler } from '../../common/asyncHandler';
import { idParamSchema } from '../../common/schemas';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as controller from './maintenance.controller';
import { completeMaintenanceSchema, createMaintenanceSchema, listMaintenanceQuerySchema, updateMaintenanceSchema } from './maintenance.schemas';

/** Every maintenance route is staff-only (business-rules §2). */
export const maintenanceRouter = Router();

const staff = authorize(UserRole.ADMIN, UserRole.IT_STAFF);
const idParams = validate({ params: idParamSchema });

maintenanceRouter.get('/', validate({ query: listMaintenanceQuerySchema }), authenticate, staff, asyncHandler(controller.list));
maintenanceRouter.post('/', validate({ body: createMaintenanceSchema }), authenticate, staff, asyncHandler(controller.open));

maintenanceRouter.get('/:id', idParams, authenticate, staff, asyncHandler(controller.getOne));
maintenanceRouter.patch('/:id', validate({ params: idParamSchema, body: updateMaintenanceSchema }), authenticate, staff, asyncHandler(controller.update));
maintenanceRouter.post('/:id/complete', validate({ params: idParamSchema, body: completeMaintenanceSchema }), authenticate, staff, asyncHandler(controller.complete));
maintenanceRouter.delete('/:id', idParams, authenticate, staff, asyncHandler(controller.remove));
