import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Asset } from './Asset';

@Entity({ name: 'categories' })
@Unique('UQ_categories_name', ['name'])
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 60 })
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** FK is ON DELETE RESTRICT: a category with assets cannot be deleted. */
  @OneToMany(() => Asset, (asset) => asset.category)
  assets!: Asset[];
}
