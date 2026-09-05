import type { Request, Response } from 'express';
import * as service from './maintenance.service';
import type { ListMaintenanceQuery } from './maintenance.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(req.query as unknown as ListMaintenanceQuery));
}

export async function open(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await service.open(req.body, req.user!) });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.getById(req.params.id) });
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.update(req.params.id, req.body) });
}

export async function complete(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.complete(req.params.id, req.body) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(req.params.id);
  res.status(204).send();
}
