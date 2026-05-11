import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceController } from './price.controller';
import { PriceService } from './price.service';
import { PriceWatch, ProductPrice } from '../../database/entities/price.entity';
import { PurchaseRecord } from '../../database/entities/purchase.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PriceWatch, ProductPrice, PurchaseRecord])],
  controllers: [PriceController],
  providers: [PriceService],
  exports: [PriceService],
})
export class PriceModule {}
