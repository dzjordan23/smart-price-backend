import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Product } from '../../database/entities/product.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { CrawlerModule } from '../crawler/crawler.module';
import { OcrModule } from '../../common/ocr.module';
import { COMPARE_QUEUE } from '../compare/compare.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductPrice]),
    // MongooseModule.forFeature 已禁用（MongoDB 暂不可用）
    CrawlerModule,
    OcrModule,
    BullModule.registerQueue({
      name: COMPARE_QUEUE,
    }),
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
