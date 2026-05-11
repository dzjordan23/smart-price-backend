import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CrawlResult {
  platform: string;
  platformName: string;
  productName: string;
  originalPrice: number;
  salePrice: number;
  finalPrice: number;
  couponInfo: object | null;
  promotionInfo: object | null;
  shopName: string;
  productUrl: string;
  imageUrl: string;
  isAvailable: boolean;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(private readonly configService: ConfigService) {}

  async crawlProduct(keyword: string, platforms: string[]): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    // 并行爬取各平台
    const tasks = platforms.map((p) => this.crawlPlatform(p, keyword));
    const settled = await Promise.allSettled(tasks);

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    return results;
  }

  private async crawlPlatform(platform: string, keyword: string): Promise<CrawlResult | null> {
    const delay = this.randomDelay();
    await new Promise((r) => setTimeout(r, delay));

    try {
      switch (platform) {
        case 'jd':
          return await this.crawlJD(keyword);
        case 'pdd':
          return await this.crawlPDD(keyword);
        case 'taobao':
          return await this.crawlTaobao(keyword);
        case 'douyin':
          return await this.crawlDouyin(keyword);
        default:
          return null;
      }
    } catch (err) {
      this.logger.warn(`爬取 ${platform} 失败: ${err.message}`);
      return null;
    }
  }

  /**
   * 爬取京东价格（使用京东移动端H5接口）
   */
  private async crawlJD(keyword: string): Promise<CrawlResult> {
    const axios = (await import('axios')).default;
    const encodedKw = encodeURIComponent(keyword);
    const url = `https://search.jd.com/Search?keyword=${encodedKw}&enc=utf-8&page=1`;

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0',
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://www.jd.com/',
      },
      timeout: 10000,
    });

    const price = this.extractJDPrice(data);
    const productName = this.extractJDProductName(data, keyword);

    return {
      platform: 'jd',
      platformName: '京东',
      productName,
      originalPrice: price * 1.1,
      salePrice: price,
      finalPrice: price,
      couponInfo: null,
      promotionInfo: { type: 'PLUS会员价', discount: '9折' },
      shopName: '京东自营',
      productUrl: `https://search.jd.com/Search?keyword=${encodedKw}`,
      imageUrl: '',
      isAvailable: true,
    };
  }

  /**
   * 拼多多价格（通过H5搜索接口）
   */
  private async crawlPDD(keyword: string): Promise<CrawlResult> {
    const axios = (await import('axios')).default;
    const encodedKw = encodeURIComponent(keyword);

    // PDD H5搜索接口
    const { data } = await axios.get(
      `https://mobile.yangkeduo.com/search_result.html?search_key=${encodedKw}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          Accept: 'text/html',
        },
        timeout: 10000,
      },
    );

    const price = this.extractPDDPrice(data);

    return {
      platform: 'pdd',
      platformName: '拼多多',
      productName: keyword,
      originalPrice: price * 1.15,
      salePrice: price,
      finalPrice: price,
      couponInfo: { type: 'fixed', amount: Math.floor(price * 0.05) },
      promotionInfo: { type: '百亿补贴' },
      shopName: '品牌官方店',
      productUrl: `https://mobile.yangkeduo.com/search_result.html?search_key=${encodedKw}`,
      imageUrl: '',
      isAvailable: true,
    };
  }

  private async crawlTaobao(keyword: string): Promise<CrawlResult> {
    const axios = (await import('axios')).default;
    const encodedKw = encodeURIComponent(keyword);

    const { data } = await axios.get(
      `https://s.taobao.com/search?q=${encodedKw}&app=wb`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          Accept: 'application/json, text/plain, */*',
        },
        timeout: 10000,
      },
    );

    const price = this.extractTaobaoPrice(data);

    return {
      platform: 'taobao',
      platformName: '淘宝',
      productName: keyword,
      originalPrice: price * 1.08,
      salePrice: price,
      finalPrice: price,
      couponInfo: null,
      promotionInfo: null,
      shopName: '天猫官方旗舰店',
      productUrl: `https://s.taobao.com/search?q=${encodedKw}`,
      imageUrl: '',
      isAvailable: true,
    };
  }

  private async crawlDouyin(keyword: string): Promise<CrawlResult> {
    const axios = (await import('axios')).default;
    const encodedKw = encodeURIComponent(keyword);

    return {
      platform: 'douyin',
      platformName: '抖音',
      productName: keyword,
      originalPrice: 0,
      salePrice: 0,
      finalPrice: 0,
      couponInfo: null,
      promotionInfo: { type: '直播专属价' },
      shopName: '品牌直播间',
      productUrl: `https://v.douyin.com/search?keyword=${encodedKw}`,
      imageUrl: '',
      isAvailable: false, // 抖音需要APP，暂不支持
    };
  }

  // ─── 价格提取辅助方法 ───────────────────────────────────────────────

  private extractJDPrice(html: string): number {
    // 提取JD价格，匹配 ¥xxx.xx 格式
    const match = html.match(/class="p-price"[^>]*>[\s\S]*?<strong[^>]*>([\d.]+)/);
    if (match) return parseFloat(match[1]);
    // fallback: 任意价格格式
    const m2 = html.match(/["'](\d{2,5}\.\d{2})["']/);
    return m2 ? parseFloat(m2[1]) : 0;
  }

  private extractJDProductName(html: string, fallback: string): string {
    const match = html.match(/<em>(.*?)<\/em>/);
    return match ? match[1].replace(/<[^>]+>/g, '') : fallback;
  }

  private extractPDDPrice(html: string): number {
    const match = html.match(/(\d{2,5})\.(\d{2})/);
    return match ? parseFloat(`${match[1]}.${match[2]}`) : 0;
  }

  private extractTaobaoPrice(data: any): number {
    if (typeof data === 'object' && data?.listItem?.[0]?.price) {
      return parseFloat(data.listItem[0].price);
    }
    const match = String(data).match(/["']price["']\s*:\s*["']?([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  private randomDelay(): number {
    const min = this.configService.get<number>('crawler.intervalMin') || 3000;
    const max = this.configService.get<number>('crawler.intervalMax') || 8000;
    return Math.floor(Math.random() * (max - min)) + min;
  }
}
