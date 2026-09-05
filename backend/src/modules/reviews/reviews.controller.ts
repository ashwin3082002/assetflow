import type { Request, Response } from 'express';
import * as service from './reviews.service';
import type { ListReviewsQuery } from './reviews.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(req.query as unknown as ListReviewsQuery, req.user!));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await service.create(req.body, req.user!) });
}
