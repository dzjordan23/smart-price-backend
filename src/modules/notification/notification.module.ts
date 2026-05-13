import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { User } from '../../database/entities/user.entity';
import { Product } from '../../database/entities/product.entity';
import { PriceWatch } from '../../database/entities/price.entity';
import { ProductPrice } from '../../database/entities/price.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Product, PriceWatch, ProductPrice]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
