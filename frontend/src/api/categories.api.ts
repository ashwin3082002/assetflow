import { client } from './client';
import type { Category } from '../types';

export interface CategoryInput {
  name: string;
  description?: string | null;
}

export async function listCategories(): Promise<Category[]> {
  const res = await client.get<{ data: Category[] }>('/categories');
  return res.data.data;
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const res = await client.post<{ data: Category }>('/categories', input);
  return res.data.data;
}

export async function updateCategory(id: string, input: Partial<CategoryInput>): Promise<Category> {
  const res = await client.patch<{ data: Category }>(`/categories/${id}`, input);
  return res.data.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await client.delete(`/categories/${id}`);
}
