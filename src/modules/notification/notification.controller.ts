import { Controller, Post, Get, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('通知模块')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('check-prices')
  @ApiOperation({ summary: '手动触发价格检查（管理员接口）' })
  async checkPrices() {
    const result = await this.notificationService.checkAllPriceAlerts();
    return {
      code: 0,
      message: '价格检查完成',
      data: result,
    };
  }

  @Post('test-wechat')
  @ApiOperation({ summary: '测试微信消息发送' })
  async testWechatMessage(@Body() body: { openid: string; productName: string }) {
    const result = await this.notificationService.sendWechatTemplateMessage({
      openid: body.openid || 'test_openid',
      productName: body.productName || '测试商品',
      targetPrice: 99.00,
      currentPrice: 79.00,
      platform: '京东',
      productUrl: 'https://www.jd.com',
    });

    return {
      code: 0,
      message: result ? '消息发送成功' : '消息发送失败',
      data: { sent: result },
    };
  }
}
