import type { Request, Response } from 'express';
import * as authService from './auth.service';
import * as usersService from '../users/users.service';

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body);
  res.status(201).json({ data: result });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  res.json({ data: result });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await usersService.getById(req.user!.id);
  res.json({ data: user });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  await authService.changePassword(req.user!.id, req.body);
  res.status(204).send();
}
