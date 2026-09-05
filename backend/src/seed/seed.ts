import 'reflect-metadata';
import { AppDataSource } from '../config/data-source';
import { logger } from '../common/logger';
import { AssetCondition, AssetStatus, MaintenanceStatus, MaintenanceType, RequestStatus, UserRole } from '../common/enums';
import { User } from '../entities/User';
import { Category } from '../entities/Category';
import { Asset } from '../entities/Asset';
import { AssetRequest } from '../entities/AssetRequest';
import { MaintenanceRecord } from '../entities/MaintenanceRecord';
import { Review } from '../entities/Review';
import { hashPassword } from '../modules/auth/auth.service';

/**
 * Seed script. Idempotent: existing users (by email), categories (by name) and assets (by serial) are
 * left untouched; requests, maintenance records and reviews are only seeded into empty tables.
 * `npm run seed -- --reset` drops and recreates the schema first (TypeORM synchronize(true)).
 * Data is inserted only through TypeORM repositories - never raw DDL/SQL.
 *
 * Phase 2: users + categories. Phase 4: assets. Phase 6: requests. Phase 8: maintenance + reviews.
 */

export const SEED_PASSWORD = 'Password123';

export const SEED_USERS: Array<Pick<User, 'fullName' | 'email' | 'role' | 'department'>> = [
  { fullName: 'Ava Admin', email: 'admin@assetflow.dev', role: UserRole.ADMIN, department: 'IT' },
  { fullName: 'Sam Staff', email: 'staff1@assetflow.dev', role: UserRole.IT_STAFF, department: 'IT' },
  { fullName: 'Sara Staff', email: 'staff2@assetflow.dev', role: UserRole.IT_STAFF, department: 'IT' },
  { fullName: 'Eli Employee', email: 'emp1@assetflow.dev', role: UserRole.EMPLOYEE, department: 'Engineering' },
  { fullName: 'Emma Employee', email: 'emp2@assetflow.dev', role: UserRole.EMPLOYEE, department: 'Marketing' },
  { fullName: 'Ethan Employee', email: 'emp3@assetflow.dev', role: UserRole.EMPLOYEE, department: 'Finance' },
];

export const SEED_CATEGORIES: Array<Pick<Category, 'name' | 'description'>> = [
  { name: 'Laptop', description: 'Portable computers' },
  { name: 'Monitor', description: 'External displays' },
  { name: 'Keyboard', description: 'Wired and wireless keyboards' },
  { name: 'Mouse', description: 'Pointing devices' },
  { name: 'Projector', description: 'Meeting-room projectors' },
  { name: 'Docking Station', description: 'Laptop docks and port replicators' },
  { name: 'Headset', description: 'Audio headsets for calls' },
  { name: 'Printer', description: 'Office printers' },
];

export async function seedUsersAndCategories(): Promise<{ users: User[]; categories: Category[] }> {
  const userRepo = AppDataSource.getRepository(User);
  const categoryRepo = AppDataSource.getRepository(Category);
  const passwordHash = await hashPassword(SEED_PASSWORD);

  const users: User[] = [];
  for (const u of SEED_USERS) {
    let user = await userRepo.findOne({ where: { email: u.email } });
    if (!user) {
      user = await userRepo.save(userRepo.create({ ...u, passwordHash, isActive: true }));
      logger.info(`Created user ${u.email} (${u.role})`);
    }
    users.push(user);
  }

  const categories: Category[] = [];
  for (const c of SEED_CATEGORIES) {
    let category = await categoryRepo.findOne({ where: { name: c.name } });
    if (!category) {
      category = await categoryRepo.save(categoryRepo.create(c));
      logger.info(`Created category ${c.name}`);
    }
    categories.push(category);
  }

  return { users, categories };
}

interface SeedAsset {
  name: string;
  description: string;
  serialNumber: string;
  category: string;
  manager: string; // seed user email
  condition?: AssetCondition;
  purchaseDate?: string;
  maxLoanDays?: number | null;
  location?: string;
}

export const SEED_ASSETS: SeedAsset[] = [
  { name: 'Dell Latitude 5540', description: '15" business laptop, i7, 16 GB RAM, 512 GB SSD', serialNumber: 'LT-5540-0001', category: 'Laptop', manager: 'staff1@assetflow.dev', condition: AssetCondition.NEW, purchaseDate: '2025-11-03', maxLoanDays: 90, location: 'IT Store, Rack A1' },
  { name: 'Dell Latitude 5540', description: '15" business laptop, i7, 16 GB RAM, 512 GB SSD', serialNumber: 'LT-5540-0002', category: 'Laptop', manager: 'staff1@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2025-11-03', maxLoanDays: 90, location: 'IT Store, Rack A1' },
  { name: 'MacBook Pro 14"', description: 'Apple M3 Pro, 18 GB RAM, 512 GB SSD', serialNumber: 'MBP-14-0001', category: 'Laptop', manager: 'staff2@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2025-02-14', maxLoanDays: 60, location: 'IT Store, Rack A2' },
  { name: 'Lenovo ThinkPad X1 Carbon', description: '14" ultralight, i5, 16 GB RAM', serialNumber: 'TP-X1C-0001', category: 'Laptop', manager: 'staff2@assetflow.dev', condition: AssetCondition.FAIR, purchaseDate: '2023-06-20', maxLoanDays: 90, location: 'IT Store, Rack A2' },
  { name: 'Dell U2723QE 27" 4K', description: '27-inch 4K USB-C monitor', serialNumber: 'MON-U27-0001', category: 'Monitor', manager: 'staff1@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2024-09-10', maxLoanDays: 180, location: 'IT Store, Shelf B1' },
  { name: 'Dell U2723QE 27" 4K', description: '27-inch 4K USB-C monitor', serialNumber: 'MON-U27-0002', category: 'Monitor', manager: 'staff1@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2024-09-10', maxLoanDays: 180, location: 'IT Store, Shelf B1' },
  { name: 'LG 34" UltraWide', description: '34-inch curved ultrawide monitor', serialNumber: 'MON-LG34-0001', category: 'Monitor', manager: 'staff2@assetflow.dev', condition: AssetCondition.POOR, purchaseDate: '2022-03-01', maxLoanDays: null, location: 'IT Store, Shelf B2' },
  { name: 'Logitech MX Keys', description: 'Wireless illuminated keyboard', serialNumber: 'KB-MXK-0001', category: 'Keyboard', manager: 'staff1@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2025-05-22', maxLoanDays: null, location: 'IT Store, Drawer C1' },
  { name: 'Logitech MX Keys', description: 'Wireless illuminated keyboard', serialNumber: 'KB-MXK-0002', category: 'Keyboard', manager: 'staff1@assetflow.dev', condition: AssetCondition.NEW, purchaseDate: '2025-05-22', maxLoanDays: null, location: 'IT Store, Drawer C1' },
  { name: 'Logitech MX Master 3S', description: 'Wireless ergonomic mouse', serialNumber: 'MS-MXM-0001', category: 'Mouse', manager: 'staff1@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2025-05-22', maxLoanDays: null, location: 'IT Store, Drawer C2' },
  { name: 'Epson EB-L200F', description: 'Full HD laser projector for meeting rooms', serialNumber: 'PRJ-EPS-0001', category: 'Projector', manager: 'staff2@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2024-01-18', maxLoanDays: 7, location: 'AV Cabinet, Floor 2' },
  { name: 'Dell WD22TB4 Dock', description: 'Thunderbolt 4 docking station', serialNumber: 'DCK-WD22-0001', category: 'Docking Station', manager: 'staff1@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2025-11-03', maxLoanDays: 180, location: 'IT Store, Shelf B3' },
  { name: 'Jabra Evolve2 65', description: 'Wireless stereo headset with boom mic', serialNumber: 'HS-JAB-0001', category: 'Headset', manager: 'staff2@assetflow.dev', condition: AssetCondition.GOOD, purchaseDate: '2025-08-30', maxLoanDays: 180, location: 'IT Store, Drawer C3' },
  { name: 'Jabra Evolve2 65', description: 'Wireless stereo headset with boom mic', serialNumber: 'HS-JAB-0002', category: 'Headset', manager: 'staff2@assetflow.dev', condition: AssetCondition.DAMAGED, purchaseDate: '2025-08-30', maxLoanDays: 180, location: 'IT Store, Drawer C3' },
  { name: 'HP LaserJet Pro M404dn', description: 'Mono laser printer, duplex, network', serialNumber: 'PRN-HP404-0001', category: 'Printer', manager: 'staff1@assetflow.dev', condition: AssetCondition.FAIR, purchaseDate: '2021-10-05', maxLoanDays: null, location: 'Print Room, Floor 1' },
];

export async function seedAssets(users: User[], categories: Category[]): Promise<Asset[]> {
  const assetRepo = AppDataSource.getRepository(Asset);
  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const categoryByName = new Map(categories.map((c) => [c.name, c]));
  const assets: Asset[] = [];

  for (const a of SEED_ASSETS) {
    let asset = await assetRepo.findOne({ where: { serialNumber: a.serialNumber } });
    if (!asset) {
      const manager = userByEmail.get(a.manager);
      const category = categoryByName.get(a.category);
      if (!manager || !category) throw new Error(`Seed asset ${a.serialNumber}: unknown manager or category`);
      asset = await assetRepo.save(
        assetRepo.create({
          name: a.name,
          description: a.description,
          serialNumber: a.serialNumber,
          categoryId: category.id,
          managedById: manager.id,
          condition: a.condition ?? AssetCondition.GOOD,
          purchaseDate: a.purchaseDate ?? null,
          maxLoanDays: a.maxLoanDays ?? null,
          location: a.location ?? null,
          status: AssetStatus.AVAILABLE,
          imageUrl: null,
        }),
      );
      logger.info(`Created asset ${a.serialNumber} (${a.name})`);
    }
    assets.push(asset);
  }
  return assets;
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface SeedRequest {
  asset: string; // serial number
  requester: string; // seed user email
  status: RequestStatus;
  purpose: string;
  requestedFrom: string;
  expectedReturnDate: string;
  processedBy?: string; // seed user email
  rejectionReason?: string;
  returnCondition?: AssetCondition;
  returnNotes?: string;
}

/** One request per status, one overdue ALLOCATED. Asset statuses are set to keep the invariants (database-design §6.4). */
export const SEED_REQUESTS: SeedRequest[] = [
  { asset: 'LT-5540-0001', requester: 'emp1@assetflow.dev', status: RequestStatus.PENDING, purpose: 'Onboarding laptop for a new project', requestedFrom: daysFromToday(1), expectedReturnDate: daysFromToday(60) },
  { asset: 'LT-5540-0001', requester: 'emp3@assetflow.dev', status: RequestStatus.PENDING, purpose: 'Temporary laptop while mine is repaired', requestedFrom: daysFromToday(2), expectedReturnDate: daysFromToday(30) },
  { asset: 'MBP-14-0001', requester: 'emp2@assetflow.dev', status: RequestStatus.APPROVED, purpose: 'Video editing for the marketing campaign', requestedFrom: daysFromToday(0), expectedReturnDate: daysFromToday(45), processedBy: 'staff2@assetflow.dev' },
  { asset: 'MON-U27-0001', requester: 'emp1@assetflow.dev', status: RequestStatus.ALLOCATED, purpose: 'Second monitor for home office', requestedFrom: daysFromToday(-20), expectedReturnDate: daysFromToday(100), processedBy: 'staff1@assetflow.dev' },
  { asset: 'PRJ-EPS-0001', requester: 'emp3@assetflow.dev', status: RequestStatus.ALLOCATED, purpose: 'Quarterly finance review presentation', requestedFrom: daysFromToday(-10), expectedReturnDate: daysFromToday(-3), processedBy: 'staff2@assetflow.dev' }, // overdue
  { asset: 'KB-MXK-0001', requester: 'emp2@assetflow.dev', status: RequestStatus.RETURN_PENDING, purpose: 'Ergonomic keyboard trial', requestedFrom: daysFromToday(-30), expectedReturnDate: daysFromToday(5), processedBy: 'staff1@assetflow.dev' },
  { asset: 'HS-JAB-0001', requester: 'emp1@assetflow.dev', status: RequestStatus.COMPLETED, purpose: 'Customer calls during the support rotation', requestedFrom: daysFromToday(-90), expectedReturnDate: daysFromToday(-30), processedBy: 'staff2@assetflow.dev', returnCondition: AssetCondition.GOOD, returnNotes: 'Returned with case and cable' },
  { asset: 'DCK-WD22-0001', requester: 'emp3@assetflow.dev', status: RequestStatus.COMPLETED, purpose: 'Docking station for the finance desk', requestedFrom: daysFromToday(-120), expectedReturnDate: daysFromToday(-60), processedBy: 'staff1@assetflow.dev', returnCondition: AssetCondition.GOOD },
  { asset: 'LT-5540-0002', requester: 'emp3@assetflow.dev', status: RequestStatus.REJECTED, purpose: 'Spare laptop for travel', requestedFrom: daysFromToday(-5), expectedReturnDate: daysFromToday(20), processedBy: 'staff1@assetflow.dev', rejectionReason: 'Travel laptops are issued by the travel desk' },
  { asset: 'MS-MXM-0001', requester: 'emp2@assetflow.dev', status: RequestStatus.CANCELLED, purpose: 'Replacement mouse', requestedFrom: daysFromToday(-2), expectedReturnDate: daysFromToday(10) },
];

const ASSET_STATUS_FOR_REQUEST: Partial<Record<RequestStatus, AssetStatus>> = {
  [RequestStatus.APPROVED]: AssetStatus.RESERVED,
  [RequestStatus.ALLOCATED]: AssetStatus.ALLOCATED,
  [RequestStatus.RETURN_PENDING]: AssetStatus.ALLOCATED,
};

export async function seedRequests(users: User[], assets: Asset[]): Promise<AssetRequest[]> {
  const requestRepo = AppDataSource.getRepository(AssetRequest);
  const assetRepo = AppDataSource.getRepository(Asset);
  if ((await requestRepo.count()) > 0) {
    logger.info('Requests already present; skipping request seed');
    return requestRepo.find();
  }

  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const assetBySerial = new Map(assets.map((a) => [a.serialNumber, a]));
  const created: AssetRequest[] = [];
  const stamp = (days: number) => new Date(Date.now() + days * 86_400_000);

  for (const r of SEED_REQUESTS) {
    const asset = assetBySerial.get(r.asset);
    const requester = userByEmail.get(r.requester);
    const processedBy = r.processedBy ? userByEmail.get(r.processedBy) : undefined;
    if (!asset || !requester || (r.processedBy && !processedBy)) throw new Error(`Seed request ${r.asset}/${r.requester}: unknown asset or user`);

    const holdingStatus = ASSET_STATUS_FOR_REQUEST[r.status];
    if (holdingStatus) {
      if (asset.status !== AssetStatus.AVAILABLE) throw new Error(`Seed request ${r.asset}: asset already ${asset.status}`);
      asset.status = holdingStatus;
      await assetRepo.save(asset);
    }

    const isPast = r.status !== RequestStatus.PENDING;
    const request = requestRepo.create({
      assetId: asset.id,
      requesterId: requester.id,
      processedById: processedBy?.id ?? null,
      status: r.status,
      purpose: r.purpose,
      requestedFrom: r.requestedFrom,
      expectedReturnDate: r.expectedReturnDate,
      approvedAt: isPast && r.status !== RequestStatus.CANCELLED && r.status !== RequestStatus.REJECTED ? stamp(-1) : null,
      rejectedAt: r.status === RequestStatus.REJECTED ? stamp(-1) : null,
      allocatedAt: [RequestStatus.ALLOCATED, RequestStatus.RETURN_PENDING, RequestStatus.COMPLETED].includes(r.status) ? stamp(-1) : null,
      returnInitiatedAt: r.status === RequestStatus.RETURN_PENDING ? stamp(0) : null,
      completedAt: r.status === RequestStatus.COMPLETED ? stamp(0) : null,
      cancelledAt: r.status === RequestStatus.CANCELLED ? stamp(0) : null,
      rejectionReason: r.rejectionReason ?? null,
      returnCondition: r.returnCondition ?? null,
      returnNotes: r.returnNotes ?? null,
    });
    created.push(await requestRepo.save(request));
    logger.info(`Created ${r.status} request for ${r.asset} by ${r.requester}`);
  }
  return created;
}

interface SeedMaintenance {
  asset: string; // serial number
  createdBy: string; // seed user email
  type: MaintenanceType;
  status: MaintenanceStatus;
  description: string;
  startedDaysAgo: number;
  completedDaysAgo?: number;
  cost?: number;
  resultingCondition?: AssetCondition;
}

/** One OPEN (asset becomes UNDER_MAINTENANCE) and two COMPLETED records on assets no request holds. */
export const SEED_MAINTENANCE: SeedMaintenance[] = [
  { asset: 'HS-JAB-0002', createdBy: 'staff2@assetflow.dev', type: MaintenanceType.REPAIR, status: MaintenanceStatus.OPEN, description: 'Left ear cup crackles; replace speaker driver', startedDaysAgo: 2, cost: 25 },
  { asset: 'TP-X1C-0001', createdBy: 'staff2@assetflow.dev', type: MaintenanceType.INSPECTION, status: MaintenanceStatus.COMPLETED, description: 'Annual battery health and thermal inspection', startedDaysAgo: 40, completedDaysAgo: 39, cost: 0, resultingCondition: AssetCondition.FAIR },
  { asset: 'PRN-HP404-0001', createdBy: 'staff1@assetflow.dev', type: MaintenanceType.REPAIR, status: MaintenanceStatus.COMPLETED, description: 'Replaced fuser unit and cleaned paper path', startedDaysAgo: 15, completedDaysAgo: 12, cost: 189.5, resultingCondition: AssetCondition.FAIR },
];

export async function seedMaintenance(users: User[], assets: Asset[]): Promise<MaintenanceRecord[]> {
  const recordRepo = AppDataSource.getRepository(MaintenanceRecord);
  const assetRepo = AppDataSource.getRepository(Asset);
  if ((await recordRepo.count()) > 0) {
    logger.info('Maintenance records already present; skipping maintenance seed');
    return recordRepo.find();
  }

  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const assetBySerial = new Map(assets.map((a) => [a.serialNumber, a]));
  const created: MaintenanceRecord[] = [];
  const stamp = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);

  for (const m of SEED_MAINTENANCE) {
    const asset = assetBySerial.get(m.asset);
    const createdBy = userByEmail.get(m.createdBy);
    if (!asset || !createdBy) throw new Error(`Seed maintenance ${m.asset}: unknown asset or user`);

    if (m.status === MaintenanceStatus.OPEN) {
      if (asset.status !== AssetStatus.AVAILABLE) throw new Error(`Seed maintenance ${m.asset}: asset already ${asset.status}`);
      asset.status = AssetStatus.UNDER_MAINTENANCE;
      await assetRepo.save(asset);
    } else if (m.resultingCondition) {
      asset.condition = m.resultingCondition;
      await assetRepo.save(asset);
    }

    created.push(
      await recordRepo.save(
        recordRepo.create({
          assetId: asset.id,
          createdById: createdBy.id,
          type: m.type,
          status: m.status,
          description: m.description,
          startedAt: stamp(m.startedDaysAgo),
          completedAt: m.completedDaysAgo !== undefined ? stamp(m.completedDaysAgo) : null,
          cost: m.cost !== undefined ? m.cost.toFixed(2) : null,
          resultingCondition: m.resultingCondition ?? null,
        }),
      ),
    );
    logger.info(`Created ${m.status} ${m.type} maintenance for ${m.asset}`);
  }
  return created;
}

interface SeedReview {
  asset: string; // serial number of the COMPLETED request's asset
  reviewer: string; // requester email
  rating: number;
  comment: string | null;
}

/** Reviews attach to the two COMPLETED seed requests. */
export const SEED_REVIEWS: SeedReview[] = [
  { asset: 'HS-JAB-0001', reviewer: 'emp1@assetflow.dev', rating: 5, comment: 'Excellent noise cancelling, battery lasted the whole rotation.' },
  { asset: 'DCK-WD22-0001', reviewer: 'emp3@assetflow.dev', rating: 4, comment: 'Worked with both monitors; the power brick runs warm.' },
];

export async function seedReviews(users: User[], assets: Asset[], requests: AssetRequest[]): Promise<Review[]> {
  const reviewRepo = AppDataSource.getRepository(Review);
  if ((await reviewRepo.count()) > 0) {
    logger.info('Reviews already present; skipping review seed');
    return reviewRepo.find();
  }

  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const assetBySerial = new Map(assets.map((a) => [a.serialNumber, a]));
  const created: Review[] = [];

  for (const r of SEED_REVIEWS) {
    const asset = assetBySerial.get(r.asset);
    const reviewer = userByEmail.get(r.reviewer);
    const request = requests.find((q) => q.assetId === asset?.id && q.requesterId === reviewer?.id && q.status === RequestStatus.COMPLETED);
    if (!asset || !reviewer || !request) {
      logger.warn(`Seed review ${r.asset}/${r.reviewer}: no COMPLETED request found; skipping`);
      continue;
    }
    created.push(await reviewRepo.save(reviewRepo.create({ requestId: request.id, assetId: asset.id, reviewerId: reviewer.id, rating: r.rating, comment: r.comment })));
    logger.info(`Created ${r.rating}-star review for ${r.asset} by ${r.reviewer}`);
  }
  return created;
}

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  await AppDataSource.initialize();
  if (reset) {
    logger.warn('--reset: dropping and recreating schema from entities');
    await AppDataSource.synchronize(true);
  }
  const { users, categories } = await seedUsersAndCategories();
  const assets = await seedAssets(users, categories);
  const requests = await seedRequests(users, assets);
  await seedMaintenance(users, assets);
  await seedReviews(users, assets, requests);
  logger.info(`Seed complete. All seeded accounts use password "${SEED_PASSWORD}".`);
  await AppDataSource.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('Seed failed', err);
    process.exit(1);
  });
}
