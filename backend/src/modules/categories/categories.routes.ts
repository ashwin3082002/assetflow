import { Router } from 'express';
import { UserRole } from '../../common/enums';
import { asyncHandler } from '../../common/asyncHandler';
import { idParamSchema } from '../../common/schemas';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as controller from './categories.controller';
import { createCategorySchema, updateCategorySchema } from './categories.schemas';

export const categoriesRouter = Router();

categoriesRouter.get('/', authenticate, asyncHandler(controller.list));

categoriesRouter.post(
  '/',
  validate({ body: createCategorySchema }),
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(controller.create),
);

categoriesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateCategorySchema }),
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(controller.update),
);

categoriesRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(controller.remove),
);
