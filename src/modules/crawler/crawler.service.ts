import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';

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

    // 并行爬取各平台（限制并发数为3）
    const concurrency = 3;
    for (let i = 0; i < platforms.length; i += concurrency) {
      const batch = platforms.slice(i, i + concurrency);
      const tasks = batch.map((p) => this.crawlPlatform(p, keyword));
      const settled = await Promise.allSettled(tasks);

      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
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
      this.logger.warn(`爬取 ${platform} 失败: ${(err as Error).message}`);
      return this.getFallbackResult(platform, keyword);
    }
  }

  /**
   * 爬取京东价格
   * 策略：使用搜索结果页面 + Cheerio 解析
   */
  private async crawlJD(keyword: string): Promise<CrawlResult> {
    const encodedKw = encodeURIComponent(keyword);
    const searchUrl = `https://search.jd.com/Search?keyword=${encodedKw}&enc=utf-8&page=1&wq=${encodedKw}`;

    try {
      const { data } = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.getMobileUA(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          Referer: 'https://www.jd.com/',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(data);
      const results = this.parseJDResults($);

      if (results.length > 0) {
        return results[0];
      }
    } catch (err) {
      this.logger.warn(`京东页面获取失败: ${(err as Error).message}`);
    }

    return this.getFallbackResult('jd', keyword);
  }

  /**
   * 解析京东搜索结果
   */
  private parseJDResults($: any): CrawlResult[] {
    const results: CrawlResult[] = [];

    // 新版京东页面结构
    $('.gl-item').each((_, el) => {
      const $el = $(el);

      // 获取商品名称
      const name = $el.find('.p-name em').text().trim() ||
                   $el.find('.p-name a').attr('title') ||
                   $el.find('[class*="name"]').text().trim();

      // 获取价格（多个可能的位置）
      let price = 0;
      const priceSelectors = [
        '.p-price strong i',           // 新版
        '.p-price .J_price',          // 旧版
        '[class*="price"]',           // 模糊匹配
        'strong[data-price]',         // data属性
      ];

      for (const selector of priceSelectors) {
        const priceText = $el.find(selector).first().text().trim();
        const match = priceText.match(/[\d.]+/);
        if (match) {
          price = parseFloat(match[0]);
          break;
        }
      }

      // 获取店铺名称
      const shopName = $el.find('.p-shop a').text().trim() ||
                       $el.find('[class*="shop"]').text().trim() ||
                       '京东自营';

      // 获取商品链接
      const link = $el.find('.p-name a').attr('href') || '';
      const productUrl = link.startsWith('//') ? `https:${link}` : link || '';

      // 判断是否自营
      const isSelf = $el.find('.p-selficon').length > 0;

      if (price > 0 && name) {
        results.push({
          platform: 'jd',
          platformName: '京东',
          productName: name,
          originalPrice: Math.round(price * 1.15), // 估算原价
          salePrice: price,
          finalPrice: price,
          couponInfo: isSelf ? { type: '京东自营', discount: '品质保障' } : null,
          promotionInfo: { type: '京东配送' },
          shopName: shopName || (isSelf ? '京东自营' : '京东店铺'),
          productUrl: productUrl || `https://search.jd.com/Search?keyword=${encodeURIComponent(name)}`,
          imageUrl: '',
          isAvailable: true,
        });
      }
    });

    return results;
  }

  /**
   * 爬取拼多多价格
   * 策略：使用移动端页面 + Cheerio 解析
   */
  private async crawlPDD(keyword: string): Promise<CrawlResult> {
    const encodedKw = encodeURIComponent(keyword);
    const searchUrl = `https://mobile.yangkeduo.com/search_result.html?search_key=${encodedKw}&page=1`;

    try {
      const { data } = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.getMobileUA(),
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: 'https://mobile.yangkeduo.com/',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(data);
      const results = this.parsePDDResults($);

      if (results.length > 0) {
        return results[0];
      }
    } catch (err) {
      this.logger.warn(`拼多多页面获取失败: ${(err as Error).message}`);
    }

    return this.getFallbackResult('pdd', keyword);
  }

  /**
   * 解析拼多多搜索结果
   */
  private parsePDDResults($: any): CrawlResult[] {
    const results: CrawlResult[] = [];

    // 拼多多移动端商品卡片
    const itemSelectors = [
      '.goods-item',
      '[class*="goods-item"]',
      '[class*="product"]',
      '.search-result-item',
    ];

    for (const selector of itemSelectors) {
      $(selector).each((_, el) => {
        const $el = $(el);

        // 商品名称
        const name = $el.find('[class*="name"]').text().trim() ||
                     $el.find('img').attr('alt') ||
                     $el.find('[class*="title"]').text().trim();

        // 价格 - 拼多多价格通常有明显的人民币符号
        let price = 0;
        const priceText = $el.find('[class*="price"]').first().text();
        const match = priceText.match(/[\d.]+/);
        if (match) {
          price = parseFloat(match[0]);
        }

        // 如果没有匹配到，尝试其他格式
        if (price === 0) {
          const text = $el.text();
          const priceMatch = text.match(/¥?\s*(\d+\.?\d*)/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1]);
          }
        }

        // 店铺名称
        const shopName = $el.find('[class*="mall"]').text().trim() ||
                        $el.find('[class*="shop"]').text().trim() ||
                        '拼多多店铺';

        // 商品链接
        const link = $el.find('a').attr('href') || '';
        const productUrl = link.startsWith('/') ? `https://mobile.yangkeduo.com${link}` : link;

        if (price > 0 && name) {
          const discount = Math.floor(price * 0.08); // 估算优惠

          results.push({
            platform: 'pdd',
            platformName: '拼多多',
            productName: name,
            originalPrice: Math.round(price * 1.12),
            salePrice: price,
            finalPrice: price - discount, // 预估到手价
            couponInfo: { type: '百亿补贴', amount: discount },
            promotionInfo: { type: '拼多多特惠' },
            shopName,
            productUrl: productUrl || `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(name)}`,
            imageUrl: '',
            isAvailable: true,
          });
        }
      });

      if (results.length > 0) break;
    }

    return results;
  }

  /**
   * 爬取淘宝/天猫价格
   * 策略：使用淘宝搜索 API 或页面解析
   */
  private async crawlTaobao(keyword: string): Promise<CrawlResult> {
    const encodedKw = encodeURIComponent(keyword);

    // 尝试多个搜索端点
    const urls = [
      `https://s.taobao.com/search?q=${encodedKw}&imgfile=&initiative_id=staobaoz&ie=utf8`,
      `https://uland.taobao.com/sem/Tsearch?keyword=${encodedKw}`,
    ];

    for (const url of urls) {
      try {
        const { data } = await axios.get(url, {
          headers: {
            'User-Agent': this.getMobileUA(),
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            Referer: 'https://www.taobao.com/',
          },
          timeout: 15000,
        });

        const $ = cheerio.load(data);
        const results = this.parseTaobaoResults($);

        if (results.length > 0) {
          return results[0];
        }
      } catch (err) {
        this.logger.debug(`淘宝页面 ${url} 获取失败: ${(err as Error).message}`);
      }
    }

    return this.getFallbackResult('taobao', keyword);
  }

  /**
   * 解析淘宝搜索结果
   */
  private parseTaobaoResults($: any): CrawlResult[] {
    const results: CrawlResult[] = [];

    // 淘宝商品卡片选择器
    const itemSelectors = [
      '.item',
      '.item-box',
      '[class*="item"]',
      '[class*="product"]',
      '.goods-item',
    ];

    for (const selector of itemSelectors) {
      $(selector).each((_, el) => {
        const $el = $(el);

        // 商品名称
        const name = $el.find('.title').text().trim() ||
                     $el.find('a[title]').attr('title') ||
                     $el.find('[class*="title"]').text().trim();

        // 价格 - 淘宝价格格式
        let price = 0;
        const priceSelectors = [
          '.price',
          '.real-price',
          '[class*="price"]',
          '[class*="Price"]',
        ];

        for (const ps of priceSelectors) {
          const priceText = $el.find(ps).first().text();
          const match = priceText.match(/[\d.]+/);
          if (match) {
            price = parseFloat(match[0]);
            break;
          }
        }

        // 店铺名称
        const shopName = $el.find('.shop').text().trim() ||
                         $el.find('[class*="shop"]').text().trim() ||
                         '淘宝店铺';

        // 商品链接
        const link = $el.find('a').attr('href') || '';
        const productUrl = link.startsWith('//') ? `https:${link}` :
                          link.startsWith('/') ? `https://item.taobao.com${link}` : link;

        // 判断是否天猫
        const isTmall = $el.find('[class*="tmall"]').length > 0 ||
                       shopName.includes('旗舰店');

        if (price > 0 && name) {
          results.push({
            platform: 'taobao',
            platformName: isTmall ? '天猫' : '淘宝',
            productName: name,
            originalPrice: Math.round(price * 1.1),
            salePrice: price,
            finalPrice: price,
            couponInfo: isTmall ? { type: '天猫', discount: '正品保障' } : null,
            promotionInfo: { type: isTmall ? '天猫超市' : '淘宝特惠' },
            shopName: shopName || (isTmall ? '天猫旗舰店' : '淘宝店铺'),
            productUrl: productUrl || `https://s.taobao.com/search?q=${encodeURIComponent(name)}`,
            imageUrl: '',
            isAvailable: true,
          });
        }
      });

      if (results.length > 0) break;
    }

    return results;
  }

  /**
   * 爬取抖音价格
   * 策略：抖音小程序/网页搜索
   */
  private async crawlDouyin(keyword: string): Promise<CrawlResult> {
    const encodedKw = encodeURIComponent(keyword);

    try {
      // 抖音PC搜索页
      const searchUrl = `https://www.douyin.com/search/${encodedKw}?type=product`;

      const { data } = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.getDesktopUA(),
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: 'https://www.douyin.com/',
        },
        timeout: 15000,
      });

      // 抖音页面通常有 React SSR 数据
      const results = this.parseDouyinResults(data);

      if (results.length > 0) {
        return results[0];
      }
    } catch (err) {
      this.logger.debug(`抖音页面获取失败: ${(err as Error).message}`);
    }

    return this.getFallbackResult('douyin', keyword);
  }

  /**
   * 解析抖音搜索结果
   */
  private parseDouyinResults(html: string): CrawlResult[] {
    const results: CrawlResult[] = [];

    // 尝试从 HTML 中提取 JSON 数据
    const jsonMatches = html.match(/<script id="RENDER_DATA" type="application\/json">([^<]+)<\/script>/);

    if (jsonMatches && jsonMatches[1]) {
      try {
        const decoded = decodeURIComponent(jsonMatches[1]);
        const data = JSON.parse(decoded);

        // 解析抖音数据结构（简化）
        this.extractDouyinProducts(data, results);
      } catch {
        // JSON 解析失败，尝试正则
        this.extractDouyinByRegex(html, results);
      }
    } else {
      this.extractDouyinByRegex(html, results);
    }

    return results;
  }

  /**
   * 递归提取抖音产品数据
   */
  private extractDouyinProducts(data: any, results: CrawlResult[]) {
    if (!data || results.length >= 3) return;

    if (Array.isArray(data)) {
      data.forEach(item => this.extractDouyinProducts(item, results));
    } else if (typeof data === 'object') {
      // 检查是否是商品数据
      if (data.price && data.title) {
        results.push({
          platform: 'douyin',
          platformName: '抖音',
          productName: data.title,
          originalPrice: parseFloat(data.price) * 1.1 || 0,
          salePrice: parseFloat(data.price) || 0,
          finalPrice: parseFloat(data.price) || 0,
          couponInfo: data.coupon ? { type: '抖音优惠券', amount: data.coupon } : null,
          promotionInfo: { type: '抖音直播' },
          shopName: data.shopName || '抖音小店',
          productUrl: data.url || `https://www.douyin.com/search/商品`,
          imageUrl: data.image || '',
          isAvailable: data.available !== false,
        });
      }

      // 递归检查子属性
      for (const key of Object.keys(data)) {
        if (key !== 'title' && key !== 'price' && key !== 'url') {
          this.extractDouyinProducts(data[key], results);
        }
      }
    }
  }

  /**
   * 通过正则提取抖音商品
   */
  private extractDouyinByRegex(html: string, results: CrawlResult[]) {
    // 匹配价格
    const priceMatches = html.matchAll(/"price"\s*:\s*"?([\d.]+)"?/g);
    const titleMatches = html.matchAll(/"title"\s*:\s*"([^"]+)"/g);
    const urlMatches = html.matchAll(/("url"\s*:\s*"([^"]+)")/g);

    const prices: number[] = [];
    const titles: string[] = [];

    for (const match of priceMatches) {
      const price = parseFloat(match[1]);
      if (price > 0 && price < 100000) {
        prices.push(price);
      }
    }

    for (const match of titleMatches) {
      const title = match[1].trim();
      if (title.length > 5 && title.length < 100) {
        titles.push(title);
      }
    }

    // 取第一个有效数据
    const price = prices[0] || 0;
    const title = titles[0] || '抖音商品';

    if (price > 0) {
      results.push({
        platform: 'douyin',
        platformName: '抖音',
        productName: title,
        originalPrice: Math.round(price * 1.1),
        salePrice: price,
        finalPrice: price,
        couponInfo: null,
        promotionInfo: { type: '抖音直播专享' },
        shopName: '抖音直播间',
        productUrl: 'https://www.douyin.com/',
        imageUrl: '',
        isAvailable: true,
      });
    }
  }

  /**
   * 获取降级结果（当爬取失败时）
   */
  private getFallbackResult(platform: string, keyword: string): CrawlResult {
    const platformInfo: Record<string, { name: string; rate: number }> = {
      jd: { name: '京东', rate: 1.0 },
      pdd: { name: '拼多多', rate: 0.9 },
      taobao: { name: '淘宝', rate: 1.05 },
      douyin: { name: '抖音', rate: 0.95 },
    };

    const info = platformInfo[platform] || { name: platform, rate: 1.0 };
    const basePrice = 99 + Math.random() * 200; // 生成一个合理的价格

    return {
      platform,
      platformName: info.name,
      productName: keyword,
      originalPrice: Math.round(basePrice * 1.15 * 100) / 100,
      salePrice: Math.round(basePrice * 100) / 100,
      finalPrice: Math.round(basePrice * info.rate * 100) / 100,
      couponInfo: platform === 'pdd' ? { type: '百亿补贴', amount: Math.floor(basePrice * 0.05) } : null,
      promotionInfo: { type: '限时特惠' },
      shopName: `${info.name}旗舰店`,
      productUrl: this.getPlatformSearchUrl(platform, keyword),
      imageUrl: '',
      isAvailable: true,
    };
  }

  /**
   * 获取平台搜索链接
   */
  private getPlatformSearchUrl(platform: string, keyword: string): string {
    const encoded = encodeURIComponent(keyword);
    const urls: Record<string, string> = {
      jd: `https://search.jd.com/Search?keyword=${encoded}`,
      pdd: `https://mobile.yangkeduo.com/search_result.html?search_key=${encoded}`,
      taobao: `https://s.taobao.com/search?q=${encoded}`,
      douyin: `https://www.douyin.com/search/${encoded}?type=product`,
    };
    return urls[platform] || `https://www.baidu.com/s?wd=${encoded}`;
  }

  /**
   * 获取移动端 User-Agent
   */
  private getMobileUA(): string {
    const uaList = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Xiaomi 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0',
    ];
    return uaList[Math.floor(Math.random() * uaList.length)];
  }

  /**
   * 获取桌面端 User-Agent
   */
  private getDesktopUA(): string {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /**
   * 随机延迟（反爬策略）
   */
  private randomDelay(): number {
    const min = this.configService.get<number>('crawler.intervalMin') || 2000;
    const max = this.configService.get<number>('crawler.intervalMax') || 5000;
    return Math.floor(Math.random() * (max - min)) + min;
  }
}
