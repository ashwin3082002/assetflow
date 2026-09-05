import { AppDataSource } from '../../src/config/data-source';
import { Category } from '../../src/entities/Category';
import { Asset } from '../../src/entities/Asset';
import { User } from '../../src/entities/User';
import { AssetCondition, AssetStatus, UserRole } from '../../src/common/enums';
import { createUser } from './auth';

let counter = 0;

export async function createCategory(overrides: Partial<Category> = {}): Promise<Category> {
  counter += 1;
  const repo = AppDataSource.getRepository(Category);
  return repo.save(repo.create({ name: `Category ${counter}-${Date.now()}`, description: null, ...overrides }));
}

/** Creates an asset through the repository. Supplies a category and an active IT_STAFF manager if not given. */
export async function createAsset(overrides: Partial<Asset> & { manager?: User; category?: Category } = {}): Promise<Asset> {
  counter += 1;
  const { manager, category, ...rest } = overrides;
  const managedById = rest.managedById ?? (manager ?? (await createUser(UserRole.IT_STAFF))).id;
  const categoryId = rest.categoryId ?? (category ?? (await createCategory())).id;
  const repo = AppDataSource.getRepository(Asset);
  const asset = repo.create({
    name: `Asset ${counter}`,
    description: `Description of asset ${counter}`,
    serialNumber: `SN-${counter}-${Date.now()}`,
    status: AssetStatus.AVAILABLE,
    condition: AssetCondition.GOOD,
    purchaseDate: null,
    maxLoanDays: null,
    imageUrl: null,
    location: null,
    ...rest,
    managedById,
    categoryId,
  });
  return repo.save(asset);
}

/** Minimal valid PNG header bytes; multer only inspects the declared mimetype, but keep it realistic. */
export const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0000001000100ffff03000c0002', 'hex');
