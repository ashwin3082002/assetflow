import type { Request, Response } from 'express';
import { BadRequestError } from '../../common/errors';
import * as service from './assets.service';
import type { AssetMaintenanceQuery, AssetRequestsQuery, AssetReviewsQuery, ListAssetsQuery } from './assets.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(req.query as unknown as ListAssetsQuery, req.user!));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.getById(req.params.id, req.user!) });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await service.create(req.body, req.user!) });
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.update(req.params.id, req.body, req.user!) });
}

export async function uploadImage(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new BadRequestError('Expected an image file in the "image" field', 'INVALID_FILE');
  res.json({ data: await service.setImage(req.params.id, req.file.filename, req.user!) });
}

export async function deleteImage(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.clearImage(req.params.id, req.user!) });
}

export async function retire(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.retire(req.params.id, req.user!) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(req.params.id, req.user!);
  res.status(204).send();
}

export async function listRequests(req: Request, res: Response): Promise<void> {
  res.json(await service.listRequests(req.params.id, req.query as unknown as AssetRequestsQuery, req.user!));
}

export async function listMaintenance(req: Request, res: Response): Promise<void> {
  res.json(await service.listMaintenance(req.params.id, req.query as unknown as AssetMaintenanceQuery, req.user!));
}

export async function listReviews(req: Request, res: Response): Promise<void> {
  res.json(await service.listReviews(req.params.id, req.query as unknown as AssetReviewsQuery, req.user!));
}
