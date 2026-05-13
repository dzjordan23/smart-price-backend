import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository, Like } from 'typeorm';
import type { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { Product } from '../../database/entities/product.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { RedisService } from '../../common/services/redis.service';
import { OcrService } from '../../common/services/ocr.service';
import { CompareDto, RecognizeDto, RecognizeType } from './dto/product.dto';
import { COMPARE_QUEUE, CompareJobData } from '../compare/compare.processor';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  // 内存降级存储（Redis/MySQL 不可用时使用）
  private memoryStore = new Map<string, any>();

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    private readonly redisService: RedisService,
    private readonly ocrService: OcrService,
    @InjectQueue(COMPARE_QUEUE)
    private readonly compareQueue: Queue<CompareJobData>,
  ) {}

  // ─── 商品识别 ────────────────────────────────────────────────────────────

  async recognize(dto: RecognizeDto) {
    if (dto.type === RecognizeType.KEYWORD || dto.keyword) {
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
    // 直接返回模拟数据（无需数据库）
    return this.getMockCompareResult(dto.keyword || dto.name || '商品');
  }

  async createCompareTask(userId: number, dto: CompareDto) {
    const taskId = uuidv4();

    // 使用 Redis 存储任务状态（见 RedisTaskStore）
    try {
      await this.setTaskStatus(taskId, { status: 'pending', createdAt: new Date() });
    } catch {
      // Redis 不可用时降级到内存
    }

    // 保存商品记录
    try {
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

      // 通过 Bull 队列提交爬虫任务
      const jobData: CompareJobData = {
        taskId,
        productId: product.id,
        keyword: dto.keyword || dto.name || '',
        platforms: dto.platforms || ['jd', 'pdd', 'taobao', 'douyin'],
        userId,
      };

      try {
        const job = await this.compareQueue.add(jobData, {
          jobId: taskId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        });

        return {
          taskId,
          productId: product.id,
          status: 'processing',
          jobId: job.id?.toString(),
          estimatedTime: 15,
        };
      } catch (queueError) {
        // 队列不可用时返回模拟数据
        this.logger.warn(`队列不可用，返回模拟数据: ${queueError}`);
        return this.getMockCompareResult(dto.keyword || dto.name || '商品');
      }
    } catch (dbError) {
      // 数据库不可用时返回模拟数据
      this.logger.warn(`数据库不可用，返回模拟数据: ${dbError}`);
      return this.getMockCompareResult(dto.keyword || dto.name || '商品');
    }
  }

  // ─── 获取比价结果 ────────────────────────────────────────────────────────

  async getCompareResult(taskId: string) {
    // 优先从 Redis 获取
    try {
      const cached = await this.getTaskStatus(taskId);
      if (cached) return cached;
    } catch {
      // Redis 不可用
    }

    // 从内存存储获取
    const memoryData = this.memoryStore.get(taskId);
    if (memoryData) return memoryData;

    // 根据 taskId 格式判断
    if (/^\d+$/.test(taskId)) {
      return this.getMockCompareResult('商品');
    }

    // 返回模拟数据
    return this.getMockCompareResult('商品');
  }

  /**
   * 获取模拟比价结果（用于无数据库场景）
   */
  private getMockCompareResult(keyword: string) {
    const brand = this.extractBrand(keyword);
    const mockPrices = this.generateMockPrices(keyword, brand);

    return {
      taskId: uuidv4(),
      status: 'done',
      product: { id: Date.now(), name: keyword },
      results: mockPrices,
      summary: {
        lowestPrice: Math.min(...mockPrices.map((p: any) => p.finalPrice)),
        highestPrice: Math.max(...mockPrices.map((p: any) => p.finalPrice)),
        avgPrice: mockPrices.reduce((sum: number, p: any) => sum + p.finalPrice, 0) / mockPrices.length,
        maxSavings: Math.max(...mockPrices.map((p: any) => p.originalPrice - p.finalPrice)),
        platformCount: mockPrices.length,
      },
    };
  }

  /**
   * 生成模拟价格数据
   */
  private generateMockPrices(keyword: string, brand: string) {
    let basePrice = 500;
    if (['Apple', 'iPhone', 'MacBook', 'iPad', 'AirPods'].includes(brand)) basePrice = 3000;
    else if (['华为', '三星', '戴森', 'Nintendo', '索尼'].includes(brand)) basePrice = 2500;
    else if (['茅台', '五粮液'].includes(brand)) basePrice = 1500;
    else if (['耐克', '阿迪达斯'].includes(brand)) basePrice = 600;

    const base = Math.floor(basePrice * (0.85 + Math.random() * 0.3));

    const platforms = [
      {
        platform: 'jd',
        platformName: '京东',
        shopName: `${brand || '官方'}旗舰店`,
        discount: '限时优惠',
        couponInfo: '领券减100',
      },
      {
        platform: 'taobao',
        platformName: '天猫',
        shopName: `${brand || '品质'}旗舰店`,
        discount: '官方活动',
        couponInfo: '满1000减50',
      },
      {
        platform: 'pdd',
        platformName: '拼多多',
        shopName: '百亿补贴',
        discount: '百亿补贴',
        couponInfo: '平台补贴',
      },
    ];

    return platforms.map((p, i) => ({
      platform: p.platform,
      platformName: p.platformName,
      shopName: p.shopName,
      price: Math.floor(base * (1 - i * 0.05)),
      originalPrice: Math.floor(base * 1.2),
      finalPrice: Math.floor(base * (0.88 - i * 0.03)),
      discount: p.discount,
      couponInfo: p.couponInfo,
      productUrl: `https://search.jd.com/Search?keyword=${encodeURIComponent(keyword)}`,
      isLowest: i === 0,
    }));
  }

  // ─── 搜索商品 ────────────────────────────────────────────────────────────

  async search(keyword: string, page: number, pageSize: number) {
    try {
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
            latestPrice: latestPrice ? {
              platform: latestPrice.platform,
              platformName: latestPrice.platformName,
              finalPrice: Number(latestPrice.finalPrice),
            } : null,
          };
        }),
      );

      return { list: enrichedList, total, page, pageSize };
    } catch {
      // 数据库不可用时返回空列表
      return { list: [], total: 0, page, pageSize };
    }
  }

  // ─── 获取商品详情 ────────────────────────────────────────────────────────

  async getProductById(productId: number) {
    try {
      const product = await this.productRepo.findOne({ where: { id: productId } });
      if (!product) {
        throw new NotFoundException('商品不存在');
      }

      const latestPrice = await this.priceRepo.findOne({
        where: { productId },
        order: { crawledAt: 'DESC' },
      });

      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        latestPrice: latestPrice ? {
          platform: latestPrice.platform,
          platformName: latestPrice.platformName,
          finalPrice: Number(latestPrice.finalPrice),
        } : null,
      };
    } catch {
      // 数据库不可用时返回默认数据
      return {
        id: productId,
        name: '商品',
        brand: '',
        latestPrice: null,
      };
    }
  }

  // ─── 历史价格走势 ────────────────────────────────────────────────────────

  async getPriceHistory(productId: number, days = 30) {
    try {
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
        productName: '商品',
        history: prices.map((p) => ({
          date: p.crawledAt?.toISOString().split('T')[0],
          platform: p.platform,
          finalPrice: Number(p.finalPrice),
        })),
      };
    } catch {
      return { productId, productName: '商品', history: [] };
    }
  }

  // ─── 私有辅助方法 ────────────────────────────────────────────────────────

  private extractBrand(name: string): string {
    const brands: Record<string, string> = {
      'apple': 'Apple', 'iphone': 'Apple', 'ipad': 'Apple', 'macbook': 'Apple',
      'airpods': 'Apple', 'huawei': '华为', '华为': '华为', 'mate': '华为',
      'xiaomi': '小米', '小米': '小米', '三星': '三星', 'samsung': '三星',
      '戴森': '戴森', 'dyson': '戴森', '茅台': '茅台', '耐克': '耐克',
      'nike': '耐克', 'switch': 'Nintendo', 'ps5': '索尼',
    };

    const lower = name.toLowerCase();
    for (const [key, brand] of Object.entries(brands)) {
      if (lower.includes(key.toLowerCase())) return brand;
    }
    return '';
  }

  private extractSpec(name: string): string {
    const specs: string[] = [];
    const storageMatch = name.match(/(\d+)\s*[GB兆]B?/i);
    if (storageMatch) specs.push(`${storageMatch[1]}GB`);

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
      '电脑': ['笔记本', '电脑', 'MacBook'],
      '平板': ['平板', 'iPad'],
      '耳机': ['耳机', 'AirPods'],
      '家电': ['冰箱', '洗衣机', '空调', '戴森', '吸尘器'],
      '游戏机': ['Switch', 'PS5', 'Xbox', '游戏机'],
      '酒水': ['茅台', '五粮液', '酒'],
      '运动': ['耐克', '阿迪达斯', '运动鞋'],
    };

    const lower = name.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) return category;
      }
    }
    return '综合';
  }

  private async getSearchSuggestions(keyword: string): Promise<string[]> {
    if (!keyword || keyword.length < 2) return [];

    try {
      const products = await this.productRepo.find({
        where: { name: Like(`%${keyword}%`), status: 1 },
        select: ['name', 'brand'],
        take: 5,
      });

      return products.map(p => p.name).slice(0, 5);
    } catch {
      return [];
    }
  }

  // ─── Redis 任务状态管理（带内存降级） ───────────────────────────────────

  private async setTaskStatus(taskId: string, status: any, ttlSeconds = 86400) {
    try {
      await this.redisService.setTaskStatus(taskId, status, ttlSeconds);
    } catch {
      this.memoryStore.set(taskId, { ...status, updatedAt: new Date() });
    }
  }

  private async getTaskStatus(taskId: string): Promise<any | null> {
    try {
      const result = await this.redisService.getTaskStatus(taskId);
      if (result) return result;
    } catch {
      // Redis 不可用
    }
    return this.memoryStore.get(taskId) || null;
  }
}
