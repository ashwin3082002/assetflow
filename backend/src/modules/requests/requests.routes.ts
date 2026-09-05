import { Router } from 'express';
import { UserRole } from '../../common/enums';
import { asyncHandler } from '../../common/asyncHandler';
import { idParamSchema } from '../../common/schemas';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as controller from './requests.controller';
import { completeRequestSchema, createRequestSchema, listRequestsQuerySchema, rejectRequestSchema } from './requests.schemas';

export const requestsRouter = Router();

const staff = authorize(UserRole.ADMIN, UserRole.IT_STAFF);
const employee = authorize(UserRole.EMPLOYEE);
const idParams = validate({ params: idParamSchema });

requestsRouter.get('/', validate({ query: listRequestsQuerySchema }), authenticate, asyncHandler(controller.list));
requestsRouter.post('/', validate({ body: createRequestSchema }), authenticate, employee, asyncHandler(controller.create));

// Ownership for employees is checked in the service (403 when not the requester).
requestsRouter.get('/:id', idParams, authenticate, asyncHandler(controller.getOne));

requestsRouter.post('/:id/cancel', idParams, authenticate, employee, asyncHandler(controller.cancel));
requestsRouter.post('/:id/return', idParams, authenticate, employee, asyncHandler(controller.initiateReturn));

requestsRouter.post('/:id/approve', idParams, authenticate, staff, asyncHandler(controller.approve));
requestsRouter.post('/:id/reject', validate({ params: idParamSchema, body: rejectRequestSchema }), authenticate, staff, asyncHandler(controller.reject));
requestsRouter.post('/:id/allocate', idParams, authenticate, staff, asyncHandler(controller.allocate));
requestsRouter.post('/:id/complete', validate({ params: idParamSchema, body: completeRequestSchema }), authenticate, staff, asyncHandler(controller.complete));
