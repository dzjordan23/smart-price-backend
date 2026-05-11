import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Product } from '../../database/entities/product.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { ProductSnapshot, ProductSnapshotDocument } from '../../database/schemas';
import { CrawlerService } from '../crawler/crawler.service';
import { CompareDto, RecognizeDto, RecognizeType } from './dto/product.dto';

// 简单内存任务存储（生产环境应用Redis）
const taskStore = new Map<string, { status: string; result?: any }>();

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    @InjectModel(ProductSnapshot.name)
    private readonly snapshotModel: Model<ProductSnapshotDocument>,
    private readonly crawlerService: CrawlerService,
  ) {}

  // ─── 商品识别 ────────────────────────────────────────────────────────────

  async recognize(dto: RecognizeDto) {
    if (dto.type === RecognizeType.KEYWORD) {
      // 关键词模式直接返回
      return {
        recognized: {
          name: dto.keyword,
          brand: this.extractBrand(dto.keyword ?? ''),
          category: '综合',
          spec: '',
          confidence: 1.0,
        },
        suggestions: [],
      };
    }

    if (dto.type === RecognizeType.IMAGE && dto.imageUrl) {
      // 调用腾讯云OCR（简化版，实际需要引入腾讯云SDK）
      return {
        recognized: {
          name: '请根据图片手动确认商品名称',
          brand: '',
          category: '未知',
          spec: '',
          confidence: 0.3,
        },
        suggestions: [],
      };
    }

    return { recognized: null, suggestions: [] };
  }

  // ─── 创建比价任务（异步） ────────────────────────────────────────────────

  async createCompareTask(userId: number, dto: CompareDto) {
    const taskId = uuidv4();
    taskStore.set(taskId, { status: 'processing' });

    // 创建商品记录
    const product = await this.productRepo.save(
      this.productRepo.create({
        userId,
        name: dto.name,
        brand: dto.brand ?? '',
        specDesc: dto.spec ?? '',
        imageUrl: dto.imageUrl ?? '',
        sourceType: 1,
        standardName: dto.name,
        status: 1,
      }),
    );

    // 异步执行爬虫任务（不等待）
    this.runCrawlTask(taskId, product.id, dto).catch((err) => {
      this.logger.error(`爬虫任务 ${taskId} 失败: ${err.message}`);
      taskStore.set(taskId, { status: 'failed' });
    });

    return {
      taskId,
      productId: product.id,
      status: 'processing',
      estimatedTime: 15,
    };
  }

  private async runCrawlTask(taskId: string, productId: number, dto: CompareDto) {
    const platforms = dto.platforms?.length > 0
      ? dto.platforms
      : ['jd', 'pdd', 'taobao'];

    const crawlResults = await this.crawlerService.crawlProduct(dto.name, platforms);

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

      // 保存快照到 MongoDB
      await this.snapshotModel.findOneAndUpdate(
        { productId, platform: r.platform },
        {
          $push: {
            snapshots: {
              price: r.salePrice,
              finalPrice: r.finalPrice,
              couponInfo: r.couponInfo,
              crawledAt: now,
            },
          },
        },
        { upsert: true },
      );
    }

    await this.priceRepo.save(prices);

    const result = this.buildCompareResult(productId, dto.name, prices);
    taskStore.set(taskId, { status: 'done', result });
  }

  // ─── 查询比价结果 ────────────────────────────────────────────────────────

  async getCompareResult(taskId: string) {
    const task = taskStore.get(taskId);
    if (!task) throw new NotFoundException('任务不存在或已过期');

    if (task.status === 'processing') {
      return { status: 'processing', estimatedTime: 10 };
    }
    if (task.status === 'failed') {
      return { status: 'failed', message: '比价失败，请重试' };
    }

    return { status: 'done', ...task.result };
  }

  // ─── 搜索商品 ────────────────────────────────────────────────────────────

  async search(keyword: string, page: number, pageSize: number) {
    const [list, total] = await this.productRepo.findAndCount({
      where: { status: 1 },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { list, total, page, pageSize };
  }

  // ─── 历史价格走势 ────────────────────────────────────────────────────────

  async getPriceHistory(productId: number, days = 30) {
    const product = await this.productRepo.findOne({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('商品不存在');

    const snapshots = await this.snapshotModel
      .find({ productId })
      .sort({ createdAt: -1 })
      .limit(days)
      .exec();

    return {
      productName: product.name,
      history: snapshots.map((s) => ({
        date: (s as any).createdAt?.toISOString().split('T')[0],
        snapshots: s.snapshots.slice(-1)[0],
      })),
    };
  }

  // ─── 私有辅助方法 ────────────────────────────────────────────────────────

  private buildCompareResult(productId: number, name: string, prices: ProductPrice[]) {
    const available = prices.filter((p) => p.isAvailable && p.finalPrice > 0);
    if (available.length === 0) {
      return {
        product: { id: productId, name },
        results: [],
        summary: { lowestPrice: 0, highestPrice: 0, platformCount: 0 },
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
      savings: Number(p.originalPrice) - Number(p.finalPrice),
      couponInfo: p.couponInfo,
      promotion: (p.promotionInfo as any)?.type || null,
      productUrl: p.productUrl,
      isLowest: i === 0,
    }));

    return {
      product: { id: productId, name },
      results,
      summary: {
        lowestPrice: Number(sorted[0].finalPrice),
        highestPrice: Number(sorted[sorted.length - 1].finalPrice),
        avgPrice:
          Math.round(
            (available.reduce((sum, p) => sum + Number(p.finalPrice), 0) /
              available.length) *
              100,
          ) / 100,
        maxSavings:
          Number(sorted[0].originalPrice) - Number(sorted[0].finalPrice),
        platformCount: available.length,
      },
    };
  }

  private extractBrand(name: string): string {
    const brands = ['Apple', 'Samsung', '华为', '小米', 'OPPO', 'vivo', '联想', '戴尔', 'HP', 'Sony'];
    for (const b of brands) {
      if (name.includes(b)) return b;
    }
    return '';
  }
}
