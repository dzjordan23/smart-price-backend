import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledTasksService } from './services/scheduled-tasks.service';
import { PriceWatch } from '../database/entities/price.entity';
import { ProductPrice } from '../database/entities/price.entity';
import { Product } from '../database/entities/product.entity';
import { NotificationModule } from '../modules/notification/notification.module';
import { CrawlerModule } from '../modules/crawler/crawler.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceWatch, ProductPrice, Product]),
    NotificationModule,
    CrawlerModule,
  ],
  providers: [ScheduledTasksService],
  exports: [ScheduledTasksService],
})
export class ScheduledTasksModule {}
