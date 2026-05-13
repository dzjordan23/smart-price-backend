import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

export interface OcrResult {
  /** 识别到的文字内容 */
  text: string;
  /** 商品名称（智能提取） */
  productName: string;
  /** 品牌（智能提取） */
  brand: string;
  /** 规格型号（智能提取） */
  spec: string;
  /** 原始识别结果 */
  rawData: any;
  /** 置信度 */
  confidence: number;
}

export interface OcrRequest {
  /** 图片 URL */
  imageUrl?: string;
  /** 图片 Base64 */
  imageBase64?: string;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 通用文字识别
   */
  async recognizeText(imageUrl?: string, imageBase64?: string): Promise<string> {
    const result = await this.callTencentOcr('general', imageUrl, imageBase64);
    return result;
  }

  /**
   * 商品识别（智能提取商品信息）
   * 自动识别商品名称、品牌、规格
   */
  async recognizeProduct(req: OcrRequest): Promise<OcrResult> {
    try {
      // 1. 先进行通用文字识别
      const text = await this.recognizeText(req.imageUrl, req.imageBase64);

      if (!text || text.trim().length === 0) {
        return this.emptyResult('未能识别到文字内容');
      }

      // 2. 智能提取商品信息
      const productInfo = this.extractProductInfo(text);

      return {
        text,
        productName: productInfo.name,
        brand: productInfo.brand,
        spec: productInfo.spec,
        rawData: { originalText: text },
        confidence: productInfo.confidence,
      };
    } catch (error) {
      this.logger.error(`商品识别失败: ${error}`);
      return this.emptyResult(`识别失败: ${error}`);
    }
  }

  /**
   * 调用腾讯云 OCR API
   */
  private async callTencentOcr(
    type: 'general' | 'accurate' | 'handwriting',
    imageUrl?: string,
    imageBase64?: string,
  ): Promise<string> {
    const secretId = this.configService.get<string>('tencent.secretId');
    const secretKey = this.configService.get<string>('tencent.secretKey');
    const region = this.configService.get<string>('tencent.region') || 'ap-guangzhou';

    if (!secretId || !secretKey || secretId === 'your-tencent-secret-id') {
      this.logger.warn('未配置腾讯云 OCR 参数，使用模拟数据');
      return this.getMockOcrResult();
    }

    try {
      // 腾讯云 OCR API 端点
      const endpoint = 'ocr.tencentcloudapi.com';
      const action = type === 'general' ? 'GeneralBasicOCR' :
                     type === 'accurate' ? 'AccurateBasicOCR' : 'HandwritingOCR';

      // 构建请求参数
      const payload: any = {};
      if (imageUrl) {
        payload.ImageUrl = imageUrl;
      } else if (imageBase64) {
        payload.ImageBase64 = imageBase64;
      } else {
        throw new Error('必须提供 imageUrl 或 imageBase64');
      }

      // 生成签名
      const timestamp = Math.floor(Date.now() / 1000);
      const { signature, authorization } = this.generateSignature(
        secretId,
        secretKey,
        action,
        region,
        timestamp,
      );

      // 发送请求
      const response = await axios.post(
        `https://${endpoint}`,
        {
          Action: action,
          Version: '2018-11-19',
          Region: region,
          Timestamp: timestamp,
         Nonce: Math.floor(Math.random() * 1000000),
          Signature: signature,
          Authorization: authorization,
          ...payload,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-TC-Action': action,
            'X-TC-Version': '2018-11-19',
            'X-TC-Region': region,
            'X-TC-Timestamp': timestamp.toString(),
            'X-TC-Nonce': Math.floor(Math.random() * 1000000).toString(),
            'X-TC-Signature': signature,
          },
        },
      );

      // 解析响应
      if (response.data.Response && response.data.Response.TextDetections) {
        return response.data.Response.TextDetections
          .map((item: any) => item.DetectedText)
          .filter(Boolean)
          .join('\n');
      }

      return '';
    } catch (error) {
      this.logger.error(`腾讯云 OCR 调用失败: ${error}`);
      return this.getMockOcrResult();
    }
  }

  /**
   * 生成腾讯云 API 签名
   */
  private generateSignature(
    secretId: string,
    secretKey: string,
    action: string,
    region: string,
    timestamp: number,
  ): { signature: string; authorization: string } {
    const canonicalRequest = `POST\nocr.tencentcloudapi.com\n/\nAction=${action}&Region=${region}&Timestamp=${timestamp}`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${Math.floor(timestamp / 3600)}000\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

    const date = new Date(timestamp * 1000).toISOString().split('T')[0];
    const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
    const secretSigning = crypto.createHmac('sha256', secretDate).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${date}/ocr/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`;

    return { signature, authorization };
  }

  /**
   * 智能提取商品信息
   */
  private extractProductInfo(text: string): {
    name: string;
    brand: string;
    spec: string;
    confidence: number;
  } {
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    const fullText = text.toLowerCase();

    let name = '';
    let brand = '';
    let spec = '';
    let confidence = 0.5;

    // 品牌识别
    const brands = [
      'Apple', 'iPhone', 'Samsung', '华为', '小米', 'OPPO', 'vivo', '荣耀',
      '联想', 'ThinkPad', '戴尔', 'DELL', 'HP', '索尼', 'Sony', '格力', '美的',
      '海尔', '九阳', '苏泊尔', '耐克', '阿迪达斯', '彪马', 'PUMA', 'Nike', 'Adidas',
      'OPPO', 'vivo', '一加', 'OnePlus', 'realme', '红米', 'Redmi',
    ];

    for (const b of brands) {
      if (fullText.includes(b.toLowerCase())) {
        brand = b;
        confidence += 0.1;
        break;
      }
    }

    // 商品名称提取（通常是第一行或包含品牌的那行）
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 3 && trimmed.length < 100) {
        // 排除价格行
        if (!/^\d+(\.\d+)?[元¥￥]?$/.test(trimmed)) {
          name = trimmed;
          confidence += 0.2;
          break;
        }
      }
    }

    // 规格识别
    const specPatterns = [
      /(\d+)[GB兆]B?/gi, // 存储规格
      /(\d+)(英寸|寸|吋)/gi, // 屏幕尺寸
      /([红绿蓝黑白金银]色)/gi, // 颜色
      /((?:8|12|16|24|32)GB)/gi, // 内存
      /((?:128|256|512|1024)GB)/gi, // 存储
    ];

    const specs: string[] = [];
    for (const pattern of specPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        specs.push(...matches);
      }
    }
    spec = [...new Set(specs)].slice(0, 3).join(' / ');

    // 如果没有识别到品牌，尝试从名称中提取
    if (!brand && name) {
      for (const b of brands) {
        if (name.toLowerCase().includes(b.toLowerCase())) {
          brand = b;
          break;
        }
      }
    }

    return { name: name || text.slice(0, 50), brand, spec, confidence: Math.min(confidence, 0.95) };
  }

  /**
   * 生成模拟 OCR 结果（开发环境使用）
   */
  private getMockOcrResult(): string {
    const mockProducts = [
      'iPhone 15 Pro Max 256GB 蓝色钛金属',
      'Apple iPhone 15 Pro',
      '华为Mate 60 Pro 12GB+512GB 雅丹黑',
      '小米14 Pro 骁龙8Gen3 徕卡影像',
      '戴森 Dyson V15 吸尘器',
      '飞利浦电动牙刷HX9911',
    ];
    return mockProducts[Math.floor(Math.random() * mockProducts.length)];
  }

  /**
   * 创建空的识别结果
   */
  private emptyResult(error: string): OcrResult {
    return {
      text: '',
      productName: '',
      brand: '',
      spec: '',
      rawData: { error },
      confidence: 0,
    };
  }
}
