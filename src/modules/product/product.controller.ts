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
import { ProductService } from './product.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { RecognizeDto, CompareDto } from './dto/product.dto';

@ApiTags('商品比价')
@ApiBearerAuth()
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('recognize')
  @ApiOperation({ summary: '识别商品（OCR/关键词）' })
  recognize(@Body() dto: RecognizeDto) {
    return this.productService.recognize(dto);
  }

  @Post('compare')
  @ApiOperation({ summary: '创建比价任务' })
  compare(@Body() dto: CompareDto) {
    return this.productService.createCompareTaskAnonymous(dto);
  }

  @Get('compare/:taskId/result')
  @ApiOperation({ summary: '查询比价结果' })
  getResult(@Param('taskId') taskId: string) {
    return this.productService.getCompareResult(taskId);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索商品' })
  search(
    @Query('keyword') keyword: string,
    @Query('page') page = 1,
    @Query('page_size') pageSize = 20,
  ) {
    return this.productService.search(keyword, +page, +pageSize);
  }

  @Get(':id/price-history')
  @ApiOperation({ summary: '历史价格走势' })
  priceHistory(
    @Param('id') id: number,
    @Query('days') days = 30,
  ) {
    return this.productService.getPriceHistory(+id, +days);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取商品详情' })
  getProduct(@Param('id') id: number) {
    return this.productService.getProductById(+id);
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
