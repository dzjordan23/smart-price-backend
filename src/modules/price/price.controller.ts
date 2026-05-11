import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PriceService } from './price.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { IsArray, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class AddWatchDto {
  @ApiProperty() productId: number;
  @ApiProperty() targetPrice: number;
  @ApiProperty({ isArray: true, required: false }) @IsOptional() @IsArray() platforms?: string[];
}

class ConfirmPurchaseDto {
  @ApiProperty() @IsNumber() productId: number;
  @ApiProperty() @IsNumber() priceId: number;
  @ApiProperty() platform: string;
}

@ApiTags('价格监控')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Post('products/:productId/watch')
  @ApiOperation({ summary: '添加降价提醒' })
  addWatch(
    @CurrentUser() user: User,
    @Param('productId') productId: number,
    @Body() dto: AddWatchDto,
  ) {
    return this.priceService.addWatch(
      user.id,
      +productId,
      dto.targetPrice,
      dto.platforms || [],
    );
  }

  @Get('user/watchlist')
  @ApiOperation({ summary: '我的降价提醒列表' })
  getWatchList(
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('page_size') pageSize = 20,
  ) {
    return this.priceService.getWatchList(user.id, +page, +pageSize);
  }

  @Post('orders/confirm')
  @ApiOperation({ summary: '确认购买（记录返利）' })
  confirmPurchase(@CurrentUser() user: User, @Body() dto: ConfirmPurchaseDto) {
    return this.priceService.confirmPurchase(
      user.id,
      dto.productId,
      dto.priceId,
      dto.platform,
    );
  }
}
