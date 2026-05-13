import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private memoryFallback = new Map<string, { value: string; expireAt?: number }>();
  private readonly CACHE_PREFIX = 'sp:';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('redis') as any;

    this.client = new Redis({
      host: redisConfig.host || 'localhost',
      port: redisConfig.port || 6379,
      password: redisConfig.password || undefined,
      db: redisConfig.db || 0,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.warn('Redis 连接失败，使用内存降级');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis 错误: ${err.message}`);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis 连接成功');
    });

    try {
      await this.client.connect();
    } catch {
      this.logger.warn('Redis 连接失败，将使用内存降级');
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  // ─── 基础操作 ────────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // 静默失败
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      // 静默失败
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch {
      return false;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch {
      // 静默失败
    }
  }

  // ─── Hash 操作 ────────────────────────────────────────────────────────────

  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch {
      return null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    try {
      await this.client.hset(key, field, value);
    } catch {
      // 静默失败
    }
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    try {
      return await this.client.hgetall(key);
    } catch {
      return null;
    }
  }

  async hdel(key: string, field: string): Promise<void> {
    try {
      await this.client.hdel(key, field);
    } catch {
      // 静默失败
    }
  }

  async hexists(key: string, field: string): Promise<boolean> {
    try {
      const result = await this.client.hexists(key, field);
      return result === 1;
    } catch {
      return false;
    }
  }

  // ─── 队列操作（用于比价任务） ─────────────────────────────────────────────

  /**
   * 存储任务状态
   * @param taskId 任务ID
   * @param status 任务状态
   * @param ttlSeconds 过期时间（秒），默认24小时
   */
  async setTaskStatus(
    taskId: string,
    status: any,
    ttlSeconds = 86400,
  ): Promise<void> {
    const key = `task:${taskId}`;
    const value = JSON.stringify({
      ...status,
      updatedAt: new Date().toISOString(),
    });

    await this.set(key, value, ttlSeconds);
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<any | null> {
    const key = `task:${taskId}`;
    const value = await this.get(key);

    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  /**
   * 删除任务状态
   */
  async deleteTaskStatus(taskId: string): Promise<void> {
    const key = `task:${taskId}`;
    await this.del(key);
  }

  /**
   * 获取任务过期时间
   */
  async getTaskTTL(taskId: string): Promise<number> {
    const key = `task:${taskId}`;
    try {
      return await this.client.ttl(key);
    } catch {
      return -1;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                         缓存策略完善
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 商品价格缓存 ──────────────────────────────────────────────────────────

  /**
   * 缓存商品最新价格（5分钟过期）
   */
  async setProductPrice(productId: number, platform: string, priceData: any): Promise<void> {
    const key = `product:price:${productId}:${platform}`;
    const ttlSeconds = 300; // 5分钟
    await this.set(key, JSON.stringify(priceData), ttlSeconds);
  }

  /**
   * 获取商品平台价格缓存
   */
  async getProductPrice(productId: number, platform: string): Promise<any | null> {
    const key = `product:price:${productId}:${platform}`;
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  /**
   * 批量获取商品所有平台价格
   */
  async getAllProductPrices(productId: number): Promise<Record<string, any>> {
    const keyPattern = `product:price:${productId}:*`;
    try {
      const keys = await this.client.keys(keyPattern);
      if (!keys || keys.length === 0) return {};

      const result: Record<string, any> = {};
      for (const key of keys) {
        const platform = key.split(':').pop() || '';
        const value = await this.client.get(key);
        if (value) {
          result[platform] = JSON.parse(value);
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  /**
   * 清除商品价格缓存
   */
  async clearProductPriceCache(productId: number): Promise<void> {
    const keyPattern = `product:price:${productId}:*`;
    try {
      const keys = await this.client.keys(keyPattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      // 静默失败
    }
  }

  // ─── 微信 AccessToken 缓存 ────────────────────────────────────────────────

  private readonly WECHAT_ACCESS_TOKEN_KEY = 'wechat:access_token';

  /**
   * 缓存微信 AccessToken
   * @param token access_token
   * @param expiresIn 过期时间（秒），微信默认7200秒
   */
  async setWechatAccessToken(token: string, expiresIn = 7200): Promise<void> {
    // 提前5分钟过期，避免边界问题
    const ttlSeconds = Math.max(expiresIn - 300, 60);
    await this.set(this.WECHAT_ACCESS_TOKEN_KEY, token, ttlSeconds);
    this.logger.debug(`微信 AccessToken 已缓存，TTL: ${ttlSeconds}秒`);
  }

  /**
   * 获取微信 AccessToken
   */
  async getWechatAccessToken(): Promise<string | null> {
    return await this.get(this.WECHAT_ACCESS_TOKEN_KEY);
  }

  /**
   * 清除微信 AccessToken（强制刷新时使用）
   */
  async clearWechatAccessToken(): Promise<void> {
    await this.del(this.WECHAT_ACCESS_TOKEN_KEY);
  }

  /**
   * 尝试获取 AccessToken，如果不存在返回 null（不自动刷新）
   */
  async getWechatAccessTokenOrNull(): Promise<string | null> {
    try {
      const token = await this.client.get(this.WECHAT_ACCESS_TOKEN_KEY);
      if (token) {
        this.logger.debug('从缓存获取微信 AccessToken 成功');
      }
      return token;
    } catch {
      return null;
    }
  }

  // ─── 商品搜索结果缓存 ─────────────────────────────────────────────────────

  /**
   * 缓存搜索结果（10分钟过期）
   */
  async setSearchResult(keyword: string, results: any[]): Promise<void> {
    const key = `search:${this.normalizeKeyword(keyword)}`;
    const ttlSeconds = 600; // 10分钟
    await this.set(key, JSON.stringify(results), ttlSeconds);
  }

  /**
   * 获取搜索结果缓存
   */
  async getSearchResult(keyword: string): Promise<any[] | null> {
    const key = `search:${this.normalizeKeyword(keyword)}`;
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  /**
   * 清除搜索缓存
   */
  async clearSearchCache(): Promise<void> {
    const keyPattern = 'search:*';
    try {
      const keys = await this.client.keys(keyPattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        this.logger.log(`已清除 ${keys.length} 条搜索缓存`);
      }
    } catch {
      // 静默失败
    }
  }

  // ─── 热点商品数据预热 ─────────────────────────────────────────────────────

  private readonly HOT_PRODUCTS_KEY = 'product:hot:list';
  private readonly HOT_PRODUCTS_TTL = 3600; // 1小时

  /**
   * 设置热点商品列表
   */
  async setHotProducts(productIds: number[]): Promise<void> {
    await this.set(this.HOT_PRODUCTS_KEY, JSON.stringify(productIds), this.HOT_PRODUCTS_TTL);
  }

  /**
   * 获取热点商品列表
   */
  async getHotProducts(): Promise<number[] | null> {
    const value = await this.get(this.HOT_PRODUCTS_KEY);
    return value ? JSON.parse(value) : null;
  }

  /**
   * 标记商品为热点（增加热度）
   */
  async incrementProductHotScore(productId: number): Promise<number> {
    const key = `product:hot:score:${productId}`;
    try {
      const score = await this.client.zincrby(key, 1, productId.toString());
      // 设置过期时间（如果不存在）
      await this.client.expire(key, 86400); // 24小时
      return parseFloat(score);
    } catch {
      return 0;
    }
  }

  /**
   * 获取商品热度分数
   */
  async getProductHotScore(productId: number): Promise<number> {
    const key = `product:hot:score:${productId}`;
    try {
      const score = await this.client.zscore(key, productId.toString());
      return score ? parseFloat(score) : 0;
    } catch {
      return 0;
    }
  }

  // ─── 缓存工具方法 ─────────────────────────────────────────────────────────

  /**
   * 规范化关键词（用于缓存 key）
   */
  private normalizeKeyword(keyword: string): string {
    return keyword.toLowerCase().trim().replace(/\s+/g, '-');
  }

  /**
   * 获取缓存命中率统计
   */
  async getCacheStats(): Promise<{ keys: number; memory: string }> {
    try {
      const info = await this.client.info('memory');
      const keysCount = await this.client.dbsize();
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      return {
        keys: keysCount,
        memory: memoryMatch ? memoryMatch[1] : 'unknown',
      };
    } catch {
      return {
        keys: this.memoryFallback.size,
        memory: 'unavailable',
      };
    }
  }

  /**
   * 健康检查
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
