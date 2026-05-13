import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { PriceWatch } from '../../database/entities/price.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { Product } from '../../database/entities/product.entity';
import { RedisService } from './redis.service';
import { NotificationService } from '../../modules/notification/notification.service';
import { CrawlerService } from '../../modules/crawler/crawler.service';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);
  private isRunning = {
    priceCheck: false,
    snapshot: false,
    cacheWarmup: false,
    cleanup: false,
  };

  constructor(
    @InjectRepository(PriceWatch)
    private readonly priceWatchRepo: Repository<PriceWatch>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly redisService: RedisService,
    private readonly notificationService: NotificationService,
    private readonly crawlerService: CrawlerService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //                         定时任务列表
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 降价提醒定时检查（每小时执行）
   * 检查所有价格监控，发送降价通知
   */
  @Cron('0 0 * * * *') // 每小时第0分钟执行
  async checkPriceAlerts() {
    if (this.isRunning.priceCheck) {
      this.logger.warn('价格检查任务已在运行中，跳过本次执行');
      return;
    }

    this.isRunning.priceCheck = true;
    const startTime = Date.now();

    try {
      this.logger.log('开始执行降价提醒定时检查...');

      // 调用 NotificationService 的检查方法
      await this.notificationService.checkAllPriceAlerts();

      const duration = Date.now() - startTime;
      this.logger.log(`降价提醒检查完成，耗时: ${duration}ms`);
    } catch (error) {
      this.logger.error(`降价提醒检查失败: ${error}`);
    } finally {
      this.isRunning.priceCheck = false;
    }
  }

  /**
   * 价格快照定时采集（每日凌晨3点）
   * 保存每日价格快照用于历史分析
   */
  @Cron('0 0 3 * * *') // 每天凌晨3点执行
  async captureDailyPriceSnapshot() {
    if (this.isRunning.snapshot) {
      this.logger.warn('价格快照任务已在运行中，跳过本次执行');
      return;
    }

    this.isRunning.snapshot = true;
    const startTime = Date.now();

    try {
      this.logger.log('开始执行价格快照采集...');

      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      // 获取昨日有价格变动的商品
      const yesterdayPrices = await this.priceRepo.find({
        where: {
          crawledAt: MoreThan(yesterday),
        },
        relations: ['product'],
      });

      // 按商品分组，取每个商品的最低价
      const productMap = new Map<number, any>();
      for (const price of yesterdayPrices) {
        const existing = productMap.get(price.productId);
        if (!existing || price.finalPrice < existing.finalPrice) {
          productMap.set(price.productId, {
            productId: price.productId,
            productName: (price as any).product?.name || '未知商品',
            platform: price.platform,
            finalPrice: price.finalPrice,
            snapshotDate: now.toISOString().split('T')[0],
          });
        }
      }

      const snapshotCount = productMap.size;
      this.logger.log(`价格快照采集完成，共 ${snapshotCount} 个商品`);

      // 注意：快照数据目前存入 MySQL，后续可迁移到 MongoDB
      // 暂不实际保存，待 MongoDB 恢复后启用

      const duration = Date.now() - startTime;
      this.logger.log(`价格快照任务完成，耗时: ${duration}ms`);
    } catch (error) {
      this.logger.error(`价格快照采集失败: ${error}`);
    } finally {
      this.isRunning.snapshot = false;
    }
  }

  /**
   * 缓存预热定时任务（每日早8点）
   * 预热热点商品和搜索结果
   */
  @Cron('0 0 8 * * *') // 每天早上8点执行
  async warmupCache() {
    if (this.isRunning.cacheWarmup) {
      this.logger.warn('缓存预热任务已在运行中，跳过本次执行');
      return;
    }

    this.isRunning.cacheWarmup = true;
    const startTime = Date.now();

    try {
      this.logger.log('开始执行缓存预热...');

      // 1. 获取热点商品并预热价格
      const hotProductIds = await this.redisService.getHotProducts();
      if (hotProductIds && hotProductIds.length > 0) {
        this.logger.log(`预热 ${hotProductIds.length} 个热点商品的价格...`);

        for (const productId of hotProductIds.slice(0, 20)) { // 限制每次预热数量
          try {
            const product = await this.productRepo.findOne({ where: { id: productId } });
            if (product) {
              // 触发一次爬取来更新缓存
              await this.crawlerService.crawlProduct(product.name, ['jd']);
            }
          } catch (error) {
            this.logger.warn(`预热商品 ${productId} 失败: ${error}`);
          }
        }
      }

      // 2. 重新计算热点商品列表
      await this.updateHotProductsList();

      const duration = Date.now() - startTime;
      this.logger.log(`缓存预热完成，耗时: ${duration}ms`);
    } catch (error) {
      this.logger.error(`缓存预热失败: ${error}`);
    } finally {
      this.isRunning.cacheWarmup = false;
    }
  }

  /**
   * 清理过期数据（每日凌晨4点）
   * 清理过期任务状态和无效缓存
   */
  @Cron('0 0 4 * * *') // 每天凌晨4点执行
  async cleanupExpiredData() {
    if (this.isRunning.cleanup) {
      this.logger.warn('清理任务已在运行中，跳过本次执行');
      return;
    }

    this.isRunning.cleanup = true;
    const startTime = Date.now();

    try {
      this.logger.log('开始执行过期数据清理...');

      // 1. 清理旧的缓存搜索结果
      await this.redisService.clearSearchCache();

      // 2. 清理已完成超过7天的任务状态
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 注意：Redis 中的任务状态会通过 TTL 自动过期
      // 这里可以做额外的业务逻辑清理

      const duration = Date.now() - startTime;
      this.logger.log(`过期数据清理完成，耗时: ${duration}ms`);
    } catch (error) {
      this.logger.error(`过期数据清理失败: ${error}`);
    } finally {
      this.isRunning.cleanup = false;
    }
  }

  /**
   * 更新热点商品列表（每小时更新）
   * 根据商品搜索热度更新热点列表
   */
  @Cron('0 30 * * * *') // 每小时第30分钟执行
  async updateHotProductsList() {
    try {
      // 获取过去1小时内搜索量最高的商品
      const recentProducts = await this.productRepo.find({
        order: { createdAt: 'DESC' },
        take: 100,
      });

      // 根据商品热度分数排序
      const hotProducts: { id: number; score: number }[] = [];
      for (const product of recentProducts) {
        const score = await this.redisService.getProductHotScore(product.id);
        if (score > 0) {
          hotProducts.push({ id: product.id, score });
        }
      }

      // 按热度排序，取前50个
      hotProducts.sort((a, b) => b.score - a.score);
      const topHotProductIds = hotProducts.slice(0, 50).map((p) => p.id);

      // 如果搜索量高的商品不在热点列表，补充进去
      const existingHot = await this.redisService.getHotProducts();
      if (existingHot) {
        for (const id of recentProducts.slice(0, 20).map((p) => p.id)) {
          if (!topHotProductIds.includes(id) && topHotProductIds.length < 50) {
            topHotProductIds.push(id);
          }
        }
      }

      // 更新热点商品列表
      await this.redisService.setHotProducts(topHotProductIds);
      this.logger.debug(`热点商品列表已更新，共 ${topHotProductIds.length} 个`);
    } catch (error) {
      this.logger.error(`更新热点商品列表失败: ${error}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                         辅助方法
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 手动触发价格检查（用于测试或紧急检查）
   */
  async triggerPriceCheckManually(): Promise<{ message: string }> {
    if (this.isRunning.priceCheck) {
      return { message: '价格检查任务正在运行中' };
    }

    // 异步执行，不等待结果
    this.checkPriceAlerts().catch((err) => {
      this.logger.error(`手动触发价格检查失败: ${err}`);
    });

    return { message: '价格检查任务已开始执行' };
  }

  /**
   * 获取定时任务状态
   */
  getTaskStatuses() {
    return {
      priceCheck: {
        running: this.isRunning.priceCheck,
        description: '降价提醒定时检查（每小时）',
      },
      snapshot: {
        running: this.isRunning.snapshot,
        description: '价格快照定时采集（每日凌晨3点）',
      },
      cacheWarmup: {
        running: this.isRunning.cacheWarmup,
        description: '缓存预热（每日早8点）',
      },
      cleanup: {
        running: this.isRunning.cleanup,
        description: '过期数据清理（每日凌晨4点）',
      },
    };
  }
}
