import { Router } from 'express';
import { UserRole } from '../../common/enums';
import { asyncHandler } from '../../common/asyncHandler';
import { idParamSchema } from '../../common/schemas';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as controller from './users.controller';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from './users.schemas';

export const usersRouter = Router();

usersRouter.get(
  '/',
  validate({ query: listUsersQuerySchema }),
  authenticate,
  authorize(UserRole.ADMIN, UserRole.IT_STAFF),
  asyncHandler(controller.list),
);

usersRouter.post(
  '/',
  validate({ body: createUserSchema }),
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(controller.create),
);

usersRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(controller.getOne),
);

usersRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(controller.update),
);
