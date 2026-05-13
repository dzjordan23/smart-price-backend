import { Processor } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Job } from 'bull';
import { Product } from '../../database/entities/product.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { CrawlerService } from '../crawler/crawler.service';
import { RedisService } from '../../common/services/redis.service';

export const COMPARE_QUEUE = 'compare-queue';

export interface CompareJobData {
  taskId: string;
  productId: number;
  keyword: string;
  platforms: string[];
  userId: number;
}

@Processor(COMPARE_QUEUE)
export class CompareProcessor {
  private readonly logger = new Logger(CompareProcessor.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    private readonly crawlerService: CrawlerService,
    private readonly redisService: RedisService,
  ) {}

  async process(job: Job<CompareJobData>): Promise<any> {
    const { taskId, productId, keyword, platforms } = job.data;

    this.logger.log(`开始处理比价任务 ${taskId}, 商品ID: ${productId}, 关键词: ${keyword}`);

    // 更新任务状态为处理中
    await this.updateTaskStatus(taskId, {
      status: 'processing',
      progress: 10,
      startedAt: new Date().toISOString(),
    });

    try {
      // 更新进度：开始爬取
      await job.progress(30);
      await this.updateTaskStatus(taskId, { progress: 30, stage: 'crawling' });

      // 执行爬虫任务
      const crawlResults = await this.crawlerService.crawlProduct(keyword, platforms);

      // 更新进度：解析数据
      await job.progress(60);
      await this.updateTaskStatus(taskId, { progress: 60, stage: 'parsing' });

      // 保存价格数据
      const prices: ProductPrice[] = [];
      const now = new Date();

      for (const r of crawlResults) {
        if (!r || r.finalPrice <= 0) continue;

        const priceEntity = new ProductPrice();
        priceEntity.productId = productId;
        priceEntity.platform = r.platform;
        priceEntity.platformName = r.platformName;
        priceEntity.originalPrice = r.originalPrice;
        priceEntity.salePrice = r.salePrice;
        priceEntity.finalPrice = r.finalPrice;
        priceEntity.couponInfo = r.couponInfo ?? {};
        priceEntity.promotionInfo = r.promotionInfo ?? {};
        priceEntity.shopName = r.shopName;
        priceEntity.productUrl = r.productUrl;
        priceEntity.isAvailable = r.isAvailable ? 1 : 0;
        priceEntity.crawledAt = now;
        prices.push(priceEntity);
      }

      // 更新进度：保存数据
      await job.progress(80);
      await this.updateTaskStatus(taskId, { progress: 80, stage: 'saving' });

      await this.priceRepo.save(prices);

      // 构建结果
      const result = this.buildCompareResult(productId, keyword, prices);

      // 更新进度：完成
      await job.progress(100);
      await this.updateTaskStatus(taskId, {
        status: 'done',
        progress: 100,
        result,
        completedAt: new Date().toISOString(),
      });

      this.logger.log(`比价任务 ${taskId} 完成，获取 ${prices.length} 条价格数据`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`比价任务 ${taskId} 失败: ${errorMessage}`);

      await this.updateTaskStatus(taskId, {
        status: 'failed',
        error: errorMessage,
        failedAt: new Date().toISOString(),
      });

      throw error;
    }
  }

  private async updateTaskStatus(taskId: string, status: any) {
    try {
      await this.redisService.setTaskStatus(taskId, status, 86400);
    } catch {
      // Redis 不可用时静默失败
    }
  }

  private buildCompareResult(productId: number, name: string, prices: ProductPrice[]) {
    const available = prices.filter((p) => p.isAvailable && p.finalPrice > 0);
    if (available.length === 0) {
      return {
        product: { id: productId, name },
        results: [],
        summary: { lowestPrice: 0, highestPrice: 0, avgPrice: 0, maxSavings: 0, platformCount: 0 },
      };
    }

    const sorted = [...available].sort((a, b) => a.finalPrice - b.finalPrice);
    const results = sorted.map((p, i) => ({
      platform: p.platform,
      platformName: p.platformName,
      shopName: p.shopName,
      originalPrice: Number(p.originalPrice),
      salePrice: Number(p.salePrice),
      finalPrice: Number(p.finalPrice),
      savings: Math.max(0, Number(p.originalPrice) - Number(p.finalPrice)),
      couponInfo: p.couponInfo,
      promotion: (p.promotionInfo as any)?.type || null,
      productUrl: p.productUrl,
      isLowest: i === 0,
    }));

    const totalPrice = available.reduce((sum, p) => sum + Number(p.finalPrice), 0);
    const avgPrice = Math.round((totalPrice / available.length) * 100) / 100;
    const maxSavings = Math.max(0, Number(sorted[0].originalPrice) - Number(sorted[0].finalPrice));

    return {
      product: { id: productId, name },
      results,
      summary: {
        lowestPrice: Number(sorted[0].finalPrice),
        highestPrice: Number(sorted[sorted.length - 1].finalPrice),
        avgPrice,
        maxSavings,
        platformCount: available.length,
      },
    };
  }
}
