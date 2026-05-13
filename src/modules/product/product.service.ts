import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository, Like, In } from 'typeorm';
import type { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { Product } from '../../database/entities/product.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { CrawlerService } from '../crawler/crawler.service';
import { RedisService } from '../../common/services/redis.service';
import { OcrService } from '../../common/services/ocr.service';
import { CompareDto, RecognizeDto, RecognizeType } from './dto/product.dto';
import { COMPARE_QUEUE, CompareJobData } from '../compare/compare.processor';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  // 内存降级存储（Redis 不可用时使用）
  private memoryStore = new Map<string, any>();

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    private readonly crawlerService: CrawlerService,
    private readonly redisService: RedisService,
    private readonly ocrService: OcrService,
    @InjectQueue(COMPARE_QUEUE)
    private readonly compareQueue: Queue<CompareJobData>,
  ) {}

  // ─── 商品识别 ────────────────────────────────────────────────────────────

  async recognize(dto: RecognizeDto) {
    if (dto.type === RecognizeType.KEYWORD) {
      return {
        recognized: {
          name: dto.keyword,
          brand: this.extractBrand(dto.keyword ?? ''),
          category: this.guessCategory(dto.keyword ?? ''),
          spec: this.extractSpec(dto.keyword ?? ''),
          confidence: 1.0,
        },
        suggestions: await this.getSearchSuggestions(dto.keyword ?? ''),
      };
    }

    if (dto.type === RecognizeType.IMAGE && dto.imageUrl) {
      // 调用腾讯云 OCR 识别
      try {
        const ocrResult = await this.ocrService.recognizeProduct({
          imageUrl: dto.imageUrl,
        });

        return {
          recognized: {
            name: ocrResult.productName || ocrResult.text.slice(0, 50),
            brand: ocrResult.brand,
            category: this.guessCategory(ocrResult.productName || ocrResult.text),
            spec: ocrResult.spec,
            confidence: ocrResult.confidence,
            rawText: ocrResult.text,
          },
          suggestions: [],
        };
      } catch (error) {
        this.logger.error(`OCR 识别失败: ${error}`);
        return {
          recognized: {
            name: '图片识别失败，请尝试手动输入',
            brand: '',
            category: '未知',
            spec: '',
            confidence: 0,
          },
          suggestions: [],
        };
      }
    }

    return { recognized: null, suggestions: [] };
  }

  // ─── 创建比价任务（异步） ────────────────────────────────────────────────

  async createCompareTaskAnonymous(dto: CompareDto) {
    // 匿名用户使用固定 ID
    return this.createCompareTask(1, dto);
  }

  async createCompareTask(userId: number, dto: CompareDto) {
    const taskId = uuidv4();

    // 使用 Redis 存储任务状态（见 RedisTaskStore）
    await this.setTaskStatus(taskId, { status: 'pending', createdAt: new Date() });

    // 保存商品记录
    const product = await this.productRepo.save(
      this.productRepo.create({
        userId,
        name: dto.keyword || dto.name || '未命名商品',
        brand: dto.brand ?? '',
        specDesc: dto.spec ?? '',
        imageUrl: dto.imageUrl ?? '',
        sourceType: 1,
        standardName: dto.keyword || dto.name || '',
        status: 1,
      }),
    );

    // 获取平台列表
    const platforms: string[] = dto.platforms && dto.platforms.length > 0
      ? dto.platforms
      : ['jd', 'pdd', 'taobao', 'douyin'];

    // 通过 Bull 队列提交爬虫任务
    const jobData: CompareJobData = {
      taskId,
      productId: product.id,
      keyword: dto.keyword || dto.name || '',
      platforms,
      userId,
    };

    try {
      // 设置并发限制：最多同时运行5个爬虫任务
      const activeCount = await this.compareQueue.getActiveCount();
      if (activeCount >= 5) {
        this.logger.warn(`爬虫队列已满(${activeCount}个任务运行中)，任务 ${taskId} 将等待执行`);
      }

      const job = await this.compareQueue.add(jobData, {
        jobId: taskId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      });

      this.logger.log(`比价任务 ${taskId} 已提交到队列，Job ID: ${job.id}`);

      return {
        taskId,
        productId: product.id,
        status: 'processing',
        jobId: job.id?.toString(),
        estimatedTime: 15,
        queuePosition: activeCount,
      };
    } catch (error) {
      this.logger.error(`提交比价任务到队列失败: ${error}`);
      // 队列不可用时降级到直接执行
      return this.createCompareTaskFallback(userId, dto, taskId, product.id);
    }
  }

  /**
   * 降级方案：队列不可用时直接执行爬虫任务
   */
  private async createCompareTaskFallback(
    userId: number,
    dto: CompareDto,
    taskId: string,
    productId: number,
  ) {
    this.logger.warn(`任务 ${taskId} 使用降级方案直接执行`);

    // 异步执行爬虫任务
    this.runCrawlTask(taskId, productId, dto).catch((err) => {
      this.logger.error(`爬虫任务 ${taskId} 失败: ${err.message}`);
      this.setTaskStatus(taskId, { status: 'failed', error: err.message });
    });

    return {
      taskId,
      productId,
      status: 'processing',
      estimatedTime: 15,
    };
  }

  private async runCrawlTask(taskId: string, productId: number, dto: CompareDto) {
    const platforms: string[] = dto.platforms && dto.platforms.length > 0
      ? dto.platforms
      : ['jd', 'pdd', 'taobao', 'douyin'];

    try {
      const crawlResults = await this.crawlerService.crawlProduct(
        dto.keyword || dto.name || '',
        platforms,
      );

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

      await this.priceRepo.save(prices);

      const result = this.buildCompareResult(productId, dto.keyword || dto.name || '', prices);
      await this.setTaskStatus(taskId, { status: 'done', result, completedAt: new Date() });
    } catch (error) {
      await this.setTaskStatus(taskId, { status: 'failed', error: (error as Error).message });
      throw error;
    }
  }

  // ─── 查询比价结果 ────────────────────────────────────────────────────────

  async getCompareResult(taskId: string) {
    // 优先从 Redis 获取
    const cached = await this.getTaskStatus(taskId);
    if (cached) {
      return cached;
    }

    // 降级：从数据库查询（根据 taskId 格式判断）
    // taskId 实际上是 productId 的情况
    if (/^\d+$/.test(taskId)) {
      const productId = parseInt(taskId, 10);
      return this.getCompareResultByProductId(productId);
    }

    throw new NotFoundException('任务不存在或已过期');
  }

  /**
   * 根据 productId 获取最新比价结果
   */
  async getCompareResultByProductId(productId: number) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    const prices = await this.priceRepo.find({
      where: { productId },
      order: { crawledAt: 'DESC' },
    });

    if (prices.length === 0) {
      return {
        status: 'done',
        product: { id: productId, name: product.name },
        results: [],
        summary: { lowestPrice: 0, highestPrice: 0, platformCount: 0 },
      };
    }

    return {
      status: 'done',
      ...this.buildCompareResult(productId, product.name, prices),
    };
  }

  // ─── 搜索商品 ────────────────────────────────────────────────────────────

  async search(keyword: string, page: number, pageSize: number) {
    const whereCondition = keyword
      ? [
          { name: Like(`%${keyword}%`), status: 1 },
          { brand: Like(`%${keyword}%`), status: 1 },
          { standardName: Like(`%${keyword}%`), status: 1 },
        ]
      : { status: 1 };

    const [list, total] = await this.productRepo.findAndCount({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 为每个商品获取最新价格
    const enrichedList = await Promise.all(
      list.map(async (product) => {
        const latestPrice = await this.priceRepo.findOne({
          where: { productId: product.id },
          order: { crawledAt: 'DESC' },
        });

        return {
          id: product.id,
          name: product.name,
          brand: product.brand,
          categoryId: product.categoryId,
          imageUrl: product.imageUrl,
          standardName: product.standardName,
          createdAt: product.createdAt,
          latestPrice: latestPrice
            ? {
                platform: latestPrice.platform,
                platformName: latestPrice.platformName,
                finalPrice: Number(latestPrice.finalPrice),
                originalPrice: Number(latestPrice.originalPrice),
                couponInfo: latestPrice.couponInfo,
                productUrl: latestPrice.productUrl,
                crawledAt: latestPrice.crawledAt,
              }
            : null,
        };
      }),
    );

    return { list: enrichedList, total, page, pageSize };
  }

  // ─── 获取商品详情 ────────────────────────────────────────────────────────

  async getProductById(productId: number) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    // 获取最新价格
    const latestPrice = await this.priceRepo.findOne({
      where: { productId },
      order: { crawledAt: 'DESC' },
    });

    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      categoryId: product.categoryId,
      specDesc: product.specDesc,
      imageUrl: product.imageUrl,
      standardName: product.standardName,
      createdAt: product.createdAt,
      latestPrice: latestPrice
        ? {
            platform: latestPrice.platform,
            platformName: latestPrice.platformName,
            finalPrice: Number(latestPrice.finalPrice),
            originalPrice: Number(latestPrice.originalPrice),
            couponInfo: latestPrice.couponInfo,
            promotionInfo: latestPrice.promotionInfo,
            shopName: latestPrice.shopName,
            productUrl: latestPrice.productUrl,
            crawledAt: latestPrice.crawledAt,
          }
        : null,
    };
  }

  // ─── 历史价格走势（暂用 MySQL，不依赖 MongoDB） ──────────────────────────

  async getPriceHistory(productId: number, days = 30) {
    const product = await this.productRepo.findOne({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('商品不存在');

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const prices = await this.priceRepo
      .createQueryBuilder('price')
      .where('price.productId = :productId', { productId })
      .andWhere('price.crawledAt >= :sinceDate', { sinceDate })
      .orderBy('price.crawledAt', 'ASC')
      .getMany();

    return {
      productId,
      productName: product.name,
      history: prices.map((p) => ({
        date: p.crawledAt?.toISOString().split('T')[0],
        platform: p.platform,
        platformName: p.platformName,
        finalPrice: Number(p.finalPrice),
        originalPrice: Number(p.originalPrice),
        salePrice: Number(p.salePrice),
        shopName: p.shopName,
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

  private extractBrand(name: string): string {
    const brands = [
      'Apple', 'Samsung', '华为', '小米', 'OPPO', 'vivo', '荣耀',
      '联想', '戴尔', 'HP', 'Sony', '索尼', '格力', '美的',
      '海尔', '九阳', '苏泊尔', '耐克', '阿迪达斯', '彪马',
    ];
    for (const b of brands) {
      if (name.toLowerCase().includes(b.toLowerCase())) return b;
    }
    return '';
  }

  private extractSpec(name: string): string {
    // 提取规格信息：内存、存储、颜色等
    const specs: string[] = [];

    // 存储规格
    const storageMatch = name.match(/(\d+)[GB兆]B?/i);
    if (storageMatch) specs.push(`${storageMatch[1]}GB`);

    // 颜色
    const colors = ['黑色', '白色', '银色', '金色', '蓝色', '绿色', '紫色', '红色'];
    for (const color of colors) {
      if (name.includes(color)) {
        specs.push(color);
        break;
      }
    }

    return specs.join(' / ');
  }

  private guessCategory(name: string): string {
    const categories: Record<string, string[]> = {
      '手机': ['手机', 'iPhone', '小米手机', '华为手机'],
      '电脑': ['笔记本', '电脑', 'MacBook', 'ThinkPad'],
      '平板': ['平板', 'iPad', 'MatePad'],
      '耳机': ['耳机', 'AirPods', '蓝牙耳机'],
      '手表': ['手表', 'Watch', '手环'],
      '相机': ['相机', '单反', '微单'],
      '家电': ['冰箱', '洗衣机', '空调', '电视'],
      '食品': ['零食', '食品', '饮料'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      for (const kw of keywords) {
        if (name.includes(kw)) return category;
      }
    }
    return '综合';
  }

  private async getSearchSuggestions(keyword: string): Promise<string[]> {
    if (!keyword || keyword.length < 2) return [];

    const products = await this.productRepo.find({
      where: { name: Like(`%${keyword}%`), status: 1 },
      select: ['name', 'brand'],
      take: 5,
    });

    const suggestions = new Set<string>();

    for (const p of products) {
      if (p.brand && keyword.toLowerCase().includes(p.brand.toLowerCase())) {
        suggestions.add(p.name);
      }
    }

    return Array.from(suggestions).slice(0, 5);
  }

  // ─── Redis 任务状态管理（带内存降级） ───────────────────────────────────

  /**
   * 设置任务状态（优先使用 Redis，失败时降级到内存）
   * @param taskId 任务ID
   * @param status 任务状态
   * @param ttlSeconds 过期时间（秒），默认24小时
   */
  private async setTaskStatus(taskId: string, status: any, ttlSeconds = 86400) {
    try {
      await this.redisService.setTaskStatus(taskId, status, ttlSeconds);
    } catch {
      // Redis 不可用，降级到内存
      this.memoryStore.set(taskId, {
        ...status,
        updatedAt: new Date(),
      });
    }
  }

  /**
   * 获取任务状态（优先使用 Redis，失败时降级到内存）
   */
  private async getTaskStatus(taskId: string): Promise<any | null> {
    try {
      const result = await this.redisService.getTaskStatus(taskId);
      if (result) return result;
    } catch {
      // Redis 不可用，降级到内存
    }

    return this.memoryStore.get(taskId) || null;
  }
}
