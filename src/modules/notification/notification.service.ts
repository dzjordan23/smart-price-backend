import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { PriceWatch } from '../../database/entities/price.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import { RedisService } from '../../common/services/redis.service';

export interface PriceAlertMessage {
  openid: string;
  productId?: number;
  productName: string;
  targetPrice: number;
  currentPrice: number;
  platform: string;
  productUrl: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PriceWatch)
    private readonly watchRepo: Repository<PriceWatch>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 检查所有降价提醒
   * 定时任务调用：检查当前价格是否低于目标价格
   */
  async checkAllPriceAlerts(): Promise<{
    checked: number;
    triggered: number;
    sent: number;
    failed: number;
  }> {
    const result = { checked: 0, triggered: 0, sent: 0, failed: 0 };

    // 获取所有活跃的降价提醒
    const watches = await this.watchRepo.find({
      where: { status: 1 },
      relations: ['product'],
    });

    for (const watch of watches) {
      result.checked++;

      // 获取该商品在各平台最新价格
      const latestPrices = await this.priceRepo.find({
        where: { productId: watch.productId },
        order: { crawledAt: 'DESC' },
      });

      // 检查是否有价格低于目标价
      const platforms = watch.platforms || ['jd', 'pdd', 'taobao', 'douyin'];
      const priceBelowTarget = latestPrices.find((p) => {
        if (!platforms.includes(p.platform)) return false;
        return Number(p.finalPrice) <= Number(watch.targetPrice) && p.isAvailable === 1;
      });

      if (priceBelowTarget) {
        result.triggered++;

        // 获取用户信息
        const user = await this.userRepo.findOne({
          where: { id: watch.userId },
        });

        if (user?.openid) {
          const message: PriceAlertMessage = {
            openid: user.openid,
            productId: watch.productId,
            productName: watch.product?.name || '商品',
            targetPrice: Number(watch.targetPrice),
            currentPrice: Number(priceBelowTarget.finalPrice),
            platform: priceBelowTarget.platformName || priceBelowTarget.platform,
            productUrl: priceBelowTarget.productUrl,
          };

          try {
            await this.sendWechatTemplateMessage(message);
            result.sent++;
          } catch (err) {
            this.logger.error(`发送微信消息失败: ${(err as Error).message}`);
            result.failed++;
          }
        } else {
          this.logger.warn(`用户 ${watch.userId} 没有 openid，无法发送微信通知`);
          result.failed++;
        }
      }
    }

    return result;
  }

  /**
   * 发送微信模板消息
   */
  async sendWechatTemplateMessage(message: PriceAlertMessage): Promise<boolean> {
    const appId = this.configService.get<string>('wechat.appId');
    const secret = this.configService.get<string>('wechat.secret');

    if (!appId || !secret || appId === 'your-wechat-appid') {
      this.logger.warn('未配置微信参数，跳过消息发送');
      this.logger.log(`[Mock] 降价提醒: ${message.productName} 当前价 ${message.currentPrice}元`);
      return true;
    }

    try {
      // 获取 Access Token（已集成 Redis 缓存）
      const accessToken = await this.getAccessToken(appId, secret);

      // 微信模板消息
      const templateData = {
        touser: message.openid,
        template_id: this.configService.get<string>('wechat.priceAlertTemplateId') || 'PRICE_ALERT_TEMPLATE_ID',
        page: `pages/product/detail?id=${message.productId}`,
        data: {
          keyword1: {
            value: message.productName,
            color: '#173177',
          },
          keyword2: {
            value: `¥${message.currentPrice}`,
            color: '#e4393c',
          },
          keyword3: {
            value: message.platform,
            color: '#173177',
          },
          keyword4: {
            value: `¥${message.targetPrice}`,
            color: '#52c41a',
          },
          remark: {
            value: `点击查看详情并购买，当前价格已达到您的目标价！`,
            color: '#888888',
          },
        },
      };

      const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;
      const { data } = await axios.post(url, templateData);

      if (data.errcode && data.errcode !== 0) {
        throw new Error(`微信 API 错误: ${data.errmsg}`);
      }

      this.logger.log(`微信模板消息发送成功: ${message.productName}`);
      return true;
    } catch (err) {
      this.logger.error(`发送微信消息失败: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * 获取微信 Access Token（使用 Redis 缓存）
   */
  async getAccessToken(appId: string, secret: string): Promise<string> {
    // 优先从 Redis 缓存获取
    const cached = await this.redisService.getWechatAccessTokenOrNull();
    if (cached) {
      return cached;
    }

    // 缓存不存在，从微信 API 获取
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`;
    const { data } = await axios.get(url);

    if (data.errcode) {
      throw new Error(`获取 Access Token 失败: ${data.errmsg}`);
    }

    // 缓存到 Redis
    await this.redisService.setWechatAccessToken(data.access_token, data.expires_in);
    this.logger.log('微信 Access Token 已刷新并缓存');

    return data.access_token;
  }

  /**
   * 发送短信通知（需要第三方短信服务）
   */
  async sendSmsNotification(phone: string, message: string): Promise<boolean> {
    const smsConfig = this.configService.get('sms');

    if (!smsConfig) {
      this.logger.warn('未配置短信服务，跳过短信发送');
      this.logger.log(`[Mock SMS] 发送到 ${phone}: ${message}`);
      return true;
    }

    // TODO: 集成第三方短信服务（阿里云、腾讯云等）
    // const { SmsClient } = await import('@/common/services/sms-client');
    // const client = new SmsClient(smsConfig);
    // return client.send(phone, message);

    this.logger.warn('短信服务未实现');
    return false;
  }

  /**
   * 检查并创建新的降价提醒
   */
  async checkAndNotify(
    userId: number,
    productId: number,
    currentPrice: number,
    targetPrice: number,
    platform: string,
  ): Promise<boolean> {
    if (currentPrice > targetPrice) {
      return false;
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return false;

    const product = await this.productRepo.findOne({ where: { id: productId } });

    const alertMessage: PriceAlertMessage = {
      openid: user.openid,
      productId: productId,
      productName: product?.name || '商品',
      targetPrice,
      currentPrice,
      platform,
      productUrl: '',
    };

    return this.sendWechatTemplateMessage(alertMessage);
  }
}
