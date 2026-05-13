import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompareProcessor, COMPARE_QUEUE } from './compare.processor';
import { Product } from '../../database/entities/product.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { CrawlerModule } from '../crawler/crawler.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: COMPARE_QUEUE,
    }),
    TypeOrmModule.forFeature([Product, ProductPrice]),
    CrawlerModule,
  ],
  providers: [CompareProcessor],
  exports: [BullModule],
})
export class CompareModule {}
