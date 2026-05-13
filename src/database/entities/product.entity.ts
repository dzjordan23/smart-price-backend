import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'parent_id', default: 0 })
  parentId: number;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 100, nullable: true })
  icon: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;
}

@Entity('products')
@Index('idx_products_name_fulltext', ['name'], { fulltext: true })
@Index('idx_products_standard_name_fulltext', ['standardName'], { fulltext: true })
export class Product {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 50, nullable: true })
  brand: string;

  @Index()
  @Column({ name: 'category_id', nullable: true })
  categoryId: number;

  @Column({ name: 'spec_desc', length: 500, nullable: true })
  specDesc: string;

  @Column({ name: 'image_url', length: 500, nullable: true })
  imageUrl: string;

  @Column({
    name: 'source_type',
    type: 'tinyint',
    comment: '1:手动 2:OCR 3:链接',
  })
  sourceType: number;

  @Column({ name: 'source_url', length: 500, nullable: true })
  sourceUrl: string;

  @Index()
  @Column({ name: 'standard_name', length: 200, nullable: true })
  standardName: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
