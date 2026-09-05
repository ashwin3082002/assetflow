import { AppDataSource } from '../../config/data-source';
import { Category } from '../../entities/Category';
import { Asset } from '../../entities/Asset';
import { ConflictError, NotFoundError } from '../../common/errors';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schemas';

export interface CategoryResponse {
  id: string;
  name: string;
  description: string | null;
  assetCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function repo() {
  return AppDataSource.getRepository(Category);
}

function serialize(category: Category & { assetCount?: number }): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    assetCount: category.assetCount ?? 0,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export async function list(): Promise<CategoryResponse[]> {
  const categories = await repo()
    .createQueryBuilder('category')
    .loadRelationCountAndMap('category.assetCount', 'category.assets')
    .orderBy('category.name', 'ASC')
    .getMany();
  return categories.map(serialize);
}

async function findOrFail(id: string): Promise<Category> {
  const category = await repo().findOne({ where: { id } });
  if (!category) throw new NotFoundError('Category not found');
  return category;
}

export async function create(input: CreateCategoryInput): Promise<CategoryResponse> {
  const existing = await repo().findOne({ where: { name: input.name } });
  if (existing) throw new ConflictError('A category with this name already exists', 'CATEGORY_EXISTS');
  const category = await repo().save(repo().create({ name: input.name, description: input.description ?? null }));
  return serialize(category);
}

export async function update(id: string, input: UpdateCategoryInput): Promise<CategoryResponse> {
  const category = await findOrFail(id);
  if (input.name !== undefined && input.name !== category.name) {
    const clash = await repo().findOne({ where: { name: input.name } });
    if (clash) throw new ConflictError('A category with this name already exists', 'CATEGORY_EXISTS');
    category.name = input.name;
  }
  if (input.description !== undefined) category.description = input.description;
  await repo().save(category);
  const assetCount = await AppDataSource.getRepository(Asset).count({ where: { categoryId: id } });
  return serialize(Object.assign(category, { assetCount }));
}

export async function remove(id: string): Promise<void> {
  const category = await findOrFail(id);
  const inUse = await AppDataSource.getRepository(Asset).count({ where: { categoryId: id } });
  if (inUse > 0) {
    throw new ConflictError(`Category is used by ${inUse} asset(s) and cannot be deleted`, 'CATEGORY_IN_USE');
  }
  await repo().remove(category);
}
