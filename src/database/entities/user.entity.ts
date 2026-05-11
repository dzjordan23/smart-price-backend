import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Index({ unique: true })
  @Column({ length: 64 })
  openid: string;

  @Column({ length: 64, nullable: true })
  unionid: string;

  @Column({ length: 50, nullable: true })
  nickname: string;

  @Column({ name: 'avatar_url', length: 255, nullable: true })
  avatarUrl: string;

  @Index()
  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ type: 'tinyint', default: 0, comment: '0:普通用户 1:VIP' })
  role: number;

  @Column({ name: 'vip_expire_at', nullable: true })
  vipExpireAt: Date;

  @Column({
    name: 'commission_balance',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  commissionBalance: number;

  @Column({
    name: 'total_commission',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalCommission: number;

  @Column({ type: 'tinyint', default: 1, comment: '0:禁用 1:正常' })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
