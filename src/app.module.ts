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

    // MySQL —— 支持 DATABASE_URL / Railway MYSQLHOST* / 自定义 DB_* / 本地默认值
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get('database') as any;
        const host = db.host;
        const port = db.port;
        console.log(`[DB] Connecting to ${host}:${port}, database=${db.database}, user=${db.username}`);

        const opts: Record<string, any> = {
          type: 'mysql',
          host,
          port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities: [User, Product, Category, ProductPrice, PriceWatch, PurchaseRecord],
          synchronize: true,
          charset: 'utf8mb4',
          timezone: '+08:00',
        };

        // 如果有完整 URL（DATABASE_URL），直接用 url 连接
        if (db.url) {
          opts.url = db.url;
          delete opts.host;
          delete opts.port;
          delete opts.username;
          delete opts.password;
          delete opts.database;
          opts.ssl = { rejectUnauthorized: false };
        }

        // Railway 内网连接不需要 SSL
        if (host && (host.includes('.railway.app') || host.includes('.railway.internal'))) {
          delete opts.ssl;
        }

        return opts;
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
