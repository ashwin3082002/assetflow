import type { Request, Response } from 'express';
import * as service from './categories.service';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json({ data: await service.list() });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await service.create(req.body) });
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.update(req.params.id, req.body) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(req.params.id);
  res.status(204).send();
}
