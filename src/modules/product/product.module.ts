import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Product } from '../../database/entities/product.entity';
import { ProductPrice } from '../../database/entities/price.entity';
import { ProductSnapshot, ProductSnapshotSchema } from '../../database/schemas';
import { CrawlerModule } from '../crawler/crawler.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductPrice]),
    MongooseModule.forFeature([
      { name: ProductSnapshot.name, schema: ProductSnapshotSchema },
    ]),
    CrawlerModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
