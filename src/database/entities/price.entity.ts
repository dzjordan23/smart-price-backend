import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_prices')
export class ProductPrice {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Index()
  @Column({ name: 'product_id', type: 'bigint' })
  productId: number;

  @Index()
  @Column({ length: 20 })
  platform: string;

  @Column({ name: 'platform_name', length: 200, nullable: true })
  platformName: string;

  @Column({
    name: 'original_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  originalPrice: number;

  @Column({
    name: 'sale_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  salePrice: number;

  @Index()
  @Column({ name: 'final_price', type: 'decimal', precision: 10, scale: 2 })
  finalPrice: number;

  @Column({ name: 'coupon_info', type: 'json', nullable: true })
  couponInfo: object;

  @Column({ name: 'promotion_info', type: 'json', nullable: true })
  promotionInfo: object;

  @Column({ name: 'shop_name', length: 100, nullable: true })
  shopName: string;

  @Column({ name: 'product_url', length: 500, nullable: true })
  productUrl: string;

  @Column({ name: 'is_available', type: 'tinyint', default: 1 })
  isAvailable: number;

  @Index()
  @Column({ name: 'crawled_at' })
  crawledAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;
}

@Entity('price_watches')
export class PriceWatch {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: number;

  @Column({
    name: 'target_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  targetPrice: number;

  @Column({ type: 'json', nullable: true })
  platforms: string[];

  @Column({ type: 'tinyint', default: 1, comment: '1:监控中 0:已停止' })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
