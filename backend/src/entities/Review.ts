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
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Asset } from './Asset';
import { AssetRequest } from './AssetRequest';
import { User } from './User';

/** One review per COMPLETED request (one-to-one), written by the requester. */
@Entity({ name: 'reviews' })
@Unique('UQ_reviews_request_id', ['requestId'])
@Index('IDX_reviews_asset_id', ['assetId'])
@Index('IDX_reviews_reviewer_id', ['reviewerId'])
@Check('CHK_reviews_rating', '"rating" BETWEEN 1 AND 5')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @OneToOne(() => AssetRequest, (request) => request.review, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'request_id' })
  request!: AssetRequest;

  /** Denormalized from the request so per-asset rating aggregation is a single grouped query. */
  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @ManyToOne(() => Asset, (asset) => asset.reviews, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_id' })
  asset!: Asset;

  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId!: string;

  @ManyToOne(() => User, (user) => user.reviews, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer!: User;

  @Column({ name: 'rating', type: 'smallint' })
  rating!: number;

  @Column({ name: 'comment', type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
