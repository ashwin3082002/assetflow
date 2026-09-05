import { Router } from 'express';
import { UserRole } from '../../common/enums';
import { asyncHandler } from '../../common/asyncHandler';
import { idParamSchema } from '../../common/schemas';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadAssetImage } from '../../middleware/upload';
import * as controller from './assets.controller';
import {
  assetMaintenanceQuerySchema,
  assetRequestsQuerySchema,
  assetReviewsQuerySchema,
  createAssetSchema,
  listAssetsQuerySchema,
  updateAssetSchema,
} from './assets.schemas';

export const assetsRouter = Router();

const staff = authorize(UserRole.ADMIN, UserRole.IT_STAFF);
const idParams = validate({ params: idParamSchema });

assetsRouter.get('/', validate({ query: listAssetsQuerySchema }), authenticate, asyncHandler(controller.list));
assetsRouter.post('/', validate({ body: createAssetSchema }), authenticate, staff, asyncHandler(controller.create));

assetsRouter.get('/:id', idParams, authenticate, asyncHandler(controller.getOne));
assetsRouter.patch('/:id', validate({ params: idParamSchema, body: updateAssetSchema }), authenticate, staff, asyncHandler(controller.update));
assetsRouter.delete('/:id', idParams, authenticate, staff, asyncHandler(controller.remove));

// Auth runs before multer so unauthenticated uploads never touch the disk.
assetsRouter.post('/:id/image', idParams, authenticate, staff, uploadAssetImage, asyncHandler(controller.uploadImage));
assetsRouter.delete('/:id/image', idParams, authenticate, staff, asyncHandler(controller.deleteImage));

assetsRouter.post('/:id/retire', idParams, authenticate, staff, asyncHandler(controller.retire));

assetsRouter.get('/:id/requests', validate({ params: idParamSchema, query: assetRequestsQuerySchema }), authenticate, staff, asyncHandler(controller.listRequests));
assetsRouter.get('/:id/maintenance', validate({ params: idParamSchema, query: assetMaintenanceQuerySchema }), authenticate, staff, asyncHandler(controller.listMaintenance));
assetsRouter.get('/:id/reviews', validate({ params: idParamSchema, query: assetReviewsQuerySchema }), authenticate, asyncHandler(controller.listReviews));
