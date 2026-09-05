import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AssetCondition, MaintenanceStatus, MaintenanceType } from '../common/enums';
import { Asset } from './Asset';
import { User } from './User';

@Entity({ name: 'maintenance_records' })
@Index('IDX_maintenance_asset_status', ['assetId', 'status'])
@Index('IDX_maintenance_status', ['status'])
/** At most one OPEN maintenance record per asset. */
@Index('UQ_maintenance_open_asset', ['assetId'], { unique: true, where: `"status" = 'OPEN'` })
@Check('CHK_maintenance_cost', '"cost" IS NULL OR "cost" >= 0')
export class MaintenanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @ManyToOne(() => Asset, (asset) => asset.maintenanceRecords, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_id' })
  asset!: Asset;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => User, (user) => user.maintenanceRecords, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @Column({ name: 'type', type: 'enum', enum: MaintenanceType, enumName: 'maintenance_type_enum' })
  type!: MaintenanceType;

  @Column({
    name: 'status',
    type: 'enum',
    enum: MaintenanceStatus,
    enumName: 'maintenance_status_enum',
    default: MaintenanceStatus.OPEN,
  })
  status!: MaintenanceStatus;

  @Column({ name: 'description', type: 'text' })
  description!: string;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cost', type: 'numeric', precision: 10, scale: 2, nullable: true })
  cost!: string | null;

  @Column({
    name: 'resulting_condition',
    type: 'enum',
    enum: AssetCondition,
    enumName: 'asset_condition_enum',
    nullable: true,
  })
  resultingCondition!: AssetCondition | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
