import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../common/enums';
import { Asset } from './Asset';
import { AssetRequest } from './AssetRequest';
import { MaintenanceRecord } from './MaintenanceRecord';
import { Review } from './Review';

@Entity({ name: 'users' })
@Unique('UQ_users_email', ['email'])
@Index('IDX_users_role', ['role'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName!: string;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email!: string;

  /** bcrypt hash; excluded from default selects and never serialized. */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ name: 'role', type: 'enum', enum: UserRole, enumName: 'user_role_enum', default: UserRole.EMPLOYEE })
  role!: UserRole;

  @Column({ name: 'department', type: 'varchar', length: 100, nullable: true })
  department!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Asset, (asset) => asset.managedBy)
  managedAssets!: Asset[];

  @OneToMany(() => AssetRequest, (request) => request.requester)
  requests!: AssetRequest[];

  @OneToMany(() => AssetRequest, (request) => request.processedBy)
  processedRequests!: AssetRequest[];

  @OneToMany(() => MaintenanceRecord, (record) => record.createdBy)
  maintenanceRecords!: MaintenanceRecord[];

  @OneToMany(() => Review, (review) => review.reviewer)
  reviews!: Review[];
}
