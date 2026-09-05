import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AssetCondition, AssetStatus } from '../common/enums';
import { Category } from './Category';
import { User } from './User';
import { AssetRequest } from './AssetRequest';
import { MaintenanceRecord } from './MaintenanceRecord';
import { Review } from './Review';

/**
 * Core business entity: ONE physical unit (unique serial number). There is no quantity column;
 * bulk items are separate rows. `status` is only ever changed by workflows, never by direct edits.
 */
@Entity({ name: 'assets' })
@Unique('UQ_assets_serial_number', ['serialNumber'])
@Index('IDX_assets_status', ['status'])
@Index('IDX_assets_category_id', ['categoryId'])
@Index('IDX_assets_managed_by_id', ['managedById'])
@Index('IDX_assets_purchase_date', ['purchaseDate'])
@Index('IDX_assets_name', ['name'])
@Check('CHK_assets_max_loan_days', '"max_loan_days" IS NULL OR "max_loan_days" > 0')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'description', type: 'text' })
  description!: string;

  @Column({ name: 'serial_number', type: 'varchar', length: 100 })
  serialNumber!: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => Category, (category) => category.assets, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  /** Ownership: the IT Staff member responsible for this unit (Role Type A). Role enforced in service. */
  @Column({ name: 'managed_by_id', type: 'uuid' })
  managedById!: string;

  @ManyToOne(() => User, (user) => user.managedAssets, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'managed_by_id' })
  managedBy!: User;

  @Column({ name: 'status', type: 'enum', enum: AssetStatus, enumName: 'asset_status_enum', default: AssetStatus.AVAILABLE })
  status!: AssetStatus;

  @Column({
    name: 'condition',
    type: 'enum',
    enum: AssetCondition,
    enumName: 'asset_condition_enum',
    default: AssetCondition.GOOD,
  })
  condition!: AssetCondition;

  @Column({ name: 'purchase_date', type: 'date', nullable: true })
  purchaseDate!: string | null;

  /** "Capacity / Limit": maximum loan duration in days; validated against request duration. */
  @Column({ name: 'max_loan_days', type: 'integer', nullable: true })
  maxLoanDays!: number | null;

  @Column({ name: 'image_url', type: 'varchar', length: 255, nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'location', type: 'varchar', length: 100, nullable: true })
  location!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => AssetRequest, (request) => request.asset)
  requests!: AssetRequest[];

  @OneToMany(() => MaintenanceRecord, (record) => record.asset)
  maintenanceRecords!: MaintenanceRecord[];

  @OneToMany(() => Review, (review) => review.asset)
  reviews!: Review[];
}
