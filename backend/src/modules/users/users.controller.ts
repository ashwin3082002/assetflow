import type { Request, Response } from 'express';
import * as usersService from './users.service';
import { hashPassword } from '../auth/auth.service';
import type { ListUsersQuery } from './users.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const result = await usersService.list(req.query as unknown as ListUsersQuery, req.user!);
  res.json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = await usersService.create(req.body, hashPassword);
  res.status(201).json({ data: user });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const user = await usersService.getDetail(req.params.id);
  res.json({ data: user });
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await usersService.update(req.params.id, req.body, req.user!);
  res.json(result);
}
