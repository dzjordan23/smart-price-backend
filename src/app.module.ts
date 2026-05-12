import { Module, Controller, Get } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import {
  appConfig,
  jwtConfig,
  dbConfig,
  redisConfig,
  mongoConfig,
  wechatConfig,
  tencentConfig,
  crawlerConfig,
} from './config';

import { User } from './database/entities/user.entity';
import { Product, Category } from './database/entities/product.entity';
import { ProductPrice, PriceWatch } from './database/entities/price.entity';
import { PurchaseRecord } from './database/entities/purchase.entity';

import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProductModule } from './modules/product/product.module';
import { PriceModule } from './modules/price/price.module';
import { CrawlerModule } from './modules/crawler/crawler.module';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' };
  }
}

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        jwtConfig,
        dbConfig,
        redisConfig,
        mongoConfig,
        wechatConfig,
        tencentConfig,
        crawlerConfig,
      ],
    }),

    // 限流
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: 60 }, // 60次/分钟
    ]),

    // MySQL —— 支持 DATABASE_URL（Railway）或独立环境变量
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = process.env['DATABASE_URL'];
        if (databaseUrl) {
          return {
            type: 'mysql' as const,
            url: databaseUrl,
            entities: [User, Product, Category, ProductPrice, PriceWatch, PurchaseRecord],
            synchronize: true,
            charset: 'utf8mb4',
            timezone: '+08:00',
            ssl: { rejectUnauthorized: false },
          };
        }
        return {
          type: 'mysql' as const,
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.database'),
          entities: [User, Product, Category, ProductPrice, PriceWatch, PurchaseRecord],
          synchronize: config.get<string>('app.nodeEnv') !== 'production',
          logging: config.get<string>('app.nodeEnv') === 'development',
          charset: 'utf8mb4',
          timezone: '+08:00',
        };
      },
    }),

    // MongoDB 已禁用（Railway 免费账号限制，后续可通过 Atlas 接入）
    // MongooseModule.forRootAsync({ ... }),

    // 业务模块
    AuthModule,
    UserModule,
    ProductModule,
    PriceModule,
    CrawlerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
