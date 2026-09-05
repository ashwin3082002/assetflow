import type { Request, Response } from 'express';
import * as service from './dashboard.service';

export async function admin(_req: Request, res: Response): Promise<void> {
  res.json({ data: await service.admin() });
}

export async function staff(_req: Request, res: Response): Promise<void> {
  res.json({ data: await service.staff() });
}

export async function employee(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.employee(req.user!) });
}
