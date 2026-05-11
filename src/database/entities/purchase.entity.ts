import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('purchase_records')
export class PurchaseRecord {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: number;

  @Column({ name: 'price_id', type: 'bigint' })
  priceId: number;

  @Column({ length: 20 })
  platform: string;

  @Column({
    name: 'commission_rate',
    type: 'decimal',
    precision: 5,
    scale: 4,
    default: 0,
  })
  commissionRate: number;

  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  commissionAmount: number;

  @Column({
    name: 'actual_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  actualAmount: number;

  @Column({
    type: 'tinyint',
    default: 0,
    comment: '0:待确认 1:已确认 2:已结算 3:已失效',
  })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'confirmed_at', nullable: true })
  confirmedAt: Date;
}
