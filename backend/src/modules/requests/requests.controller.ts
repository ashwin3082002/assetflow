import type { Request, Response } from 'express';
import * as service from './requests.service';
import type { ListRequestsQuery } from './requests.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(req.query as unknown as ListRequestsQuery, req.user!));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await service.create(req.body, req.user!) });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.getById(req.params.id, req.user!) });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.cancel(req.params.id, req.user!) });
}

export async function approve(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.approve(req.params.id, req.user!) });
}

export async function reject(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.reject(req.params.id, req.body, req.user!) });
}

export async function allocate(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.allocate(req.params.id, req.user!) });
}

export async function initiateReturn(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.initiateReturn(req.params.id, req.user!) });
}

export async function complete(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.complete(req.params.id, req.body, req.user!) });
}
