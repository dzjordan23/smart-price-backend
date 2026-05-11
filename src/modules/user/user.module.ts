import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from '../../database/entities/user.entity';
import { PurchaseRecord } from '../../database/entities/purchase.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, PurchaseRecord])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
