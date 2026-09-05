import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AssetCondition, RequestStatus } from '../common/enums';
import { Asset } from './Asset';
import { User } from './User';
import { Review } from './Review';

@Entity({ name: 'asset_requests' })
@Index('IDX_asset_requests_requester_status', ['requesterId', 'status'])
@Index('IDX_asset_requests_asset_status', ['assetId', 'status'])
@Index('IDX_asset_requests_status', ['status'])
@Index('IDX_asset_requests_created_at', ['createdAt'])
/** One unit is promised/held by at most one request at a time (DB-level guarantee). */
@Index('UQ_asset_requests_active_asset', ['assetId'], {
  unique: true,
  where: `"status" IN ('APPROVED', 'ALLOCATED', 'RETURN_PENDING')`,
})
/** An employee cannot hold two active requests for the same unit. */
@Index('UQ_asset_requests_active_requester_asset', ['assetId', 'requesterId'], {
  unique: true,
  where: `"status" IN ('PENDING', 'APPROVED', 'ALLOCATED', 'RETURN_PENDING')`,
})
@Check('CHK_asset_requests_dates', '"expected_return_date" >= "requested_from"')
export class AssetRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @ManyToOne(() => Asset, (asset) => asset.requests, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_id' })
  asset!: Asset;

  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId!: string;

  @ManyToOne(() => User, (user) => user.requests, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  /** Staff member who performed the latest transition (approve/reject/allocate/complete). */
  @Column({ name: 'processed_by_id', type: 'uuid', nullable: true })
  processedById!: string | null;

  @ManyToOne(() => User, (user) => user.processedRequests, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'processed_by_id' })
  processedBy!: User | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: RequestStatus,
    enumName: 'request_status_enum',
    default: RequestStatus.PENDING,
  })
  status!: RequestStatus;

  @Column({ name: 'purpose', type: 'text' })
  purpose!: string;

  @Column({ name: 'requested_from', type: 'date' })
  requestedFrom!: string;

  @Column({ name: 'expected_return_date', type: 'date' })
  expectedReturnDate!: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'allocated_at', type: 'timestamptz', nullable: true })
  allocatedAt!: Date | null;

  @Column({ name: 'return_initiated_at', type: 'timestamptz', nullable: true })
  returnInitiatedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({
    name: 'return_condition',
    type: 'enum',
    enum: AssetCondition,
    enumName: 'asset_condition_enum',
    nullable: true,
  })
  returnCondition!: AssetCondition | null;

  @Column({ name: 'return_notes', type: 'text', nullable: true })
  returnNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => Review, (review) => review.request)
  review!: Review | null;
}
