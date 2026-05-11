import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceWatch, ProductPrice } from '../../database/entities/price.entity';
import { PurchaseRecord } from '../../database/entities/purchase.entity';

@Injectable()
export class PriceService {
  constructor(
    @InjectRepository(PriceWatch)
    private readonly watchRepo: Repository<PriceWatch>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    @InjectRepository(PurchaseRecord)
    private readonly purchaseRepo: Repository<PurchaseRecord>,
  ) {}

  async addWatch(userId: number, productId: number, targetPrice: number, platforms: string[]) {
    const existing = await this.watchRepo.findOne({
      where: { userId, productId, status: 1 },
    });
    if (existing) {
      existing.targetPrice = targetPrice;
      existing.platforms = platforms;
      return this.watchRepo.save(existing);
    }

    return this.watchRepo.save(
      this.watchRepo.create({ userId, productId, targetPrice, platforms, status: 1 }),
    );
  }

  async getWatchList(userId: number, page: number, pageSize: number) {
    const [list, total] = await this.watchRepo.findAndCount({
      where: { userId, status: 1 },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async confirmPurchase(
    userId: number,
    productId: number,
    priceId: number,
    platform: string,
  ) {
    const price = await this.priceRepo.findOne({ where: { id: priceId } });

    const commissionRate = this.getCommissionRate(platform);
    const commissionAmount = price
      ? Number(price.finalPrice) * commissionRate
      : 0;

    return this.purchaseRepo.save(
      this.purchaseRepo.create({
        userId,
        productId,
        priceId,
        platform,
        commissionRate,
        commissionAmount,
        status: 0,
      }),
    );
  }

  private getCommissionRate(platform: string): number {
    const rates: Record<string, number> = {
      taobao: 0.04,
      jd: 0.035,
      pdd: 0.05,
      douyin: 0.03,
    };
    return rates[platform] || 0.03;
  }
}
