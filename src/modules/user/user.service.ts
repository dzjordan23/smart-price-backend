import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { PurchaseRecord } from '../../database/entities/purchase.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PurchaseRecord)
    private readonly purchaseRepo: Repository<PurchaseRecord>,
  ) {}

  async getProfile(userId: number) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const orderCount = await this.purchaseRepo.count({
      where: { userId },
    });

    return {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      phone: user.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null,
      isVip: user.role === 1,
      vipExpireAt: user.vipExpireAt,
      commissionBalance: Number(user.commissionBalance),
      totalCommission: Number(user.totalCommission),
      orderCount,
    };
  }

  async getCommissions(userId: number, page: number, pageSize: number) {
    const [list, total] = await this.purchaseRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { list, total, page, pageSize };
  }
}
